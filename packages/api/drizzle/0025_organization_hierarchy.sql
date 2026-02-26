-- Organization Hierarchy Migration
-- Adds parent/child relationship support and domain association to organizations

-- Add hierarchy columns
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS parent_organization_id TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS domain_id TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS hierarchy_path TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS hierarchy_level INTEGER DEFAULT 0;

-- Add foreign key constraints
ALTER TABLE organizations
  ADD CONSTRAINT organizations_parent_org_fk
  FOREIGN KEY (parent_organization_id)
  REFERENCES organizations(id)
  ON DELETE SET NULL;

ALTER TABLE organizations
  ADD CONSTRAINT organizations_domain_fk
  FOREIGN KEY (domain_id)
  REFERENCES domains(id)
  ON DELETE SET NULL;

-- Add indexes for hierarchy queries
CREATE INDEX IF NOT EXISTS idx_organizations_parent ON organizations(parent_organization_id);
CREATE INDEX IF NOT EXISTS idx_organizations_domain ON organizations(domain_id);
CREATE INDEX IF NOT EXISTS idx_organizations_hierarchy ON organizations(hierarchy_path);

-- Initialize hierarchy_path for existing organizations (set to /{id}/)
UPDATE organizations
SET hierarchy_path = '/' || id || '/',
    hierarchy_level = 0
WHERE hierarchy_path IS NULL;
