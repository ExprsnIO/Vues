-- Migration: Add missing columns for likes and notification_settings
-- Date: 2026-03-12
-- PRESERVES ALL EXISTING DATA

-- ============================================================================
-- 1. Add missing column to likes table
-- ============================================================================
ALTER TABLE likes
ADD COLUMN IF NOT EXISTS subject_uri TEXT;

-- Create index for subject_uri
CREATE INDEX IF NOT EXISTS likes_subject_idx ON likes(subject_uri);

-- Populate subject_uri with video_uri as default (they represent the same concept)
UPDATE likes SET subject_uri = video_uri WHERE subject_uri IS NULL;

-- ============================================================================
-- 2. Add missing push notification columns to notification_settings table
-- ============================================================================
ALTER TABLE notification_settings
ADD COLUMN IF NOT EXISTS push_enabled BOOLEAN DEFAULT true;

ALTER TABLE notification_settings
ADD COLUMN IF NOT EXISTS push_on_follow BOOLEAN DEFAULT true;

ALTER TABLE notification_settings
ADD COLUMN IF NOT EXISTS push_on_like BOOLEAN DEFAULT true;

ALTER TABLE notification_settings
ADD COLUMN IF NOT EXISTS push_on_comment BOOLEAN DEFAULT true;

ALTER TABLE notification_settings
ADD COLUMN IF NOT EXISTS push_on_mention BOOLEAN DEFAULT true;

ALTER TABLE notification_settings
ADD COLUMN IF NOT EXISTS push_on_message BOOLEAN DEFAULT true;

-- ============================================================================
-- 3. Verify rickholland user is preserved
-- ============================================================================
DO $$
DECLARE
    user_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO user_count FROM users WHERE handle LIKE '%rickholland%';
    IF user_count > 0 THEN
        RAISE NOTICE 'User rickholland preserved: % matching users found', user_count;
    ELSE
        RAISE NOTICE 'No users matching rickholland found (this is OK if user has different handle)';
    END IF;
END $$;

-- ============================================================================
-- 4. Show summary of changes
-- ============================================================================
DO $$
BEGIN
    RAISE NOTICE '=== Migration Summary ===';
    RAISE NOTICE 'Added subject_uri column to likes table';
    RAISE NOTICE 'Added push notification columns to notification_settings table';
    RAISE NOTICE 'All existing data has been preserved';
END $$;
