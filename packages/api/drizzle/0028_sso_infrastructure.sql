-- SSO Infrastructure Migration
-- Adds OAuth2/OIDC Provider, SAML Provider, OAuth Consumer, and Domain SSO tables

-- ============================================
-- OIDC PROVIDER TABLES (Exprsn as Identity Provider)
-- ============================================

-- OAuth2 Client Applications
CREATE TABLE IF NOT EXISTS oauth_clients (
  id TEXT PRIMARY KEY,
  client_id TEXT UNIQUE NOT NULL,
  client_secret_hash TEXT,  -- NULL for public clients (PKCE-only)
  client_name TEXT NOT NULL,
  client_uri TEXT,
  logo_uri TEXT,

  -- Client type
  client_type TEXT NOT NULL DEFAULT 'confidential', -- 'confidential' | 'public'
  application_type TEXT DEFAULT 'web', -- 'web' | 'native' | 'spa'

  -- OAuth settings
  redirect_uris JSONB NOT NULL DEFAULT '[]',
  post_logout_redirect_uris JSONB DEFAULT '[]',
  grant_types JSONB NOT NULL DEFAULT '["authorization_code"]',
  response_types JSONB NOT NULL DEFAULT '["code"]',

  -- Token settings
  token_endpoint_auth_method TEXT DEFAULT 'client_secret_basic', -- 'client_secret_basic' | 'client_secret_post' | 'private_key_jwt' | 'none'
  access_token_ttl_seconds INTEGER DEFAULT 3600,
  refresh_token_ttl_seconds INTEGER DEFAULT 2592000, -- 30 days
  id_token_ttl_seconds INTEGER DEFAULT 3600,

  -- Scopes and permissions
  allowed_scopes JSONB NOT NULL DEFAULT '["openid", "profile", "email"]',
  require_consent BOOLEAN DEFAULT true,
  require_pkce BOOLEAN DEFAULT true,

  -- Client JWKS (for private_key_jwt auth)
  jwks_uri TEXT,
  jwks JSONB,

  -- Domain/Organization scoping (optional)
  domain_id TEXT REFERENCES domains(id) ON DELETE SET NULL,
  organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,

  -- Ownership and metadata
  owner_did TEXT REFERENCES users(did) ON DELETE SET NULL,
  contacts JSONB,
  tos_uri TEXT,
  policy_uri TEXT,

  -- Status
  status TEXT DEFAULT 'active', -- 'active' | 'suspended' | 'pending_approval'
  approved_by TEXT,
  approved_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS oauth_clients_client_id_idx ON oauth_clients(client_id);
CREATE INDEX IF NOT EXISTS oauth_clients_domain_idx ON oauth_clients(domain_id);
CREATE INDEX IF NOT EXISTS oauth_clients_owner_idx ON oauth_clients(owner_did);
CREATE INDEX IF NOT EXISTS oauth_clients_status_idx ON oauth_clients(status);

-- Authorization codes (short-lived, single-use)
CREATE TABLE IF NOT EXISTS oauth_authorization_codes (
  code TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  user_did TEXT NOT NULL REFERENCES users(did) ON DELETE CASCADE,

  -- Code details
  redirect_uri TEXT NOT NULL,
  scope TEXT NOT NULL,
  code_challenge TEXT,
  code_challenge_method TEXT, -- 'S256' | 'plain'
  nonce TEXT,  -- For OIDC
  state TEXT,

  -- Expiration (typically 10 minutes)
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,  -- NULL if not yet used, set on exchange

  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS oauth_auth_codes_client_idx ON oauth_authorization_codes(client_id);
CREATE INDEX IF NOT EXISTS oauth_auth_codes_user_idx ON oauth_authorization_codes(user_did);
CREATE INDEX IF NOT EXISTS oauth_auth_codes_expires_idx ON oauth_authorization_codes(expires_at);

-- OAuth Access/Refresh Tokens (for clients accessing Exprsn APIs)
CREATE TABLE IF NOT EXISTS oauth_tokens (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  user_did TEXT NOT NULL REFERENCES users(did) ON DELETE CASCADE,

  -- Token hashes (never store raw tokens)
  access_token_hash TEXT UNIQUE NOT NULL,
  refresh_token_hash TEXT UNIQUE,
  scope TEXT NOT NULL,

  -- Session tracking
  session_id TEXT,

  -- Expiration
  access_token_expires_at TIMESTAMP NOT NULL,
  refresh_token_expires_at TIMESTAMP,

  -- Revocation
  revoked_at TIMESTAMP,
  revoked_by TEXT,
  revocation_reason TEXT,

  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS oauth_tokens_client_idx ON oauth_tokens(client_id);
CREATE INDEX IF NOT EXISTS oauth_tokens_user_idx ON oauth_tokens(user_did);
CREATE INDEX IF NOT EXISTS oauth_tokens_access_expires_idx ON oauth_tokens(access_token_expires_at);
CREATE INDEX IF NOT EXISTS oauth_tokens_refresh_expires_idx ON oauth_tokens(refresh_token_expires_at);

-- User consents for OAuth apps
CREATE TABLE IF NOT EXISTS oauth_consents (
  id TEXT PRIMARY KEY,
  user_did TEXT NOT NULL REFERENCES users(did) ON DELETE CASCADE,
  client_id TEXT NOT NULL,

  -- Granted scopes
  scopes JSONB NOT NULL,

  -- Consent history
  granted_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW(),
  revoked_at TIMESTAMP,

  UNIQUE(user_did, client_id)
);

CREATE INDEX IF NOT EXISTS oauth_consents_user_idx ON oauth_consents(user_did);
CREATE INDEX IF NOT EXISTS oauth_consents_client_idx ON oauth_consents(client_id);

-- OIDC signing keys (RSA for JWTs)
CREATE TABLE IF NOT EXISTS oidc_signing_keys (
  id TEXT PRIMARY KEY,
  kid TEXT UNIQUE NOT NULL,  -- Key ID for JWKS
  algorithm TEXT DEFAULT 'RS256',

  -- Keys (private key encrypted at rest)
  public_key TEXT NOT NULL,
  private_key TEXT NOT NULL,

  -- Key rotation lifecycle
  status TEXT DEFAULT 'active', -- 'active' | 'rotating' | 'retired'
  promoted_at TIMESTAMP,  -- When this became the primary signing key
  retires_at TIMESTAMP,   -- When to stop using for signing (keep for verification)

  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS oidc_signing_keys_status_idx ON oidc_signing_keys(status);
CREATE INDEX IF NOT EXISTS oidc_signing_keys_kid_idx ON oidc_signing_keys(kid);

-- ============================================
-- SAML PROVIDER TABLES (Exprsn as SAML IdP)
-- ============================================

-- SAML Service Providers (apps that use Exprsn for SAML SSO)
CREATE TABLE IF NOT EXISTS saml_service_providers (
  id TEXT PRIMARY KEY,
  entity_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,

  -- SP Endpoints
  assertion_consumer_service_url TEXT NOT NULL,
  assertion_consumer_service_binding TEXT DEFAULT 'HTTP-POST', -- 'HTTP-POST' | 'HTTP-Redirect'
  single_logout_service_url TEXT,
  single_logout_service_binding TEXT DEFAULT 'HTTP-POST',

  -- NameID configuration
  name_id_format TEXT DEFAULT 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',

  -- SP Certificate (for verifying SP signatures and encrypting assertions)
  sp_certificate TEXT,

  -- Attribute mapping (SAML attribute name -> user field)
  attribute_mapping JSONB DEFAULT '{
    "urn:oid:0.9.2342.19200300.100.1.3": "email",
    "urn:oid:2.5.4.42": "firstName",
    "urn:oid:2.5.4.4": "lastName",
    "urn:oid:1.3.6.1.4.1.5923.1.1.1.6": "did"
  }',

  -- Additional custom attributes to include
  extra_attributes JSONB DEFAULT '[]',

  -- Domain/Organization scoping
  domain_id TEXT REFERENCES domains(id) ON DELETE SET NULL,
  organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,

  -- Signing/Encryption settings
  sign_assertions BOOLEAN DEFAULT true,
  sign_response BOOLEAN DEFAULT true,
  encrypt_assertions BOOLEAN DEFAULT false,
  signing_cert_id TEXT REFERENCES ca_entity_certificates(id),
  encryption_cert_id TEXT REFERENCES ca_entity_certificates(id),

  -- Status
  status TEXT DEFAULT 'active', -- 'active' | 'suspended' | 'pending'
  owner_did TEXT REFERENCES users(did) ON DELETE SET NULL,

  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS saml_sps_entity_id_idx ON saml_service_providers(entity_id);
CREATE INDEX IF NOT EXISTS saml_sps_domain_idx ON saml_service_providers(domain_id);
CREATE INDEX IF NOT EXISTS saml_sps_status_idx ON saml_service_providers(status);

-- SAML Sessions (for Single Logout support)
CREATE TABLE IF NOT EXISTS saml_sessions (
  id TEXT PRIMARY KEY,
  session_index TEXT UNIQUE NOT NULL,  -- SAML SessionIndex attribute
  sp_id TEXT NOT NULL REFERENCES saml_service_providers(id) ON DELETE CASCADE,
  user_did TEXT NOT NULL REFERENCES users(did) ON DELETE CASCADE,

  -- NameID used in assertion
  name_id TEXT NOT NULL,
  name_id_format TEXT NOT NULL,

  -- Session lifetime
  expires_at TIMESTAMP NOT NULL,
  logged_out_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS saml_sessions_sp_idx ON saml_sessions(sp_id);
CREATE INDEX IF NOT EXISTS saml_sessions_user_idx ON saml_sessions(user_did);
CREATE INDEX IF NOT EXISTS saml_sessions_session_index_idx ON saml_sessions(session_index);
CREATE INDEX IF NOT EXISTS saml_sessions_expires_idx ON saml_sessions(expires_at);

-- ============================================
-- OAUTH CONSUMER TABLES (Social Login / External IdPs)
-- ============================================

-- External Identity Providers (Google, Microsoft, Okta, etc.)
CREATE TABLE IF NOT EXISTS external_identity_providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- 'oidc' | 'oauth2' | 'saml'
  provider_key TEXT NOT NULL UNIQUE, -- 'google' | 'microsoft' | 'github' | 'apple' | 'okta' | 'custom-xxx'

  -- Display configuration
  display_name TEXT NOT NULL,
  icon_url TEXT,
  button_color TEXT,  -- For login button styling

  -- OAuth2/OIDC Configuration
  client_id TEXT,
  client_secret TEXT,  -- Encrypted
  authorization_endpoint TEXT,
  token_endpoint TEXT,
  userinfo_endpoint TEXT,
  jwks_uri TEXT,
  issuer TEXT,  -- OIDC issuer for ID token validation

  -- SAML Configuration (for enterprise IdPs)
  sso_url TEXT,
  slo_url TEXT,
  idp_certificate TEXT,
  idp_entity_id TEXT,

  -- Request configuration
  scopes JSONB DEFAULT '["openid", "profile", "email"]',

  -- Claim/Attribute mapping (provider field -> our field)
  claim_mapping JSONB DEFAULT '{
    "sub": "external_id",
    "email": "email",
    "name": "display_name",
    "picture": "avatar"
  }',

  -- Domain scoping (NULL = global/platform-wide)
  domain_id TEXT REFERENCES domains(id) ON DELETE CASCADE,

  -- User provisioning
  auto_provision_users BOOLEAN DEFAULT true,
  default_role TEXT DEFAULT 'member',
  required_email_domain TEXT,  -- e.g., 'company.com' for enterprise SSO

  -- Status
  status TEXT DEFAULT 'active', -- 'active' | 'inactive' | 'testing'
  priority INTEGER DEFAULT 0,  -- Display order (higher = first)

  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS ext_idp_provider_key_idx ON external_identity_providers(provider_key);
CREATE INDEX IF NOT EXISTS ext_idp_domain_idx ON external_identity_providers(domain_id);
CREATE INDEX IF NOT EXISTS ext_idp_type_idx ON external_identity_providers(type);
CREATE INDEX IF NOT EXISTS ext_idp_status_idx ON external_identity_providers(status);

-- Linked external identities (user accounts linked to external providers)
CREATE TABLE IF NOT EXISTS external_identities (
  id TEXT PRIMARY KEY,
  user_did TEXT NOT NULL REFERENCES users(did) ON DELETE CASCADE,
  provider_id TEXT NOT NULL REFERENCES external_identity_providers(id) ON DELETE CASCADE,

  -- External account info
  external_id TEXT NOT NULL,  -- Provider's unique user ID
  email TEXT,
  display_name TEXT,
  avatar TEXT,
  profile_url TEXT,

  -- OAuth tokens (for API access to provider, encrypted)
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMP,

  -- Raw profile data from provider
  raw_profile JSONB,

  -- Linking timestamps
  linked_at TIMESTAMP DEFAULT NOW() NOT NULL,
  last_login_at TIMESTAMP,
  unlinked_at TIMESTAMP,

  UNIQUE(provider_id, external_id)
);

CREATE INDEX IF NOT EXISTS ext_identities_user_idx ON external_identities(user_did);
CREATE INDEX IF NOT EXISTS ext_identities_provider_idx ON external_identities(provider_id);
CREATE INDEX IF NOT EXISTS ext_identities_external_id_idx ON external_identities(external_id);

-- OAuth state storage (for CSRF protection during OAuth flows)
CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL REFERENCES external_identity_providers(id) ON DELETE CASCADE,

  -- PKCE
  code_verifier TEXT,

  -- OIDC nonce
  nonce TEXT,

  -- Redirect after login
  redirect_uri TEXT,

  -- Optional: link to existing user (for account linking flow)
  user_did TEXT REFERENCES users(did) ON DELETE CASCADE,

  -- Context
  domain_id TEXT REFERENCES domains(id) ON DELETE CASCADE,

  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS oauth_states_provider_idx ON oauth_states(provider_id);
CREATE INDEX IF NOT EXISTS oauth_states_expires_idx ON oauth_states(expires_at);

-- SAML Assertions received (for audit/debugging)
CREATE TABLE IF NOT EXISTS saml_assertions_received (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL REFERENCES external_identity_providers(id) ON DELETE CASCADE,
  assertion_id TEXT NOT NULL,

  -- Linked user (if successful)
  user_did TEXT REFERENCES users(did) ON DELETE SET NULL,

  -- Assertion data
  subject_name_id TEXT NOT NULL,
  attributes JSONB,
  conditions JSONB,

  -- Validation result
  is_valid BOOLEAN NOT NULL,
  validation_errors JSONB,

  received_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS saml_assertions_provider_idx ON saml_assertions_received(provider_id);
CREATE INDEX IF NOT EXISTS saml_assertions_user_idx ON saml_assertions_received(user_did);
CREATE INDEX IF NOT EXISTS saml_assertions_received_at_idx ON saml_assertions_received(received_at);

-- ============================================
-- DOMAIN SSO CONFIGURATION
-- ============================================

-- Domain-specific SSO configuration
CREATE TABLE IF NOT EXISTS domain_sso_config (
  id TEXT PRIMARY KEY,
  domain_id TEXT NOT NULL UNIQUE REFERENCES domains(id) ON DELETE CASCADE,

  -- SSO Mode
  sso_mode TEXT DEFAULT 'optional',  -- 'disabled' | 'optional' | 'required'

  -- Primary IdP (for SSO-required mode, users are redirected here)
  primary_idp_id TEXT REFERENCES external_identity_providers(id) ON DELETE SET NULL,

  -- Allowed IdPs for this domain (empty = all global IdPs allowed)
  allowed_idp_ids JSONB DEFAULT '[]',

  -- User provisioning
  jit_provisioning BOOLEAN DEFAULT true,  -- Just-In-Time user creation
  default_organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
  default_role TEXT DEFAULT 'member',

  -- Email domain enforcement
  email_domain_verification BOOLEAN DEFAULT true,
  allowed_email_domains JSONB DEFAULT '[]',  -- Empty = any domain allowed

  -- Session settings
  force_reauth_after_hours INTEGER DEFAULT 24,

  -- Audit
  updated_by TEXT REFERENCES users(did) ON DELETE SET NULL,

  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS domain_sso_config_domain_idx ON domain_sso_config(domain_id);
CREATE INDEX IF NOT EXISTS domain_sso_config_primary_idp_idx ON domain_sso_config(primary_idp_id);

-- ============================================
-- AUDIT TABLES
-- ============================================

-- SSO Audit Log
CREATE TABLE IF NOT EXISTS sso_audit_log (
  id TEXT PRIMARY KEY,

  -- Event type
  event_type TEXT NOT NULL, -- 'login' | 'logout' | 'link' | 'unlink' | 'consent_grant' | 'consent_revoke' | 'token_issue' | 'token_revoke'

  -- Actor
  user_did TEXT REFERENCES users(did) ON DELETE SET NULL,
  client_id TEXT,
  provider_id TEXT REFERENCES external_identity_providers(id) ON DELETE SET NULL,

  -- Context
  domain_id TEXT REFERENCES domains(id) ON DELETE SET NULL,
  ip_address TEXT,
  user_agent TEXT,

  -- Event details
  details JSONB,

  -- Result
  success BOOLEAN NOT NULL,
  error_message TEXT,

  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS sso_audit_user_idx ON sso_audit_log(user_did);
CREATE INDEX IF NOT EXISTS sso_audit_event_type_idx ON sso_audit_log(event_type);
CREATE INDEX IF NOT EXISTS sso_audit_created_at_idx ON sso_audit_log(created_at);
CREATE INDEX IF NOT EXISTS sso_audit_provider_idx ON sso_audit_log(provider_id);
CREATE INDEX IF NOT EXISTS sso_audit_domain_idx ON sso_audit_log(domain_id);
