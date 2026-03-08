-- Phase 5 & 6 Features Migration
-- Moderation, Appeals, Security, and Observability infrastructure

-- ==========================================
-- PHASE 5.1: SLA Tracking
-- ==========================================

-- SLA configurations per domain
CREATE TABLE IF NOT EXISTS domain_sla_configs (
  domain_id TEXT PRIMARY KEY REFERENCES domains(id) ON DELETE CASCADE,
  configs JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- SLA alerts
CREATE TABLE IF NOT EXISTS sla_alerts (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  severity TEXT NOT NULL,
  item_id TEXT,
  item_type TEXT,
  domain_id TEXT NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  acknowledged_at TIMESTAMP,
  acknowledged_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_sla_alerts_domain ON sla_alerts(domain_id);
CREATE INDEX IF NOT EXISTS idx_sla_alerts_type ON sla_alerts(type);
CREATE INDEX IF NOT EXISTS idx_sla_alerts_severity ON sla_alerts(severity);
CREATE INDEX IF NOT EXISTS idx_sla_alerts_created ON sla_alerts(created_at);

-- Add SLA fields to moderation_reports
ALTER TABLE moderation_reports ADD COLUMN IF NOT EXISTS first_response_at TIMESTAMP;
ALTER TABLE moderation_reports ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP;
ALTER TABLE moderation_reports ADD COLUMN IF NOT EXISTS assigned_to TEXT;
ALTER TABLE moderation_reports ADD COLUMN IF NOT EXISTS resolved_by TEXT;
ALTER TABLE moderation_reports ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'medium';

CREATE INDEX IF NOT EXISTS idx_moderation_reports_assigned ON moderation_reports(assigned_to);
CREATE INDEX IF NOT EXISTS idx_moderation_reports_priority ON moderation_reports(priority);

-- ==========================================
-- PHASE 5.2: Appeals System
-- ==========================================

-- Appeals table
CREATE TABLE IF NOT EXISTS moderation_appeals (
  id TEXT PRIMARY KEY,
  original_action_id TEXT NOT NULL,
  original_action_type TEXT NOT NULL,
  user_id TEXT NOT NULL,
  domain_id TEXT NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  evidence TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  priority TEXT NOT NULL DEFAULT 'medium',
  assigned_to TEXT,
  reviewed_by TEXT,
  outcome TEXT,
  outcome_reason TEXT,
  original_moderator TEXT,
  original_decision TEXT,
  original_decision_at TIMESTAMP,
  first_response_at TIMESTAMP,
  resolved_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_appeals_user ON moderation_appeals(user_id);
CREATE INDEX IF NOT EXISTS idx_appeals_domain ON moderation_appeals(domain_id);
CREATE INDEX IF NOT EXISTS idx_appeals_status ON moderation_appeals(status);
CREATE INDEX IF NOT EXISTS idx_appeals_priority ON moderation_appeals(priority);
CREATE INDEX IF NOT EXISTS idx_appeals_assigned ON moderation_appeals(assigned_to);
CREATE INDEX IF NOT EXISTS idx_appeals_original_action ON moderation_appeals(original_action_id);

-- Appeal history
CREATE TABLE IF NOT EXISTS appeal_history (
  id TEXT PRIMARY KEY,
  appeal_id TEXT NOT NULL REFERENCES moderation_appeals(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_appeal_history_appeal ON appeal_history(appeal_id);

-- Appeal info requests
CREATE TABLE IF NOT EXISTS appeal_info_requests (
  id TEXT PRIMARY KEY,
  appeal_id TEXT NOT NULL REFERENCES moderation_appeals(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  deadline TIMESTAMP,
  requested_by TEXT NOT NULL,
  response TEXT,
  responded_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_appeal_info_requests_appeal ON appeal_info_requests(appeal_id);

-- ==========================================
-- PHASE 5.3: Domain Moderation
-- ==========================================

-- Moderation policies
CREATE TABLE IF NOT EXISTS moderation_policies (
  id TEXT PRIMARY KEY,
  domain_id TEXT NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  priority INTEGER NOT NULL DEFAULT 0,
  conditions JSONB NOT NULL DEFAULT '[]',
  actions JSONB NOT NULL DEFAULT '[]',
  exception_rules JSONB DEFAULT '[]',
  inherit_from_parent INTEGER NOT NULL DEFAULT 0,
  allow_child_override INTEGER NOT NULL DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_by TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_moderation_policies_domain ON moderation_policies(domain_id);
CREATE INDEX IF NOT EXISTS idx_moderation_policies_type ON moderation_policies(type);
CREATE INDEX IF NOT EXISTS idx_moderation_policies_enabled ON moderation_policies(enabled);
CREATE UNIQUE INDEX IF NOT EXISTS idx_moderation_policies_name ON moderation_policies(domain_id, name);

-- Word filters
CREATE TABLE IF NOT EXISTS word_filters (
  id TEXT PRIMARY KEY,
  domain_id TEXT NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  words JSONB NOT NULL DEFAULT '[]',
  patterns JSONB DEFAULT '[]',
  action TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium',
  enabled INTEGER NOT NULL DEFAULT 1,
  case_sensitive INTEGER NOT NULL DEFAULT 0,
  whole_word INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_word_filters_domain ON word_filters(domain_id);
CREATE INDEX IF NOT EXISTS idx_word_filters_category ON word_filters(category);
CREATE INDEX IF NOT EXISTS idx_word_filters_enabled ON word_filters(enabled);

-- Shadow bans
CREATE TABLE IF NOT EXISTS shadow_bans (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  domain_id TEXT NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  scope TEXT NOT NULL DEFAULT 'full',
  visible_to TEXT NOT NULL DEFAULT 'self_only',
  reason TEXT NOT NULL,
  expires_at TIMESTAMP,
  created_by TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, domain_id)
);

CREATE INDEX IF NOT EXISTS idx_shadow_bans_user ON shadow_bans(user_id);
CREATE INDEX IF NOT EXISTS idx_shadow_bans_domain ON shadow_bans(domain_id);
CREATE INDEX IF NOT EXISTS idx_shadow_bans_expires ON shadow_bans(expires_at);

-- Domain moderation configuration
CREATE TABLE IF NOT EXISTS domain_moderation_config (
  domain_id TEXT PRIMARY KEY REFERENCES domains(id) ON DELETE CASCADE,
  auto_moderation_enabled INTEGER NOT NULL DEFAULT 1,
  ai_moderation_enabled INTEGER NOT NULL DEFAULT 1,
  require_review_new_users INTEGER NOT NULL DEFAULT 0,
  new_user_review_days INTEGER NOT NULL DEFAULT 7,
  trust_level_thresholds JSONB DEFAULT '[]',
  appeal_enabled INTEGER NOT NULL DEFAULT 1,
  appeal_cooldown_hours INTEGER NOT NULL DEFAULT 72,
  max_active_appeals INTEGER NOT NULL DEFAULT 3,
  shadow_ban_enabled INTEGER NOT NULL DEFAULT 1,
  notify_on_flag INTEGER NOT NULL DEFAULT 1,
  notify_on_removal INTEGER NOT NULL DEFAULT 1,
  escalation_thresholds JSONB DEFAULT '[]',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Moderation audit log
CREATE TABLE IF NOT EXISTS moderation_audit_log (
  id TEXT PRIMARY KEY,
  action_type TEXT NOT NULL,
  target_user_id TEXT,
  target_content_id TEXT,
  domain_id TEXT REFERENCES domains(id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL,
  reason TEXT,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_moderation_audit_target_user ON moderation_audit_log(target_user_id);
CREATE INDEX IF NOT EXISTS idx_moderation_audit_domain ON moderation_audit_log(domain_id);
CREATE INDEX IF NOT EXISTS idx_moderation_audit_actor ON moderation_audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_moderation_audit_created ON moderation_audit_log(created_at);

-- ==========================================
-- PHASE 6.2: Security
-- ==========================================

-- Access tokens
CREATE TABLE IF NOT EXISTS access_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  domain_id TEXT,
  scopes JSONB NOT NULL DEFAULT '[]',
  client_id TEXT,
  token_hash TEXT NOT NULL,
  rotated_from_id TEXT,
  expires_at TIMESTAMP NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0,
  revoked_at TIMESTAMP,
  revoked_reason TEXT,
  ip_address TEXT,
  user_agent TEXT,
  last_used_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_access_tokens_user ON access_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_access_tokens_hash ON access_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_access_tokens_expires ON access_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_access_tokens_revoked ON access_tokens(revoked);

-- Refresh tokens
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id TEXT PRIMARY KEY,
  access_token_id TEXT NOT NULL REFERENCES access_tokens(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  domain_id TEXT,
  token_hash TEXT NOT NULL,
  rotation_count INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMP NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0,
  last_rotated_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_access ON refresh_tokens(access_token_id);

-- MFA configurations
CREATE TABLE IF NOT EXISTS mfa_configs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  method TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  verified INTEGER NOT NULL DEFAULT 0,
  secret TEXT,
  phone_number TEXT,
  email TEXT,
  backup_codes JSONB,
  webauthn_credentials JSONB,
  last_used_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, method)
);

CREATE INDEX IF NOT EXISTS idx_mfa_configs_user ON mfa_configs(user_id);
CREATE INDEX IF NOT EXISTS idx_mfa_configs_method ON mfa_configs(method);

-- MFA challenges
CREATE TABLE IF NOT EXISTS mfa_challenges (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  method TEXT NOT NULL,
  code_hash TEXT,
  expires_at TIMESTAMP NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  verified INTEGER NOT NULL DEFAULT 0,
  verified_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_mfa_challenges_user ON mfa_challenges(user_id);
CREATE INDEX IF NOT EXISTS idx_mfa_challenges_expires ON mfa_challenges(expires_at);

-- Encryption keys
CREATE TABLE IF NOT EXISTS encryption_keys (
  id TEXT PRIMARY KEY,
  key_value TEXT NOT NULL,
  algorithm TEXT NOT NULL DEFAULT 'aes-256-gcm',
  status TEXT NOT NULL DEFAULT 'active',
  rotated_from_id TEXT,
  rotated_at TIMESTAMP,
  expires_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_encryption_keys_status ON encryption_keys(status);

-- User sanctions (for appeals system)
CREATE TABLE IF NOT EXISTS user_sanctions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  domain_id TEXT REFERENCES domains(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  reason TEXT NOT NULL,
  duration_hours INTEGER,
  expires_at TIMESTAMP,
  voided INTEGER NOT NULL DEFAULT 0,
  voided_reason TEXT,
  voided_at TIMESTAMP,
  modified_reason TEXT,
  issued_by TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_sanctions_user ON user_sanctions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sanctions_domain ON user_sanctions(domain_id);
CREATE INDEX IF NOT EXISTS idx_user_sanctions_type ON user_sanctions(type);
CREATE INDEX IF NOT EXISTS idx_user_sanctions_expires ON user_sanctions(expires_at);
CREATE INDEX IF NOT EXISTS idx_user_sanctions_voided ON user_sanctions(voided);

-- Content removals (for appeals system)
CREATE TABLE IF NOT EXISTS content_removals (
  id TEXT PRIMARY KEY,
  content_id TEXT NOT NULL,
  content_type TEXT NOT NULL,
  domain_id TEXT REFERENCES domains(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  outcome TEXT,
  removed_by TEXT NOT NULL,
  resolved_by TEXT,
  resolved_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_content_removals_content ON content_removals(content_id);
CREATE INDEX IF NOT EXISTS idx_content_removals_domain ON content_removals(domain_id);

-- Account actions (for appeals system)
CREATE TABLE IF NOT EXISTS account_actions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  domain_id TEXT REFERENCES domains(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  reason TEXT NOT NULL,
  outcome TEXT,
  performed_by TEXT NOT NULL,
  resolved_by TEXT,
  resolved_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_account_actions_user ON account_actions(user_id);
CREATE INDEX IF NOT EXISTS idx_account_actions_domain ON account_actions(domain_id);
