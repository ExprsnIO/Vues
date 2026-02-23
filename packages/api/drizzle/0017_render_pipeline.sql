-- Render Pipeline Enhancement Migration
-- Adds priority, batching, dependencies, worker tracking, and user quotas

-- Add new columns to render_jobs
ALTER TABLE render_jobs ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'normal' NOT NULL;
ALTER TABLE render_jobs ADD COLUMN IF NOT EXISTS priority_score INTEGER DEFAULT 50;
ALTER TABLE render_jobs ADD COLUMN IF NOT EXISTS batch_id TEXT;
ALTER TABLE render_jobs ADD COLUMN IF NOT EXISTS depends_on_job_id TEXT;
ALTER TABLE render_jobs ADD COLUMN IF NOT EXISTS worker_id TEXT;
ALTER TABLE render_jobs ADD COLUMN IF NOT EXISTS worker_started_at TIMESTAMP;
ALTER TABLE render_jobs ADD COLUMN IF NOT EXISTS estimated_duration_seconds INTEGER;
ALTER TABLE render_jobs ADD COLUMN IF NOT EXISTS estimated_memory_mb INTEGER;
ALTER TABLE render_jobs ADD COLUMN IF NOT EXISTS actual_duration_seconds INTEGER;
ALTER TABLE render_jobs ADD COLUMN IF NOT EXISTS actual_memory_mb INTEGER;
ALTER TABLE render_jobs ADD COLUMN IF NOT EXISTS paused_at TIMESTAMP;
ALTER TABLE render_jobs ADD COLUMN IF NOT EXISTS paused_by_admin_id TEXT;

-- Add indexes for render_jobs
CREATE INDEX IF NOT EXISTS render_jobs_priority_idx ON render_jobs(priority, priority_score);
CREATE INDEX IF NOT EXISTS render_jobs_batch_idx ON render_jobs(batch_id);
CREATE INDEX IF NOT EXISTS render_jobs_depends_on_idx ON render_jobs(depends_on_job_id);
CREATE INDEX IF NOT EXISTS render_jobs_worker_idx ON render_jobs(worker_id);

-- Create render_batches table
CREATE TABLE IF NOT EXISTS render_batches (
    id TEXT PRIMARY KEY,
    user_did TEXT NOT NULL REFERENCES users(did) ON DELETE CASCADE,
    name TEXT,
    total_jobs INTEGER DEFAULT 0,
    completed_jobs INTEGER DEFAULT 0,
    failed_jobs INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT NOW() NOT NULL,
    completed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS render_batches_user_idx ON render_batches(user_did);
CREATE INDEX IF NOT EXISTS render_batches_status_idx ON render_batches(status);

-- Create user_render_quotas table
CREATE TABLE IF NOT EXISTS user_render_quotas (
    user_did TEXT PRIMARY KEY REFERENCES users(did) ON DELETE CASCADE,
    daily_limit INTEGER DEFAULT 10,
    daily_used INTEGER DEFAULT 0,
    daily_reset_at TIMESTAMP,
    weekly_limit INTEGER DEFAULT 50,
    weekly_used INTEGER DEFAULT 0,
    weekly_reset_at TIMESTAMP,
    concurrent_limit INTEGER DEFAULT 2,
    max_quality TEXT DEFAULT 'ultra',
    priority_boost INTEGER DEFAULT 0,
    updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Create render_workers table
CREATE TABLE IF NOT EXISTS render_workers (
    id TEXT PRIMARY KEY,
    hostname TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    concurrency INTEGER DEFAULT 2,
    active_jobs INTEGER DEFAULT 0,
    total_processed INTEGER DEFAULT 0,
    failed_jobs INTEGER DEFAULT 0,
    avg_processing_time REAL,
    gpu_enabled BOOLEAN DEFAULT FALSE,
    gpu_model TEXT,
    last_heartbeat TIMESTAMP,
    started_at TIMESTAMP DEFAULT NOW() NOT NULL,
    metadata JSONB
);

CREATE INDEX IF NOT EXISTS render_workers_status_idx ON render_workers(status);
CREATE INDEX IF NOT EXISTS render_workers_heartbeat_idx ON render_workers(last_heartbeat);
