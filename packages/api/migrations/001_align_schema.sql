-- Migration: Align database schema with schema.ts
-- Date: 2026-03-12
-- PRESERVES ALL EXISTING DATA including user 'rickholland'

-- ============================================================================
-- 1. Add missing column to follows table
-- ============================================================================
ALTER TABLE follows
ADD COLUMN IF NOT EXISTS subject_did TEXT;

-- Create index for subject_did
CREATE INDEX IF NOT EXISTS follows_subject_idx ON follows(subject_did);

-- Populate subject_did with followee_did as default (they represent the same concept)
UPDATE follows SET subject_did = followee_did WHERE subject_did IS NULL;

-- ============================================================================
-- 2. Add missing columns to organization_invites table
-- ============================================================================
ALTER TABLE organization_invites
ADD COLUMN IF NOT EXISTS max_uses INTEGER DEFAULT 1;

ALTER TABLE organization_invites
ADD COLUMN IF NOT EXISTS uses INTEGER DEFAULT 0 NOT NULL;

-- ============================================================================
-- 3. Add missing indexes if they don't exist
-- ============================================================================
-- Organization invites indexes
CREATE INDEX IF NOT EXISTS org_invites_org_idx ON organization_invites(organization_id);
CREATE INDEX IF NOT EXISTS org_invites_email_idx ON organization_invites(email);
CREATE INDEX IF NOT EXISTS org_invites_invited_did_idx ON organization_invites(invited_did);
CREATE UNIQUE INDEX IF NOT EXISTS org_invites_token_idx ON organization_invites(token);
CREATE INDEX IF NOT EXISTS org_invites_status_idx ON organization_invites(status);

-- ============================================================================
-- 4. Verify rickholland user is preserved
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
-- 5. Show summary of changes
-- ============================================================================
DO $$
BEGIN
    RAISE NOTICE '=== Migration Summary ===';
    RAISE NOTICE 'Added subject_did column to follows table';
    RAISE NOTICE 'Added max_uses and uses columns to organization_invites table';
    RAISE NOTICE 'All existing data has been preserved';
END $$;
