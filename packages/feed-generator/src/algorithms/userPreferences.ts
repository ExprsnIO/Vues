import { CronJob } from 'cron';
import { executeRawSql } from '../db.js';
import { sql } from 'drizzle-orm';

/**
 * User Preferences Calculator
 *
 * Runs every 15 minutes to compute and cache user feed preferences
 * based on engagement data from the last 7 days.
 *
 * This pre-computes preferences for active users so that FYP generation
 * is fast at request time.
 */
export class UserPreferencesCalculator {
  private job: CronJob;

  constructor() {
    // Run every 15 minutes
    this.job = new CronJob('*/15 * * * *', () => this.calculate(), null, false);
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
    console.log('Calculating user preferences...');

    try {
      // Process users who have had interactions in the last hour
      // or whose preferences haven't been updated in 30 minutes
      await this.computePreferencesForActiveUsers();

      console.log('User preferences calculation complete');
    } catch (error) {
      console.error('Error calculating user preferences:', error);
    }
  }

  private async computePreferencesForActiveUsers() {
    // First, identify active users who need preference updates
    // Active = had interactions in last hour OR preferences older than 30 min
    const result = await executeRawSql(sql`
      WITH active_users AS (
        SELECT DISTINCT user_did
        FROM user_interactions
        WHERE created_at > NOW() - INTERVAL '1 hour'

        UNION

        SELECT user_did
        FROM user_feed_preferences
        WHERE computed_at < NOW() - INTERVAL '30 minutes'

        LIMIT 1000
      ),
      user_interactions_window AS (
        SELECT
          ui.user_did,
          ui.video_uri,
          ui.interaction_type,
          ui.watch_duration,
          ui.completion_rate,
          ui.rewatch_count,
          ui.interaction_quality,
          ui.created_at,
          v.author_did,
          v.tags,
          v.sound_uri,
          v.duration,
          -- Calculate decay factor (half-life of 3 days)
          POWER(0.5, EXTRACT(EPOCH FROM (NOW() - ui.created_at)) / (3 * 24 * 3600)) AS decay_factor
        FROM user_interactions ui
        JOIN videos v ON v.uri = ui.video_uri
        WHERE ui.user_did IN (SELECT user_did FROM active_users)
          AND ui.created_at > NOW() - INTERVAL '7 days'
      ),
      -- Compute tag affinities
      tag_scores AS (
        SELECT
          ui.user_did,
          tag.value AS tag,
          SUM(COALESCE(ui.interaction_quality, 0.5) * ui.decay_factor) AS score,
          COUNT(*) AS interactions
        FROM user_interactions_window ui,
          LATERAL jsonb_array_elements_text(ui.tags::jsonb) AS tag(value)
        GROUP BY ui.user_did, tag.value
      ),
      tag_affinities AS (
        SELECT
          user_did,
          jsonb_agg(
            jsonb_build_object(
              'tag', tag,
              'score', normalized_score,
              'interactions', interactions,
              'lastUpdated', NOW()
            )
            ORDER BY score DESC
          ) FILTER (WHERE score > 0) AS tag_affinities
        FROM (
          SELECT *,
            ROW_NUMBER() OVER (PARTITION BY user_did ORDER BY score DESC) AS rn,
            LEAST(1.0, score / NULLIF(MAX(score) OVER (PARTITION BY user_did), 0)) AS normalized_score
          FROM tag_scores
        ) ranked
        WHERE rn <= 100
        GROUP BY user_did
      ),
      -- Compute author affinities
      author_scores AS (
        SELECT
          ui.user_did,
          ui.author_did,
          SUM(COALESCE(ui.interaction_quality, 0.5) * ui.decay_factor) AS score,
          COUNT(*) AS interactions
        FROM user_interactions_window ui
        WHERE ui.author_did IS NOT NULL
        GROUP BY ui.user_did, ui.author_did
      ),
      author_affinities AS (
        SELECT
          a.user_did,
          jsonb_agg(
            jsonb_build_object(
              'did', a.author_did,
              'score', a.normalized_score,
              'interactions', a.interactions,
              'isFollowing', COALESCE(f.uri IS NOT NULL, false),
              'lastUpdated', NOW()
            )
            ORDER BY a.score DESC
          ) FILTER (WHERE a.score > 0) AS author_affinities
        FROM (
          SELECT *,
            ROW_NUMBER() OVER (PARTITION BY user_did ORDER BY score DESC) AS rn,
            LEAST(1.0, score / NULLIF(MAX(score) OVER (PARTITION BY user_did), 0)) AS normalized_score
          FROM author_scores
        ) a
        LEFT JOIN follows f ON f.follower_did = a.user_did AND f.followee_did = a.author_did
        WHERE a.rn <= 100
        GROUP BY a.user_did
      ),
      -- Compute sound affinities
      sound_scores AS (
        SELECT
          ui.user_did,
          ui.sound_uri AS sound_id,
          SUM(COALESCE(ui.interaction_quality, 0.5) * ui.decay_factor) AS score,
          COUNT(*) AS interactions
        FROM user_interactions_window ui
        WHERE ui.sound_uri IS NOT NULL
        GROUP BY ui.user_did, ui.sound_uri
      ),
      sound_affinities AS (
        SELECT
          user_did,
          jsonb_agg(
            jsonb_build_object(
              'soundId', sound_id,
              'score', normalized_score,
              'interactions', interactions,
              'lastUpdated', NOW()
            )
            ORDER BY score DESC
          ) FILTER (WHERE score > 0) AS sound_affinities
        FROM (
          SELECT *,
            ROW_NUMBER() OVER (PARTITION BY user_did ORDER BY score DESC) AS rn,
            LEAST(1.0, score / NULLIF(MAX(score) OVER (PARTITION BY user_did), 0)) AS normalized_score
          FROM sound_scores
        ) ranked
        WHERE rn <= 100
        GROUP BY user_did
      ),
      -- Compute engagement stats
      engagement_stats AS (
        SELECT
          user_did,
          AVG(completion_rate) FILTER (WHERE completion_rate IS NOT NULL) AS avg_watch_completion,
          SUM(watch_duration) AS total_watch_time,
          COUNT(*) AS total_interactions,
          AVG(completion_rate) FILTER (WHERE interaction_type = 'like') AS like_threshold,
          AVG(completion_rate) FILTER (WHERE interaction_type LIKE 'comment%') AS comment_threshold
        FROM user_interactions_window
        GROUP BY user_did
      ),
      -- Compute negative signals from feedback
      negative_signals AS (
        SELECT
          user_did,
          jsonb_build_object(
            'hiddenAuthors', COALESCE(jsonb_agg(DISTINCT target_id) FILTER (WHERE feedback_type = 'hide_author' AND target_type = 'author'), '[]'::jsonb),
            'hiddenTags', COALESCE(jsonb_agg(DISTINCT target_id) FILTER (WHERE feedback_type = 'not_interested' AND target_type = 'tag'), '[]'::jsonb),
            'notInterestedVideos', COALESCE(jsonb_agg(DISTINCT target_id) FILTER (WHERE feedback_type = 'not_interested' AND target_type = 'video'), '[]'::jsonb),
            'seeLessAuthors', COALESCE(jsonb_agg(DISTINCT target_id) FILTER (WHERE feedback_type = 'see_less' AND target_type = 'author'), '[]'::jsonb),
            'seeLessTags', COALESCE(jsonb_agg(DISTINCT target_id) FILTER (WHERE feedback_type = 'see_less' AND target_type = 'tag'), '[]'::jsonb)
          ) AS negative_signals
        FROM user_content_feedback
        WHERE user_did IN (SELECT user_did FROM active_users)
        GROUP BY user_did
      ),
      -- Combine all data
      combined AS (
        SELECT
          au.user_did,
          COALESCE(ta.tag_affinities, '[]'::jsonb) AS tag_affinities,
          COALESCE(aa.author_affinities, '[]'::jsonb) AS author_affinities,
          COALESCE(sa.sound_affinities, '[]'::jsonb) AS sound_affinities,
          COALESCE(ns.negative_signals, jsonb_build_object(
            'hiddenAuthors', '[]'::jsonb,
            'hiddenTags', '[]'::jsonb,
            'notInterestedVideos', '[]'::jsonb,
            'seeLessAuthors', '[]'::jsonb,
            'seeLessTags', '[]'::jsonb
          )) AS negative_signals,
          COALESCE(es.avg_watch_completion, 0.5) AS avg_watch_completion,
          COALESCE(es.total_watch_time, 0) AS total_watch_time,
          COALESCE(es.total_interactions, 0) AS total_interactions,
          COALESCE(es.like_threshold, 0.7) AS like_threshold,
          COALESCE(es.comment_threshold, 0.8) AS comment_threshold
        FROM active_users au
        LEFT JOIN tag_affinities ta ON ta.user_did = au.user_did
        LEFT JOIN author_affinities aa ON aa.user_did = au.user_did
        LEFT JOIN sound_affinities sa ON sa.user_did = au.user_did
        LEFT JOIN negative_signals ns ON ns.user_did = au.user_did
        LEFT JOIN engagement_stats es ON es.user_did = au.user_did
      )
      INSERT INTO user_feed_preferences (
        user_did,
        tag_affinities,
        author_affinities,
        sound_affinities,
        negative_signals,
        avg_watch_completion,
        total_watch_time,
        total_interactions,
        like_threshold,
        comment_threshold,
        computed_at,
        updated_at
      )
      SELECT
        user_did,
        tag_affinities,
        author_affinities,
        sound_affinities,
        negative_signals,
        avg_watch_completion,
        total_watch_time,
        total_interactions,
        like_threshold,
        comment_threshold,
        NOW(),
        NOW()
      FROM combined
      ON CONFLICT (user_did) DO UPDATE SET
        tag_affinities = EXCLUDED.tag_affinities,
        author_affinities = EXCLUDED.author_affinities,
        sound_affinities = EXCLUDED.sound_affinities,
        negative_signals = EXCLUDED.negative_signals,
        avg_watch_completion = EXCLUDED.avg_watch_completion,
        total_watch_time = EXCLUDED.total_watch_time,
        total_interactions = EXCLUDED.total_interactions,
        like_threshold = EXCLUDED.like_threshold,
        comment_threshold = EXCLUDED.comment_threshold,
        computed_at = NOW(),
        updated_at = NOW()
    `);

    console.log('Processed user preferences batch');
  }
}
