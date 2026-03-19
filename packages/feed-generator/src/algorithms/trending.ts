import { CronJob } from 'cron';
import { executeRawSql } from '../db.js';
import { sql } from 'drizzle-orm';

export class TrendingCalculator {
  private job: CronJob;

  constructor() {
    // Run every 5 minutes
    this.job = new CronJob('*/5 * * * *', () => this.calculate(), null, false);
  }

  start() {
    this.job.start();
    // Also run immediately on start
    this.calculate();
  }

  stop() {
    this.job.stop();
  }

  async calculate() {
    console.log('Calculating trending scores...');

    try {
      // Calculate trending scores for videos from the last 48 hours
      // Score = (views*0.1 + likes + comments*2 + shares*3) / hours_since_post^1.5
      // Plus velocity bonus for recently engaging content

      await executeRawSql(sql`
        WITH video_scores AS (
          SELECT
            v.uri,
            v.author_did,
            v.view_count,
            v.like_count,
            v.comment_count,
            v.share_count,
            v.created_at,
            EXTRACT(EPOCH FROM (NOW() - v.created_at)) / 3600 AS hours_old,
            -- Base engagement score
            (v.view_count * 0.1 + v.like_count + v.comment_count * 2 + v.share_count * 3) AS engagement,
            -- Recent engagement (last hour)
            COALESCE((
              SELECT COUNT(*)
              FROM user_interactions ui
              WHERE ui.video_uri = v.uri
                AND ui.created_at > NOW() - INTERVAL '1 hour'
                AND ui.interaction_type IN ('like', 'comment', 'share')
            ), 0) AS recent_engagement
          FROM videos v
          WHERE v.created_at > NOW() - INTERVAL '48 hours'
            AND v.visibility = 'public'
        ),
        ranked_videos AS (
          SELECT
            uri,
            -- Trending score with time decay, velocity bonus, and did:exprsn identity boost
            ((engagement / POWER(GREATEST(hours_old, 1) + 2, 1.5)) + (recent_engagement * 10 / GREATEST(hours_old, 1)))
              * CASE WHEN v.author_did LIKE 'did:exprsn:%' THEN 1.15 ELSE 1.0 END AS score,
            recent_engagement / GREATEST(hours_old, 1) AS velocity,
            ROW_NUMBER() OVER (ORDER BY
              ((engagement / POWER(GREATEST(hours_old, 1) + 2, 1.5)) + (recent_engagement * 10 / GREATEST(hours_old, 1)))
                * CASE WHEN v.author_did LIKE 'did:exprsn:%' THEN 1.15 ELSE 1.0 END
              DESC
            ) AS rank
          FROM video_scores v
        )
        INSERT INTO trending_videos (video_uri, score, velocity, rank, updated_at)
        SELECT uri, score, velocity, rank, NOW()
        FROM ranked_videos
        WHERE rank <= 1000
        ON CONFLICT (video_uri) DO UPDATE SET
          score = EXCLUDED.score,
          velocity = EXCLUDED.velocity,
          rank = EXCLUDED.rank,
          updated_at = NOW()
      `);

      // Clean up old entries no longer in top 1000
      await executeRawSql(sql`
        DELETE FROM trending_videos
        WHERE updated_at < NOW() - INTERVAL '10 minutes'
      `);

      console.log('Trending calculation complete');
    } catch (error) {
      console.error('Error calculating trending:', error);
    }
  }
}
