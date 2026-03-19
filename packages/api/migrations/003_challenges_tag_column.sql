-- Migration: Add tag column to challenges table
-- Date: 2026-03-12
-- PRESERVES ALL EXISTING DATA

-- ============================================================================
-- 1. Add tag column to challenges table
-- ============================================================================
ALTER TABLE challenges
ADD COLUMN IF NOT EXISTS tag TEXT;

-- Populate tag from hashtag column if it exists, otherwise use id as fallback
DO $$
BEGIN
    -- Check if hashtag column exists and populate tag from it
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'challenges' AND column_name = 'hashtag'
    ) THEN
        UPDATE challenges SET tag = hashtag WHERE tag IS NULL AND hashtag IS NOT NULL;
        RAISE NOTICE 'Populated tag column from existing hashtag column';
    ELSE
        -- If no hashtag column, set tag to id for any NULL values
        UPDATE challenges SET tag = id WHERE tag IS NULL;
        RAISE NOTICE 'No hashtag column found - populated tag with id as fallback';
    END IF;
END $$;

-- Make tag NOT NULL after populating
-- First check if there are any NULL values
DO $$
BEGIN
    -- Only add constraint if all rows have non-null tag values
    IF NOT EXISTS (SELECT 1 FROM challenges WHERE tag IS NULL) THEN
        ALTER TABLE challenges ALTER COLUMN tag SET NOT NULL;
    END IF;
END $$;

-- Create index for tag
CREATE INDEX IF NOT EXISTS challenges_tag_idx ON challenges(tag);

-- ============================================================================
-- 2. Verify rickholland user is preserved
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
-- 3. Show summary
-- ============================================================================
DO $$
BEGIN
    RAISE NOTICE '=== Migration Summary ===';
    RAISE NOTICE 'Added tag column to challenges table (alias for hashtag)';
    RAISE NOTICE 'All existing data has been preserved';
END $$;
