-- Phase 3 & 4 Features Migration
-- Domain management, RBAC, service health, and SSO enhancements

-- Domain roles for RBAC
CREATE TABLE IF NOT EXISTS domain_roles (
  id TEXT PRIMARY KEY,
  domain_id TEXT NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  permissions TEXT[] NOT NULL DEFAULT '{}',
  is_system INTEGER NOT NULL DEFAULT 0,
  parent_role_id TEXT REFERENCES domain_roles(id),
  priority INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_domain_roles_domain ON domain_roles(domain_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_domain_roles_name ON domain_roles(domain_id, name);

-- User role assignments
CREATE TABLE IF NOT EXISTS domain_user_roles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  role_id TEXT NOT NULL REFERENCES domain_roles(id) ON DELETE CASCADE,
  domain_id TEXT NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  granted_by TEXT,
  granted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_domain_user_roles_user ON domain_user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_domain_user_roles_role ON domain_user_roles(role_id);
CREATE INDEX IF NOT EXISTS idx_domain_user_roles_domain ON domain_user_roles(domain_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_domain_user_roles_unique ON domain_user_roles(user_id, role_id, domain_id);

-- Domain groups
CREATE TABLE IF NOT EXISTS domain_groups (
  id TEXT PRIMARY KEY,
  domain_id TEXT NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  role_ids TEXT[] NOT NULL DEFAULT '{}',
  member_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_domain_groups_domain ON domain_groups(domain_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_domain_groups_name ON domain_groups(domain_id, name);

-- Group members
CREATE TABLE IF NOT EXISTS domain_group_members (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES domain_groups(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  added_by TEXT,
  added_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_domain_group_members_group ON domain_group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_domain_group_members_user ON domain_group_members(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_domain_group_members_unique ON domain_group_members(group_id, user_id);

-- Domain services
CREATE TABLE IF NOT EXISTS domain_services (
  id TEXT PRIMARY KEY,
  domain_id TEXT NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  endpoint TEXT NOT NULL,
  health_endpoint TEXT,
  status TEXT NOT NULL DEFAULT 'unknown',
  last_checked_at TIMESTAMP,
  last_healthy_at TIMESTAMP,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  config JSONB DEFAULT '{}',
  priority INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_domain_services_domain ON domain_services(domain_id);
CREATE INDEX IF NOT EXISTS idx_domain_services_type ON domain_services(type);
CREATE INDEX IF NOT EXISTS idx_domain_services_status ON domain_services(status);

-- Service health checks history
CREATE TABLE IF NOT EXISTS service_health_checks (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL REFERENCES domain_services(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  response_time INTEGER,
  details JSONB DEFAULT '{}',
  error TEXT,
  checked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_service_health_checks_service ON service_health_checks(service_id);
CREATE INDEX IF NOT EXISTS idx_service_health_checks_checked_at ON service_health_checks(checked_at);

-- Domain user invitations
CREATE TABLE IF NOT EXISTS domain_invitations (
  id TEXT PRIMARY KEY,
  domain_id TEXT NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role_ids TEXT[] NOT NULL DEFAULT '{}',
  group_ids TEXT[] NOT NULL DEFAULT '{}',
  invited_by TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  accepted_at TIMESTAMP,
  accepted_by TEXT,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_domain_invitations_domain ON domain_invitations(domain_id);
CREATE INDEX IF NOT EXISTS idx_domain_invitations_email ON domain_invitations(email);
CREATE INDEX IF NOT EXISTS idx_domain_invitations_token ON domain_invitations(token);
CREATE INDEX IF NOT EXISTS idx_domain_invitations_status ON domain_invitations(status);

-- OAuth states (for social login CSRF protection)
CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  nonce TEXT,
  redirect_uri TEXT,
  user_did TEXT,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_oauth_states_expires ON oauth_states(expires_at);

-- Domain SSO configuration
CREATE TABLE IF NOT EXISTS domain_sso_config (
  id TEXT PRIMARY KEY,
  domain_id TEXT NOT NULL UNIQUE REFERENCES domains(id) ON DELETE CASCADE,
  sso_mode TEXT NOT NULL DEFAULT 'optional',
  primary_idp_id TEXT,
  allowed_idp_ids TEXT[] NOT NULL DEFAULT '{}',
  jit_provisioning INTEGER NOT NULL DEFAULT 1,
  default_organization_id TEXT,
  default_role TEXT DEFAULT 'member',
  email_domain_verification INTEGER NOT NULL DEFAULT 1,
  allowed_email_domains TEXT[] NOT NULL DEFAULT '{}',
  force_reauth_after_hours INTEGER NOT NULL DEFAULT 24,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_domain_sso_config_domain ON domain_sso_config(domain_id);

-- External identity providers
CREATE TABLE IF NOT EXISTS external_identity_providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  provider_key TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'oidc',
  display_name TEXT NOT NULL,
  icon_url TEXT,
  button_color TEXT,
  client_id TEXT,
  client_secret TEXT,
  authorization_endpoint TEXT,
  token_endpoint TEXT,
  userinfo_endpoint TEXT,
  jwks_uri TEXT,
  issuer TEXT,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  claim_mapping JSONB DEFAULT '{}',
  domain_id TEXT REFERENCES domains(id) ON DELETE CASCADE,
  organization_id TEXT,
  auto_provision_users INTEGER NOT NULL DEFAULT 1,
  default_role TEXT DEFAULT 'member',
  required_email_domain TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  priority INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_external_identity_providers_key ON external_identity_providers(provider_key);
CREATE INDEX IF NOT EXISTS idx_external_identity_providers_domain ON external_identity_providers(domain_id);
CREATE INDEX IF NOT EXISTS idx_external_identity_providers_status ON external_identity_providers(status);

-- External identities (linked accounts)
CREATE TABLE IF NOT EXISTS external_identities (
  id TEXT PRIMARY KEY,
  user_did TEXT NOT NULL,
  provider_id TEXT NOT NULL REFERENCES external_identity_providers(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  email TEXT,
  display_name TEXT,
  avatar TEXT,
  profile_url TEXT,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMP,
  raw_profile JSONB DEFAULT '{}',
  linked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_external_identities_user ON external_identities(user_did);
CREATE INDEX IF NOT EXISTS idx_external_identities_provider ON external_identities(provider_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_external_identities_unique ON external_identities(provider_id, external_id);
CREATE INDEX IF NOT EXISTS idx_external_identities_email ON external_identities(email);

-- SSO audit log
CREATE TABLE IF NOT EXISTS sso_audit_log (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  user_did TEXT,
  client_id TEXT,
  provider_id TEXT,
  domain_id TEXT,
  ip_address TEXT,
  user_agent TEXT,
  success INTEGER NOT NULL DEFAULT 1,
  error_message TEXT,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sso_audit_log_user ON sso_audit_log(user_did);
CREATE INDEX IF NOT EXISTS idx_sso_audit_log_event ON sso_audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_sso_audit_log_created ON sso_audit_log(created_at);

-- Add domain_id to users if not exists
ALTER TABLE users ADD COLUMN IF NOT EXISTS domain_id TEXT REFERENCES domains(id);

CREATE INDEX IF NOT EXISTS idx_users_domain ON users(domain_id);

-- Add domain_id to videos if not exists
ALTER TABLE videos ADD COLUMN IF NOT EXISTS domain_id TEXT REFERENCES domains(id);

CREATE INDEX IF NOT EXISTS idx_videos_domain ON videos(domain_id);

-- Add domain_id to moderation_reports if not exists
ALTER TABLE moderation_reports ADD COLUMN IF NOT EXISTS domain_id TEXT REFERENCES domains(id);

CREATE INDEX IF NOT EXISTS idx_moderation_reports_domain ON moderation_reports(domain_id);
