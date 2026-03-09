import { CronJob } from 'cron';
import { dbType, executeRawSql, db } from '../db.js';
import { sql, eq, lte, and, inArray } from 'drizzle-orm';

export class ChallengeLeaderboardCalculator {
  private leaderboardJob: CronJob;
  private statusJob: CronJob;

  constructor() {
    // Update leaderboards every 2 minutes
    this.leaderboardJob = new CronJob('*/2 * * * *', () => this.updateLeaderboards(), null, false);
    // Update challenge statuses every hour
    this.statusJob = new CronJob('0 * * * *', () => this.updateStatuses(), null, false);
  }

  start() {
    this.leaderboardJob.start();
    this.statusJob.start();
    // Run immediately on start
    this.updateLeaderboards();
    this.updateStatuses();
  }

  stop() {
    this.leaderboardJob.stop();
    this.statusJob.stop();
  }

  async updateLeaderboards() {
    console.log('Updating challenge leaderboards...');

    if (dbType === 'sqlite') {
      console.log('Challenge leaderboard skipped (SQLite mode - use PostgreSQL for full functionality)');
      return;
    }

    try {
      // Update engagement scores and ranks for all active/voting challenges
      await executeRawSql(sql`
        WITH video_stats AS (
          SELECT
            ce.id AS entry_id,
            ce.challenge_id,
            v.view_count,
            v.like_count,
            v.comment_count,
            v.share_count,
            -- Weighted engagement score: likes + comments*2 + shares*3 + views*0.01
            (v.like_count + v.comment_count * 2 + v.share_count * 3 + v.view_count * 0.01) AS score
          FROM challenge_entries ce
          JOIN videos v ON ce.video_uri = v.uri
          JOIN challenges c ON ce.challenge_id = c.id
          WHERE c.status IN ('active', 'voting')
        ),
        ranked_entries AS (
          SELECT
            entry_id,
            challenge_id,
            view_count,
            like_count,
            comment_count,
            share_count,
            score,
            ROW_NUMBER() OVER (
              PARTITION BY challenge_id
              ORDER BY score DESC
            ) AS rank
          FROM video_stats
        )
        UPDATE challenge_entries ce SET
          view_count = re.view_count,
          like_count = re.like_count,
          comment_count = re.comment_count,
          share_count = re.share_count,
          engagement_score = re.score,
          rank = re.rank,
          updated_at = NOW()
        FROM ranked_entries re
        WHERE ce.id = re.entry_id
      `);

      // Update challenge totals
      await executeRawSql(sql`
        UPDATE challenges c SET
          total_views = COALESCE((
            SELECT SUM(view_count)
            FROM challenge_entries ce
            WHERE ce.challenge_id = c.id
          ), 0),
          total_engagement = COALESCE((
            SELECT SUM(like_count + comment_count + share_count)
            FROM challenge_entries ce
            WHERE ce.challenge_id = c.id
          ), 0),
          updated_at = NOW()
        WHERE c.status IN ('active', 'voting')
      `);

      // Update best rank for participants
      await executeRawSql(sql`
        UPDATE challenge_participation cp SET
          best_rank = (
            SELECT MIN(rank)
            FROM challenge_entries ce
            WHERE ce.challenge_id = cp.challenge_id
              AND ce.user_did = cp.user_did
              AND ce.rank IS NOT NULL
          )
        WHERE EXISTS (
          SELECT 1 FROM challenges c
          WHERE c.id = cp.challenge_id
            AND c.status IN ('active', 'voting')
        )
      `);

      console.log('Challenge leaderboards updated');
    } catch (error) {
      console.error('Error updating challenge leaderboards:', error);
    }
  }

  async updateStatuses() {
    console.log('Updating challenge statuses...');

    if (dbType === 'sqlite') {
      console.log('Challenge status update skipped (SQLite mode)');
      return;
    }

    try {
      const now = new Date().toISOString();

      // Upcoming -> Active (when startAt is reached)
      await executeRawSql(sql`
        UPDATE challenges SET
          status = 'active',
          updated_at = NOW()
        WHERE status = 'upcoming'
          AND start_at <= ${now}
      `);

      // Active -> Voting (if voting period exists and endAt is reached)
      await executeRawSql(sql`
        UPDATE challenges SET
          status = 'voting',
          updated_at = NOW()
        WHERE status = 'active'
          AND end_at <= ${now}
          AND voting_end_at IS NOT NULL
      `);

      // Active -> Ended (no voting period and endAt is reached)
      await executeRawSql(sql`
        UPDATE challenges SET
          status = 'ended',
          updated_at = NOW()
        WHERE status = 'active'
          AND end_at <= ${now}
          AND voting_end_at IS NULL
      `);

      // Voting -> Ended (when votingEndAt is reached)
      await executeRawSql(sql`
        UPDATE challenges SET
          status = 'ended',
          updated_at = NOW()
        WHERE status = 'voting'
          AND voting_end_at <= ${now}
      `);

      console.log('Challenge statuses updated');
    } catch (error) {
      console.error('Error updating challenge statuses:', error);
    }
  }
}
