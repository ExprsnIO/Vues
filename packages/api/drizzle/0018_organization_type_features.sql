-- Organization Type Features Migration
-- Adds type-specific configuration, custom data storage, and verification workflow

-- Create organization type configs table
CREATE TABLE IF NOT EXISTS organization_type_configs (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  handle_suffix TEXT NOT NULL,
  verification_required BOOLEAN DEFAULT FALSE NOT NULL,
  verification_workflow TEXT,
  custom_did_services JSONB,
  handle_validation_rules JSONB,
  default_roles JSONB,
  enabled_features JSONB DEFAULT '[]',
  disabled_features JSONB DEFAULT '[]',
  subscription_overrides JSONB,
  content_policies JSONB,
  custom_fields_schema JSONB,
  is_active BOOLEAN DEFAULT TRUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS org_type_configs_active_idx ON organization_type_configs(is_active);

-- Create organization custom data table
CREATE TABLE IF NOT EXISTS organization_custom_data (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  data_type TEXT NOT NULL,
  data JSONB NOT NULL,
  parent_id TEXT,
  status TEXT DEFAULT 'active' NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS org_custom_data_org_idx ON organization_custom_data(organization_id);
CREATE INDEX IF NOT EXISTS org_custom_data_type_idx ON organization_custom_data(data_type);
CREATE INDEX IF NOT EXISTS org_custom_data_parent_idx ON organization_custom_data(parent_id);
CREATE INDEX IF NOT EXISTS org_custom_data_status_idx ON organization_custom_data(status);
CREATE INDEX IF NOT EXISTS org_custom_data_org_type_idx ON organization_custom_data(organization_id, data_type);

-- Add verification columns to organizations table
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS custom_fields JSONB;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'none' NOT NULL;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS verification_submitted_at TIMESTAMP;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS verification_completed_at TIMESTAMP;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS verification_notes TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS verification_documents JSONB;

CREATE INDEX IF NOT EXISTS organizations_verification_status_idx ON organizations(verification_status);

-- Seed default type configurations
INSERT INTO organization_type_configs (id, display_name, description, handle_suffix, verification_required, default_roles, enabled_features, is_active) VALUES
('team', 'Team', 'Collaborative team for content creation', 'org.exprsn', FALSE, '[]', '[]', TRUE),
('company', 'Company', 'Business organization', 'org.exprsn', FALSE, '[]', '[]', TRUE),
('brand', 'Brand', 'Brand marketing and campaigns', 'brand.exprsn', TRUE, '[{"name":"campaign_manager","displayName":"Campaign Manager","description":"Creates and manages marketing campaigns","permissions":["org.campaigns.manage","org.campaigns.view","org.content.publish","org.analytics.view"],"color":"#ec4899","priority":70},{"name":"creative_director","displayName":"Creative Director","description":"Oversees creative content and brand guidelines","permissions":["org.content.review","org.content.publish","org.guidelines.manage","org.analytics.view"],"color":"#14b8a6","priority":65},{"name":"influencer_liaison","displayName":"Influencer Liaison","description":"Manages influencer relationships and partnerships","permissions":["org.influencers.manage","org.influencers.view","org.campaigns.view"],"color":"#f97316","priority":50}]', '["campaign_management","influencer_connections","brand_guidelines"]', TRUE),
('network', 'Network', 'Content network management', 'network.exprsn', TRUE, '[{"name":"channel_manager","displayName":"Channel Manager","description":"Manages network channels and content distribution","permissions":["org.channels.manage","org.channels.view","org.content.publish","org.analytics.view"],"color":"#0ea5e9","priority":70},{"name":"talent_coordinator","displayName":"Talent Coordinator","description":"Coordinates talent and content creators","permissions":["org.talent.manage","org.talent.view","org.members.invite","org.analytics.view"],"color":"#a855f7","priority":65}]', '["channel_management","talent_coordination","network_analytics"]', TRUE),
('channel', 'Channel', 'Individual content channel', 'channel.exprsn', FALSE, '[]', '[]', TRUE),
('enterprise', 'Enterprise', 'Large organization with departments', 'ent.exprsn', TRUE, '[{"name":"department_head","displayName":"Department Head","description":"Manages department structure and team members","permissions":["org.department.manage","org.department.view","org.members.manage","org.members.invite","org.analytics.view"],"color":"#6366f1","priority":75},{"name":"compliance_officer","displayName":"Compliance Officer","description":"Manages compliance policies and auditing","permissions":["org.compliance.manage","org.compliance.view","org.audit.view","org.audit.export","org.content.review"],"color":"#dc2626","priority":70},{"name":"hr_manager","displayName":"HR Manager","description":"Handles human resources and member onboarding","permissions":["org.members.manage","org.members.invite","org.members.remove","org.department.view"],"color":"#84cc16","priority":60}]', '["department_hierarchy","compliance_settings","sso_integration","audit_logging"]', TRUE),
('nonprofit', 'Nonprofit', 'Nonprofit organization', 'npo.exprsn', TRUE, '[{"name":"program_director","displayName":"Program Director","description":"Directs organizational programs and initiatives","permissions":["org.programs.manage","org.content.publish","org.content.review","org.analytics.view","org.analytics.export"],"color":"#10b981","priority":70},{"name":"donor_relations","displayName":"Donor Relations","description":"Manages donor relationships and communications","permissions":["org.donors.manage","org.donors.view","org.grants.view","org.analytics.view"],"color":"#f59e0b","priority":60},{"name":"volunteer_coordinator","displayName":"Volunteer Coordinator","description":"Coordinates volunteer activities and engagement","permissions":["org.volunteers.manage","org.volunteers.view","org.members.invite"],"color":"#06b6d4","priority":50}]', '["donor_management","grant_tracking","volunteer_coordination"]', TRUE),
('business', 'Business', 'Small to medium business', 'org.exprsn', FALSE, '[]', '[]', TRUE),
('label', 'Music Label', 'Record label and music distribution', 'label.exprsn', TRUE, '[{"name":"ar_manager","displayName":"A&R Manager","description":"Manages artists, talent scouting, and creative direction","permissions":["org.artists.manage","org.artists.view","org.content.publish","org.analytics.view"],"color":"#8b5cf6","priority":70},{"name":"catalog_manager","displayName":"Catalog Manager","description":"Manages music catalog, releases, and metadata","permissions":["org.catalog.manage","org.catalog.view","org.content.review","org.analytics.view"],"color":"#06b6d4","priority":65},{"name":"artist","displayName":"Artist","description":"Signed artist with publishing rights","permissions":["org.content.publish","org.analytics.view","org.royalties.view"],"color":"#f59e0b","priority":40}]', '["artist_management","catalog_management","royalty_tracking","distribution"]', TRUE)
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  handle_suffix = EXCLUDED.handle_suffix,
  verification_required = EXCLUDED.verification_required,
  default_roles = EXCLUDED.default_roles,
  enabled_features = EXCLUDED.enabled_features,
  updated_at = NOW();
