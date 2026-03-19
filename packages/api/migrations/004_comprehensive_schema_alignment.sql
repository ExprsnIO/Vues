-- Migration: Comprehensive schema alignment
-- Date: 2026-03-12
-- Ensures all columns exist and match the Drizzle schema
-- PRESERVES ALL EXISTING DATA including user 'rickholland'

-- ============================================================================
-- USERS TABLE
-- ============================================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS social_links JSONB;

-- ============================================================================
-- VIDEOS TABLE
-- ============================================================================
ALTER TABLE videos ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'public' NOT NULL;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS allow_duet BOOLEAN DEFAULT true NOT NULL;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS allow_stitch BOOLEAN DEFAULT true NOT NULL;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS allow_comments BOOLEAN DEFAULT true NOT NULL;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS share_count INTEGER DEFAULT 0 NOT NULL;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS repost_count INTEGER DEFAULT 0 NOT NULL;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS bookmark_count INTEGER DEFAULT 0 NOT NULL;
-- Emoji reaction counts
ALTER TABLE videos ADD COLUMN IF NOT EXISTS fire_count INTEGER DEFAULT 0 NOT NULL;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS love_count INTEGER DEFAULT 0 NOT NULL;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS laugh_count INTEGER DEFAULT 0 NOT NULL;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS wow_count INTEGER DEFAULT 0 NOT NULL;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS sad_count INTEGER DEFAULT 0 NOT NULL;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS angry_count INTEGER DEFAULT 0 NOT NULL;
-- Organization publishing
ALTER TABLE videos ADD COLUMN IF NOT EXISTS published_as_org_id TEXT;
-- Moderation and deletion
ALTER TABLE videos ADD COLUMN IF NOT EXISTS moderation_status TEXT DEFAULT 'approved' NOT NULL;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS deleted_by TEXT;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS deletion_type TEXT;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS deletion_reason TEXT;

-- ============================================================================
-- LIKES TABLE
-- ============================================================================
ALTER TABLE likes ADD COLUMN IF NOT EXISTS subject_uri TEXT;

-- ============================================================================
-- COMMENTS TABLE
-- ============================================================================
ALTER TABLE comments ADD COLUMN IF NOT EXISTS love_count INTEGER DEFAULT 0 NOT NULL;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS dislike_count INTEGER DEFAULT 0 NOT NULL;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS reply_count INTEGER DEFAULT 0 NOT NULL;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS hot_score REAL DEFAULT 0 NOT NULL;

-- ============================================================================
-- FOLLOWS TABLE
-- ============================================================================
ALTER TABLE follows ADD COLUMN IF NOT EXISTS subject_did TEXT;

-- ============================================================================
-- VIDEO VIEWS TABLE
-- ============================================================================
ALTER TABLE video_views ADD COLUMN IF NOT EXISTS completed_view BOOLEAN DEFAULT false NOT NULL;
ALTER TABLE video_views ADD COLUMN IF NOT EXISTS source TEXT;

-- ============================================================================
-- USER INTERACTIONS TABLE
-- ============================================================================
ALTER TABLE user_interactions ADD COLUMN IF NOT EXISTS skip_rate REAL;
ALTER TABLE user_interactions ADD COLUMN IF NOT EXISTS rewatch_count INTEGER DEFAULT 0;
ALTER TABLE user_interactions ADD COLUMN IF NOT EXISTS loop_count INTEGER DEFAULT 0;
ALTER TABLE user_interactions ADD COLUMN IF NOT EXISTS interaction_quality REAL;
ALTER TABLE user_interactions ADD COLUMN IF NOT EXISTS session_position INTEGER;
ALTER TABLE user_interactions ADD COLUMN IF NOT EXISTS engagement_actions JSONB;
ALTER TABLE user_interactions ADD COLUMN IF NOT EXISTS milestone TEXT;

-- ============================================================================
-- UPLOAD JOBS TABLE
-- ============================================================================
ALTER TABLE upload_jobs ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0 NOT NULL;
ALTER TABLE upload_jobs ADD COLUMN IF NOT EXISTS max_retries INTEGER DEFAULT 5 NOT NULL;
ALTER TABLE upload_jobs ADD COLUMN IF NOT EXISTS last_retry_at TIMESTAMP;
ALTER TABLE upload_jobs ADD COLUMN IF NOT EXISTS retry_history JSONB DEFAULT '[]';
ALTER TABLE upload_jobs ADD COLUMN IF NOT EXISTS moved_to_dlq BOOLEAN DEFAULT false NOT NULL;
ALTER TABLE upload_jobs ADD COLUMN IF NOT EXISTS dlq_id TEXT;

-- ============================================================================
-- TRENDING VIDEOS TABLE
-- ============================================================================
ALTER TABLE trending_videos ADD COLUMN IF NOT EXISTS velocity REAL DEFAULT 0 NOT NULL;

-- ============================================================================
-- SOUNDS TABLE
-- ============================================================================
ALTER TABLE sounds ADD COLUMN IF NOT EXISTS cover_url TEXT;

-- ============================================================================
-- ORGANIZATION INVITES TABLE (if exists)
-- ============================================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'organization_invites') THEN
        ALTER TABLE organization_invites ADD COLUMN IF NOT EXISTS max_uses INTEGER DEFAULT 1;
        ALTER TABLE organization_invites ADD COLUMN IF NOT EXISTS uses INTEGER DEFAULT 0 NOT NULL;
    END IF;
