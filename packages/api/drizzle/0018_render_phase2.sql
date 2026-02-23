-- Render Pipeline Phase 2 Migration
-- Adds: notification settings, notification log, render presets, render clusters

-- Notification settings - per user notification preferences
CREATE TABLE IF NOT EXISTS notification_settings (
  user_did TEXT PRIMARY KEY REFERENCES users(did) ON DELETE CASCADE,
  email TEXT,
  email_enabled BOOLEAN DEFAULT true,
  webhook_url TEXT,
  webhook_secret TEXT,
  notify_on_complete BOOLEAN DEFAULT true,
  notify_on_failed BOOLEAN DEFAULT true,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Notification log - track sent notifications
CREATE TABLE IF NOT EXISTS notification_log (
  id TEXT PRIMARY KEY,
  user_did TEXT NOT NULL REFERENCES users(did) ON DELETE CASCADE,
  type TEXT NOT NULL,
  event TEXT NOT NULL,
  status TEXT NOT NULL,
  recipient_email TEXT,
  webhook_url TEXT,
  payload JSONB,
  error_message TEXT,
  response_code INTEGER,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS notification_log_user_idx ON notification_log(user_did);
CREATE INDEX IF NOT EXISTS notification_log_type_idx ON notification_log(type);
CREATE INDEX IF NOT EXISTS notification_log_event_idx ON notification_log(event);
CREATE INDEX IF NOT EXISTS notification_log_created_idx ON notification_log(created_at);

-- Render presets - system and user-defined render settings
CREATE TABLE IF NOT EXISTS render_presets (
  id TEXT PRIMARY KEY,
  user_did TEXT REFERENCES users(did) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  settings JSONB NOT NULL,
  is_default BOOLEAN DEFAULT false,
  is_system BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS render_presets_user_idx ON render_presets(user_did);
CREATE INDEX IF NOT EXISTS render_presets_system_idx ON render_presets(is_system);
CREATE INDEX IF NOT EXISTS render_presets_default_idx ON render_presets(is_default);

-- Render clusters - manage multiple render worker clusters
CREATE TABLE IF NOT EXISTS render_clusters (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  endpoint TEXT,
  config JSONB,
  status TEXT NOT NULL DEFAULT 'active',
  region TEXT,
  max_workers INTEGER,
  current_workers INTEGER DEFAULT 0,
  gpu_enabled BOOLEAN DEFAULT false,
  gpu_count INTEGER DEFAULT 0,
  priority_routing JSONB,
  last_health_check TIMESTAMP,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS render_clusters_status_idx ON render_clusters(status);
CREATE INDEX IF NOT EXISTS render_clusters_type_idx ON render_clusters(type);
CREATE INDEX IF NOT EXISTS render_clusters_region_idx ON render_clusters(region);

-- Insert system presets
INSERT INTO render_presets (id, name, description, settings, is_default, is_system, sort_order) VALUES
  ('preset_draft', 'Draft', 'Quick preview at 720p - fast rendering for review', '{"resolution":"1280x720","quality":"low","format":"mp4","fps":30}', false, true, 1),
  ('preset_standard', 'Standard', 'Social media quality at 1080p', '{"resolution":"1920x1080","quality":"medium","format":"mp4","fps":30}', true, true, 2),
  ('preset_high', 'High Quality', 'Professional quality at 1080p with 60fps', '{"resolution":"1920x1080","quality":"high","format":"mp4","fps":60}', false, true, 3),
  ('preset_4k', '4K Master', 'Archival quality at 4K resolution', '{"resolution":"3840x2160","quality":"highest","format":"mov","fps":60}', false, true, 4),
  ('preset_reel', 'Instagram Reel', 'Vertical 9:16 format for Instagram Reels', '{"resolution":"1080x1920","quality":"medium","format":"mp4","fps":30}', false, true, 5),
  ('preset_short', 'YouTube Short', 'Vertical 9:16 format for YouTube Shorts', '{"resolution":"1080x1920","quality":"high","format":"mp4","fps":30}', false, true, 6)
ON CONFLICT (id) DO NOTHING;

-- Insert default local cluster
INSERT INTO render_clusters (id, name, type, status, region, max_workers, current_workers, priority_routing) VALUES
  ('cluster_local', 'Local Docker', 'docker', 'active', 'local', 10, 0, '{"urgent":true,"high":true,"normal":true,"low":true}')
ON CONFLICT (id) DO NOTHING;
