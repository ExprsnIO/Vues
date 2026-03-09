-- Phase 8-10: Advanced CA, Auth & Token Infrastructure
-- Certificate Templates, Audit Log, API Tokens, Session Bindings

-- Certificate Templates
CREATE TABLE IF NOT EXISTS certificate_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  template_type TEXT NOT NULL,
  key_size INTEGER NOT NULL DEFAULT 2048,
  signature_algorithm TEXT NOT NULL DEFAULT 'sha256',
  validity_days INTEGER NOT NULL DEFAULT 365,
  key_usage JSONB DEFAULT '["digitalSignature", "keyEncipherment"]',
  extended_key_usage JSONB DEFAULT '["clientAuth"]',
  san_template TEXT,
  policy_oids JSONB,
  is_default BOOLEAN DEFAULT false,
  is_system BOOLEAN DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS cert_templates_name_idx ON certificate_templates (name);
CREATE INDEX IF NOT EXISTS cert_templates_type_idx ON certificate_templates (template_type);
CREATE INDEX IF NOT EXISTS cert_templates_default_idx ON certificate_templates (is_default);

-- CA Audit Log
CREATE TABLE IF NOT EXISTS ca_audit_log (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  event_category TEXT NOT NULL,
  certificate_id TEXT,
  certificate_serial_number TEXT,
  subject_did TEXT,
  performed_by TEXT NOT NULL,
  performed_by_ip TEXT,
  performed_by_user_agent TEXT,
  details JSONB,
  severity TEXT NOT NULL DEFAULT 'info',
  success BOOLEAN NOT NULL DEFAULT true,
  error_message TEXT,
  timestamp TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ca_audit_event_type_idx ON ca_audit_log (event_type);
CREATE INDEX IF NOT EXISTS ca_audit_category_idx ON ca_audit_log (event_category);
CREATE INDEX IF NOT EXISTS ca_audit_subject_did_idx ON ca_audit_log (subject_did);
CREATE INDEX IF NOT EXISTS ca_audit_performed_by_idx ON ca_audit_log (performed_by);
CREATE INDEX IF NOT EXISTS ca_audit_timestamp_idx ON ca_audit_log (timestamp);
CREATE INDEX IF NOT EXISTS ca_audit_severity_idx ON ca_audit_log (severity);

-- API Tokens
CREATE TABLE IF NOT EXISTS api_tokens (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  token_prefix TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  owner_did TEXT NOT NULL,
  certificate_id TEXT REFERENCES ca_entity_certificates(id) ON DELETE SET NULL,
  token_type TEXT NOT NULL,
  scopes JSONB NOT NULL,
  allowed_ips JSONB,
  allowed_origins JSONB,
  rate_limit INTEGER,
  expires_at TIMESTAMP,
  last_used_at TIMESTAMP,
  last_used_ip TEXT,
  usage_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMP,
  revoked_by TEXT,
  revoked_reason TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS api_tokens_hash_idx ON api_tokens (token_hash);
CREATE INDEX IF NOT EXISTS api_tokens_owner_did_idx ON api_tokens (owner_did);
CREATE INDEX IF NOT EXISTS api_tokens_type_idx ON api_tokens (token_type);
CREATE INDEX IF NOT EXISTS api_tokens_status_idx ON api_tokens (status);
CREATE INDEX IF NOT EXISTS api_tokens_expires_at_idx ON api_tokens (expires_at);

-- API Token Scopes
CREATE TABLE IF NOT EXISTS api_token_scopes (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  permissions JSONB NOT NULL,
  requires_certificate BOOLEAN DEFAULT false,
  requires_organization BOOLEAN DEFAULT false,
  is_deprecated BOOLEAN DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS api_token_scopes_scope_idx ON api_token_scopes (scope);
CREATE INDEX IF NOT EXISTS api_token_scopes_category_idx ON api_token_scopes (category);

-- Session Certificate Bindings
CREATE TABLE IF NOT EXISTS session_certificate_bindings (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  certificate_fingerprint TEXT NOT NULL,
  did TEXT NOT NULL,
  bound_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_verified TIMESTAMP,
  status TEXT NOT NULL DEFAULT 'active'
);

CREATE UNIQUE INDEX IF NOT EXISTS session_cert_session_id_idx ON session_certificate_bindings (session_id);
CREATE INDEX IF NOT EXISTS session_cert_fingerprint_idx ON session_certificate_bindings (certificate_fingerprint);
CREATE INDEX IF NOT EXISTS session_cert_did_idx ON session_certificate_bindings (did);
CREATE INDEX IF NOT EXISTS session_cert_status_idx ON session_certificate_bindings (status);

-- Certificate Authentication Challenges
CREATE TABLE IF NOT EXISTS cert_auth_challenges (
  id TEXT PRIMARY KEY,
  certificate_fingerprint TEXT NOT NULL,
  challenge TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS cert_auth_challenges_fingerprint_idx ON cert_auth_challenges (certificate_fingerprint);
CREATE INDEX IF NOT EXISTS cert_auth_challenges_expires_at_idx ON cert_auth_challenges (expires_at);

-- CRL History
CREATE TABLE IF NOT EXISTS ca_crl_history (
  id TEXT PRIMARY KEY,
  crl_pem TEXT NOT NULL,
  cert_count INTEGER NOT NULL,
  crl_number INTEGER,
  generated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  generated_by TEXT
);

CREATE INDEX IF NOT EXISTS ca_crl_history_generated_at_idx ON ca_crl_history (generated_at);
CREATE INDEX IF NOT EXISTS ca_crl_history_expires_at_idx ON ca_crl_history (expires_at);

-- Certificate Pins
CREATE TABLE IF NOT EXISTS certificate_pins (
  id TEXT PRIMARY KEY,
  pin_type TEXT NOT NULL,
  fingerprint TEXT NOT NULL UNIQUE,
  certificate_id TEXT,
  valid_from TIMESTAMP NOT NULL DEFAULT NOW(),
  valid_until TIMESTAMP NOT NULL,
  is_backup BOOLEAN DEFAULT false,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS cert_pins_fingerprint_idx ON certificate_pins (fingerprint);
CREATE INDEX IF NOT EXISTS cert_pins_type_idx ON certificate_pins (pin_type);
CREATE INDEX IF NOT EXISTS cert_pins_status_idx ON certificate_pins (status);

-- Pin Violation Reports
CREATE TABLE IF NOT EXISTS pin_violation_reports (
  id TEXT PRIMARY KEY,
  expected_pins JSONB NOT NULL,
  received_chain JSONB,
  hostname TEXT NOT NULL,
  user_agent TEXT,
  client_ip TEXT,
  reported_at TIMESTAMP NOT NULL DEFAULT NOW(),
  details JSONB
);

CREATE INDEX IF NOT EXISTS pin_violation_hostname_idx ON pin_violation_reports (hostname);
CREATE INDEX IF NOT EXISTS pin_violation_reported_at_idx ON pin_violation_reports (reported_at);

-- Add isService column to actor_repos if it doesn't exist
ALTER TABLE actor_repos ADD COLUMN IF NOT EXISTS is_service BOOLEAN DEFAULT false;

-- Seed default certificate templates
INSERT INTO certificate_templates (id, name, display_name, description, template_type, key_size, validity_days, key_usage, extended_key_usage, san_template, is_default, is_system)
VALUES
  ('tmpl_creator', 'creator-identity', 'Creator Identity', 'Certificate for individual creators', 'creator', 2048, 365, '["digitalSignature", "keyEncipherment"]', '["clientAuth", "emailProtection"]', '{"email":"${email}","uri":"at://${handle}"}', true, true),
  ('tmpl_org_member', 'organization-member', 'Organization Member', 'Certificate for organization members', 'org_member', 2048, 365, '["digitalSignature", "keyEncipherment", "nonRepudiation"]', '["clientAuth", "emailProtection"]', '{"email":"${email}","uri":"at://${handle}","directoryName":"O=${orgName}"}', false, true),
  ('tmpl_service', 'service-account', 'Service Account', 'Certificate for service accounts', 'service', 4096, 730, '["digitalSignature", "keyEncipherment"]', '["clientAuth", "serverAuth"]', '{"dns":"${serviceDomain}"}', false, true),
  ('tmpl_device', 'device-certificate', 'Device Certificate', 'Certificate for devices', 'device', 2048, 365, '["digitalSignature"]', '["clientAuth"]', '{"uri":"urn:device:${deviceId}"}', false, true)
ON CONFLICT (name) DO NOTHING;

-- Seed default API token scopes
INSERT INTO api_token_scopes (id, scope, display_name, description, category, permissions, requires_certificate, requires_organization)
VALUES
  ('scope_read_profile', 'read:profile', 'Read Profile', 'Read user profile information', 'read', '["profile.read"]', false, false),
  ('scope_read_videos', 'read:videos', 'Read Videos', 'Read video content and metadata', 'read', '["videos.read", "feed.read"]', false, false),
  ('scope_write_videos', 'write:videos', 'Write Videos', 'Create, update, and delete videos', 'write', '["videos.create", "videos.update", "videos.delete"]', false, false),
  ('scope_read_analytics', 'read:analytics', 'Read Analytics', 'Read analytics data', 'read', '["analytics.read"]', false, false),
  ('scope_write_comments', 'write:comments', 'Write Comments', 'Create and delete comments', 'write', '["comments.create", "comments.delete"]', false, false),
  ('scope_admin_org', 'admin:org', 'Administer Organization', 'Manage organization settings and members', 'admin', '["org.manage", "org.members"]', false, true),
  ('scope_service_upload', 'service:upload', 'Upload Service', 'Service-level upload permissions', 'service', '["upload.presign", "upload.complete"]', true, false),
  ('scope_service_render', 'service:render', 'Render Service', 'Service-level render permissions', 'service', '["render.submit", "render.status"]', true, false),
  ('scope_service_federation', 'service:federation', 'Federation Service', 'Service-level federation permissions', 'service', '["federation.sync", "federation.publish"]', true, false)
ON CONFLICT (scope) DO NOTHING;