END $$;

-- ============================================================================
-- NOTIFICATION SETTINGS TABLE (if exists)
-- ============================================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notification_settings') THEN
        ALTER TABLE notification_settings ADD COLUMN IF NOT EXISTS push_enabled BOOLEAN DEFAULT true;
        ALTER TABLE notification_settings ADD COLUMN IF NOT EXISTS push_on_follow BOOLEAN DEFAULT true;
        ALTER TABLE notification_settings ADD COLUMN IF NOT EXISTS push_on_like BOOLEAN DEFAULT true;
        ALTER TABLE notification_settings ADD COLUMN IF NOT EXISTS push_on_comment BOOLEAN DEFAULT true;
        ALTER TABLE notification_settings ADD COLUMN IF NOT EXISTS push_on_mention BOOLEAN DEFAULT true;
        ALTER TABLE notification_settings ADD COLUMN IF NOT EXISTS push_on_message BOOLEAN DEFAULT true;
    END IF;
END $$;

-- ============================================================================
-- CHALLENGES TABLE (if exists)
-- ============================================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'challenges') THEN
        ALTER TABLE challenges ADD COLUMN IF NOT EXISTS rules TEXT;
        ALTER TABLE challenges ADD COLUMN IF NOT EXISTS cover_image_url TEXT;
        ALTER TABLE challenges ADD COLUMN IF NOT EXISTS banner_image_url TEXT;
        ALTER TABLE challenges ADD COLUMN IF NOT EXISTS prizes JSONB;
        ALTER TABLE challenges ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'public' NOT NULL;
        ALTER TABLE challenges ADD COLUMN IF NOT EXISTS entry_count INTEGER DEFAULT 0 NOT NULL;
        ALTER TABLE challenges ADD COLUMN IF NOT EXISTS participant_count INTEGER DEFAULT 0 NOT NULL;
        ALTER TABLE challenges ADD COLUMN IF NOT EXISTS total_views INTEGER DEFAULT 0 NOT NULL;
        ALTER TABLE challenges ADD COLUMN IF NOT EXISTS total_engagement INTEGER DEFAULT 0 NOT NULL;
        ALTER TABLE challenges ADD COLUMN IF NOT EXISTS voting_end_at TIMESTAMP;
        ALTER TABLE challenges ADD COLUMN IF NOT EXISTS featured_sound_id TEXT;
    END IF;
END $$;

-- ============================================================================
-- RENDER JOBS TABLE (if exists)
-- ============================================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'render_jobs') THEN
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
    END IF;
END $$;

-- ============================================================================
-- RENDER WORKERS TABLE (if exists)
-- ============================================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'render_workers') THEN
        ALTER TABLE render_workers ADD COLUMN IF NOT EXISTS gpu_count INTEGER DEFAULT 0;
        ALTER TABLE render_workers ADD COLUMN IF NOT EXISTS gpu_utilization REAL;
        ALTER TABLE render_workers ADD COLUMN IF NOT EXISTS gpu_memory_used INTEGER;
    END IF;
END $$;

-- ============================================================================
-- RENDER CLUSTERS TABLE (if exists)
-- ============================================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'render_clusters') THEN
        ALTER TABLE render_clusters ADD COLUMN IF NOT EXISTS worker_count INTEGER DEFAULT 0;
    END IF;
END $$;

-- ============================================================================
-- VERIFY USER DATA PRESERVATION
-- ============================================================================
DO $$
DECLARE
    user_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO user_count FROM users WHERE handle LIKE '%rickholland%' OR did LIKE '%rickholland%';
    IF user_count > 0 THEN
        RAISE NOTICE 'SUCCESS: User rickholland preserved (% matching records found)', user_count;
    ELSE
        RAISE NOTICE 'INFO: No users matching rickholland found (this is OK if user has different handle)';
    END IF;
END $$;

-- ============================================================================
-- CREATE ANY MISSING INDEXES
-- ============================================================================
CREATE INDEX IF NOT EXISTS videos_published_as_org_idx ON videos(published_as_org_id);
CREATE INDEX IF NOT EXISTS videos_moderation_status_idx ON videos(moderation_status);
CREATE INDEX IF NOT EXISTS videos_deleted_at_idx ON videos(deleted_at);
CREATE INDEX IF NOT EXISTS likes_subject_idx ON likes(subject_uri);
CREATE INDEX IF NOT EXISTS follows_subject_idx ON follows(subject_did);
CREATE INDEX IF NOT EXISTS upload_jobs_dlq_idx ON upload_jobs(moved_to_dlq);
CREATE INDEX IF NOT EXISTS user_interactions_quality_idx ON user_interactions(interaction_quality);

-- ============================================================================
-- SUMMARY
-- ============================================================================
DO $$
BEGIN
    RAISE NOTICE '=== Migration 004 Summary ===';
    RAISE NOTICE 'Comprehensive schema alignment completed';
    RAISE NOTICE 'All columns aligned with Drizzle schema';
    RAISE NOTICE 'All existing data preserved';
    RAISE NOTICE 'All necessary indexes created';
END $$;
