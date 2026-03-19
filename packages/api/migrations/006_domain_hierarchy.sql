-- Migration 006: Add domain hierarchy support
-- Mirrors the organization hierarchy pattern (parentOrganizationId, hierarchyPath, hierarchyLevel)

-- Add hierarchy columns to domains table
ALTER TABLE domains ADD COLUMN IF NOT EXISTS parent_domain_id TEXT;
ALTER TABLE domains ADD COLUMN IF NOT EXISTS hierarchy_path TEXT;
ALTER TABLE domains ADD COLUMN IF NOT EXISTS hierarchy_level INTEGER NOT NULL DEFAULT 0;

-- Create indexes for hierarchy queries
CREATE INDEX IF NOT EXISTS domains_parent_domain_idx ON domains (parent_domain_id);
CREATE INDEX IF NOT EXISTS domains_hierarchy_path_idx ON domains (hierarchy_path);

-- Initialize hierarchy_path for existing domains (root-level, no parent)
UPDATE domains
SET hierarchy_path = '/' || id || '/',
    hierarchy_level = 0
WHERE hierarchy_path IS NULL;
