-- Phase 1 & 2 Features Migration
-- Adds tables for webhooks, DLQ, trending, hashtags, and outbound sync

-- Webhook subscriptions
CREATE TABLE IF NOT EXISTS webhook_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  url TEXT NOT NULL,
  events TEXT[] NOT NULL DEFAULT '{}',
  secret TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_webhook_subscriptions_user ON webhook_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_webhook_subscriptions_active ON webhook_subscriptions(active);

-- Webhook deliveries
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id TEXT PRIMARY KEY,
  subscription_id TEXT NOT NULL REFERENCES webhook_subscriptions(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  status_code INTEGER,
  success INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  duration INTEGER,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_subscription ON webhook_deliveries(subscription_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_event ON webhook_deliveries(event_id);

-- Dead letter queue
CREATE TABLE IF NOT EXISTS dead_letter_queue (
  id TEXT PRIMARY KEY,
  original_job_id TEXT NOT NULL,
  upload_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  failure_reason TEXT NOT NULL,
  failed_at TIMESTAMP NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT NOT NULL,
  stack_trace TEXT,
  job_data TEXT NOT NULL,
  can_requeue INTEGER NOT NULL DEFAULT 1,
  processed_at TIMESTAMP,
  requeued_at TIMESTAMP,
  requeued_by TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dlq_upload ON dead_letter_queue(upload_id);
CREATE INDEX IF NOT EXISTS idx_dlq_user ON dead_letter_queue(user_id);
CREATE INDEX IF NOT EXISTS idx_dlq_reason ON dead_letter_queue(failure_reason);

-- Trending videos
CREATE TABLE IF NOT EXISTS trending_videos (
  video_uri TEXT PRIMARY KEY,
  score REAL NOT NULL DEFAULT 0,
  rank INTEGER NOT NULL DEFAULT 0,
  velocity REAL,
  engagement_rate REAL,
  calculated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_trending_videos_rank ON trending_videos(rank);
CREATE INDEX IF NOT EXISTS idx_trending_videos_score ON trending_videos(score DESC);

-- Hashtags
CREATE TABLE IF NOT EXISTS hashtags (
  tag TEXT PRIMARY KEY,
  video_count INTEGER NOT NULL DEFAULT 0,
  view_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_hashtags_video_count ON hashtags(video_count DESC);

-- Video-hashtag associations
CREATE TABLE IF NOT EXISTS video_hashtags (
  video_uri TEXT NOT NULL,
  tag TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (video_uri, tag)
);

CREATE INDEX IF NOT EXISTS idx_video_hashtags_tag ON video_hashtags(tag);
CREATE INDEX IF NOT EXISTS idx_video_hashtags_video ON video_hashtags(video_uri);

-- Trending hashtags
CREATE TABLE IF NOT EXISTS trending_hashtags (
  tag TEXT PRIMARY KEY,
  video_count INTEGER NOT NULL DEFAULT 0,
  view_count INTEGER NOT NULL DEFAULT 0,
  velocity REAL NOT NULL DEFAULT 0,
  rank INTEGER NOT NULL DEFAULT 0,
  calculated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_trending_hashtags_rank ON trending_hashtags(rank);

-- Outbound sync queue
CREATE TABLE IF NOT EXISTS outbound_sync_queue (
  id TEXT PRIMARY KEY,
  did TEXT NOT NULL,
  rev TEXT NOT NULL,
  operation TEXT NOT NULL,
  collection TEXT NOT NULL,
  rkey TEXT NOT NULL,
  record TEXT,
  cid TEXT,
  blobs TEXT[] DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMP,
  synced_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_outbound_sync_status ON outbound_sync_queue(status);
CREATE INDEX IF NOT EXISTS idx_outbound_sync_did ON outbound_sync_queue(did);
CREATE INDEX IF NOT EXISTS idx_outbound_sync_created ON outbound_sync_queue(created_at);

-- Outbound sync log
CREATE TABLE IF NOT EXISTS outbound_sync_log (
  id TEXT PRIMARY KEY,
  commit_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  success INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  synced_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_outbound_sync_log_commit ON outbound_sync_log(commit_id);
CREATE INDEX IF NOT EXISTS idx_outbound_sync_log_target ON outbound_sync_log(target_id);

-- PLC identities cache
CREATE TABLE IF NOT EXISTS plc_identities (
  did TEXT PRIMARY KEY,
  handle TEXT,
  pds_endpoint TEXT,
  signing_key TEXT,
  document TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_plc_identities_handle ON plc_identities(handle);

-- Add columns to upload_jobs for DLQ support
ALTER TABLE upload_jobs ADD COLUMN IF NOT EXISTS moved_to_dlq INTEGER DEFAULT 0;
ALTER TABLE upload_jobs ADD COLUMN IF NOT EXISTS dlq_id TEXT;
