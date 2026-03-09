-- Video Moderation and Deletion System
-- Migration 0029

-- =============================================================================
-- Videos Table Extensions
-- =============================================================================

-- Add moderation and deletion fields to videos table
ALTER TABLE videos ADD COLUMN IF NOT EXISTS moderation_status TEXT DEFAULT 'approved' NOT NULL;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS deleted_by TEXT;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS deletion_type TEXT; -- 'user_soft' | 'domain_mod' | 'global_admin' | 'system_hard'
ALTER TABLE videos ADD COLUMN IF NOT EXISTS deletion_reason TEXT;

-- Create indexes for efficient filtering
CREATE INDEX IF NOT EXISTS videos_moderation_status_idx ON videos(moderation_status);
CREATE INDEX IF NOT EXISTS videos_deleted_at_idx ON videos(deleted_at);

-- =============================================================================
-- Upload Jobs Extensions (for retry functionality)
-- =============================================================================

ALTER TABLE upload_jobs ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;
ALTER TABLE upload_jobs ADD COLUMN IF NOT EXISTS max_retries INTEGER DEFAULT 5;
ALTER TABLE upload_jobs ADD COLUMN IF NOT EXISTS last_retry_at TIMESTAMP;
ALTER TABLE upload_jobs ADD COLUMN IF NOT EXISTS retry_history JSONB DEFAULT '[]';

-- =============================================================================
-- Video Deletion Log - Audit trail for all video deletions
-- =============================================================================

