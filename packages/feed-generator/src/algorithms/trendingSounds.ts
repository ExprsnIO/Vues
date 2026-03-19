import { CronJob } from 'cron';
import { executeRawSql } from '../db.js';
import { sql } from 'drizzle-orm';

export class TrendingSoundsCalculator {
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
    console.log('Calculating trending sounds...');

    try {
      // Calculate trending scores for sounds
      // Score = (totalUseCount * 0.3) + (recentUseCount_24h * 2) + (velocity * 5)
      // velocity = (uses_last_6h - uses_prev_6h) / 6

      await executeRawSql(sql`
        WITH sound_metrics AS (
          SELECT
            s.id AS sound_id,
            s.use_count,
            -- Recent uses (last 24 hours)
            COALESCE((
              SELECT COUNT(*)
              FROM sound_usage_history suh
              WHERE suh.sound_id = s.id
                AND suh.created_at > NOW() - INTERVAL '24 hours'
            ), 0) AS recent_use_count,
            -- Uses in last 6 hours
            COALESCE((
              SELECT COUNT(*)
              FROM sound_usage_history suh
              WHERE suh.sound_id = s.id
                AND suh.created_at > NOW() - INTERVAL '6 hours'
            ), 0) AS uses_last_6h,
            -- Uses in previous 6 hour window (6-12 hours ago)
            COALESCE((
              SELECT COUNT(*)
              FROM sound_usage_history suh
              WHERE suh.sound_id = s.id
                AND suh.created_at BETWEEN NOW() - INTERVAL '12 hours' AND NOW() - INTERVAL '6 hours'
            ), 0) AS uses_prev_6h
          FROM sounds s
          WHERE s.use_count > 0
        ),
        ranked_sounds AS (
          SELECT
            sound_id,
            use_count,
            recent_use_count,
            -- Velocity: rate of change in uses per hour
            (uses_last_6h - uses_prev_6h)::float / 6 AS velocity,
            -- Trending score combining total, recent, and velocity
            (use_count * 0.3 + recent_use_count * 2 + ((uses_last_6h - uses_prev_6h)::float / 6) * 5) AS score,
            ROW_NUMBER() OVER (
              ORDER BY (use_count * 0.3 + recent_use_count * 2 + ((uses_last_6h - uses_prev_6h)::float / 6) * 5) DESC
            ) AS rank
          FROM sound_metrics
        )
        INSERT INTO trending_sounds (sound_id, score, velocity, rank, recent_use_count, updated_at)
        SELECT sound_id, score, velocity, rank, recent_use_count, NOW()
        FROM ranked_sounds
        WHERE rank <= 500
        ON CONFLICT (sound_id) DO UPDATE SET
          score = EXCLUDED.score,
          velocity = EXCLUDED.velocity,
          rank = EXCLUDED.rank,
          recent_use_count = EXCLUDED.recent_use_count,
          updated_at = NOW()
      `);

      // Clean up sounds that are no longer trending
      await executeRawSql(sql`
        DELETE FROM trending_sounds
        WHERE updated_at < NOW() - INTERVAL '10 minutes'
      `);

      console.log('Trending sounds calculation complete');
    } catch (error) {
      console.error('Error calculating trending sounds:', error);
    }
  }
}