CREATE TABLE IF NOT EXISTS video_deletion_log (
  id TEXT PRIMARY KEY,
  video_uri TEXT NOT NULL,
  video_cid TEXT,
  author_did TEXT NOT NULL,
  deleted_by TEXT NOT NULL,
  deletion_type TEXT NOT NULL, -- 'user_soft' | 'domain_mod' | 'global_admin' | 'system_hard'
  reason TEXT,
  -- Preserved video metadata for audit
  caption TEXT,
  tags JSONB DEFAULT '[]',
  cdn_url TEXT,
  thumbnail_url TEXT,
  view_count INTEGER DEFAULT 0,
  like_count INTEGER DEFAULT 0,
  -- Restore capability
  can_restore BOOLEAN DEFAULT true,
  restored_at TIMESTAMP,
  restored_by TEXT,
  -- Domain context (if deleted by domain moderator)
  domain_id TEXT,
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS video_deletion_log_video_uri_idx ON video_deletion_log(video_uri);
CREATE INDEX IF NOT EXISTS video_deletion_log_author_did_idx ON video_deletion_log(author_did);
CREATE INDEX IF NOT EXISTS video_deletion_log_deleted_by_idx ON video_deletion_log(deleted_by);
CREATE INDEX IF NOT EXISTS video_deletion_log_deletion_type_idx ON video_deletion_log(deletion_type);
CREATE INDEX IF NOT EXISTS video_deletion_log_created_at_idx ON video_deletion_log(created_at);

-- =============================================================================
-- Moderation Notifications - In-app notifications for moderators
-- =============================================================================

CREATE TABLE IF NOT EXISTS moderation_notifications (
  id TEXT PRIMARY KEY,
  recipient_id TEXT NOT NULL, -- Admin user ID or 'all_moderators'
  type TEXT NOT NULL, -- 'new_content' | 'escalation' | 'high_risk' | 'appeal' | 'queue_full'
  priority TEXT DEFAULT 'normal' NOT NULL, -- 'low' | 'normal' | 'high' | 'urgent'
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  -- Related content
  content_type TEXT, -- 'video' | 'comment' | 'profile'
  content_id TEXT,
  content_uri TEXT,
  -- Metadata
  metadata JSONB DEFAULT '{}',
  -- Status
  read_at TIMESTAMP,
  dismissed_at TIMESTAMP,
  actioned_at TIMESTAMP,
  actioned_by TEXT,
  action_taken TEXT,
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  expires_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS moderation_notifications_recipient_idx ON moderation_notifications(recipient_id);
CREATE INDEX IF NOT EXISTS moderation_notifications_type_idx ON moderation_notifications(type);
CREATE INDEX IF NOT EXISTS moderation_notifications_priority_idx ON moderation_notifications(priority);
CREATE INDEX IF NOT EXISTS moderation_notifications_read_idx ON moderation_notifications(read_at);
CREATE INDEX IF NOT EXISTS moderation_notifications_created_at_idx ON moderation_notifications(created_at);

-- =============================================================================
-- Trusted Users - Users eligible for auto-approval
-- =============================================================================

CREATE TABLE IF NOT EXISTS trusted_users (
  id TEXT PRIMARY KEY,
  user_did TEXT NOT NULL UNIQUE,
  trust_level TEXT DEFAULT 'basic' NOT NULL, -- 'basic' | 'verified' | 'creator' | 'partner'
  -- Trust grants
  auto_approve BOOLEAN DEFAULT true,
  skip_ai_review BOOLEAN DEFAULT false,
  extended_upload_limits BOOLEAN DEFAULT false,
  -- Grant info
  granted_by TEXT NOT NULL,
  granted_at TIMESTAMP DEFAULT NOW() NOT NULL,
  grant_reason TEXT,
  -- Revocation
  revoked_at TIMESTAMP,
  revoked_by TEXT,
  revoke_reason TEXT,
  -- Stats
  total_uploads INTEGER DEFAULT 0,
  approved_uploads INTEGER DEFAULT 0,
  rejected_uploads INTEGER DEFAULT 0,
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS trusted_users_user_did_idx ON trusted_users(user_did);
CREATE INDEX IF NOT EXISTS trusted_users_trust_level_idx ON trusted_users(trust_level);
CREATE INDEX IF NOT EXISTS trusted_users_auto_approve_idx ON trusted_users(auto_approve);

-- =============================================================================
-- Content Moderation Queue - Videos pending review
-- =============================================================================

CREATE TABLE IF NOT EXISTS video_moderation_queue (
  id TEXT PRIMARY KEY,
  video_uri TEXT NOT NULL UNIQUE,
  author_did TEXT NOT NULL,
  -- Submission info
  submitted_at TIMESTAMP DEFAULT NOW() NOT NULL,
  -- Risk assessment
  risk_score INTEGER DEFAULT 0,
  risk_level TEXT DEFAULT 'unknown', -- 'unknown' | 'safe' | 'low' | 'medium' | 'high' | 'critical'
  flags JSONB DEFAULT '[]', -- Array of flag types
  ai_analysis JSONB DEFAULT '{}',
  -- Review status
  status TEXT DEFAULT 'pending' NOT NULL, -- 'pending' | 'in_review' | 'approved' | 'rejected' | 'escalated'
  priority INTEGER DEFAULT 0,
  -- Assignment
  assigned_to TEXT,
  assigned_at TIMESTAMP,
  -- Review result
  reviewed_by TEXT,
  reviewed_at TIMESTAMP,
  review_notes TEXT,
  rejection_reason TEXT,
  -- Domain context
  domain_id TEXT,
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS video_moderation_queue_video_uri_idx ON video_moderation_queue(video_uri);
CREATE INDEX IF NOT EXISTS video_moderation_queue_author_did_idx ON video_moderation_queue(author_did);
CREATE INDEX IF NOT EXISTS video_moderation_queue_status_idx ON video_moderation_queue(status);
CREATE INDEX IF NOT EXISTS video_moderation_queue_priority_idx ON video_moderation_queue(priority, submitted_at);
CREATE INDEX IF NOT EXISTS video_moderation_queue_assigned_to_idx ON video_moderation_queue(assigned_to);
CREATE INDEX IF NOT EXISTS video_moderation_queue_risk_level_idx ON video_moderation_queue(risk_level);

-- =============================================================================
-- Domain Moderators - Users with moderation privileges within a domain
-- =============================================================================

CREATE TABLE IF NOT EXISTS domain_moderators (
  id TEXT PRIMARY KEY,
  domain_id TEXT NOT NULL,
  user_did TEXT NOT NULL,
  -- Permissions
  can_approve BOOLEAN DEFAULT true,
  can_reject BOOLEAN DEFAULT true,
  can_delete BOOLEAN DEFAULT false,
  can_escalate BOOLEAN DEFAULT true,
  can_warn_users BOOLEAN DEFAULT false,
  can_suspend_users BOOLEAN DEFAULT false,
  -- Assignment
  appointed_by TEXT NOT NULL,
  appointed_at TIMESTAMP DEFAULT NOW() NOT NULL,
  -- Status
  active BOOLEAN DEFAULT true,
  deactivated_at TIMESTAMP,
  deactivated_by TEXT,
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL,

  UNIQUE(domain_id, user_did)
);

CREATE INDEX IF NOT EXISTS domain_moderators_domain_id_idx ON domain_moderators(domain_id);
CREATE INDEX IF NOT EXISTS domain_moderators_user_did_idx ON domain_moderators(user_did);
CREATE INDEX IF NOT EXISTS domain_moderators_active_idx ON domain_moderators(active);

-- =============================================================================
-- Backfill: Set existing videos to approved status
-- =============================================================================

UPDATE videos SET moderation_status = 'approved' WHERE moderation_status IS NULL;
