CREATE TABLE "api_token_scopes" (
	"id" text PRIMARY KEY NOT NULL,
	"scope" text NOT NULL,
	"display_name" text NOT NULL,
	"description" text,
	"category" text NOT NULL,
	"permissions" jsonb NOT NULL,
	"requires_certificate" boolean DEFAULT false,
	"requires_organization" boolean DEFAULT false,
	"is_deprecated" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "api_token_scopes_scope_unique" UNIQUE("scope")
);
--> statement-breakpoint
CREATE TABLE "api_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"token_prefix" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"owner_did" text NOT NULL,
	"certificate_id" text,
	"token_type" text NOT NULL,
	"scopes" jsonb NOT NULL,
	"allowed_ips" jsonb,
	"allowed_origins" jsonb,
	"rate_limit" integer,
	"expires_at" timestamp,
	"last_used_at" timestamp,
	"last_used_ip" text,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"revoked_at" timestamp,
	"revoked_by" text,
	"revoked_reason" text,
	CONSTRAINT "api_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "ca_audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"event_category" text NOT NULL,
	"certificate_id" text,
	"certificate_serial_number" text,
	"subject_did" text,
	"performed_by" text NOT NULL,
	"performed_by_ip" text,
	"performed_by_user_agent" text,
	"details" jsonb,
	"severity" text DEFAULT 'info' NOT NULL,
	"success" boolean DEFAULT true NOT NULL,
	"error_message" text,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ca_crl_history" (
	"id" text PRIMARY KEY NOT NULL,
	"crl_pem" text NOT NULL,
	"cert_count" integer NOT NULL,
	"crl_number" integer,
	"generated_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"generated_by" text
);
--> statement-breakpoint
CREATE TABLE "cert_auth_challenges" (
	"id" text PRIMARY KEY NOT NULL,
	"certificate_fingerprint" text NOT NULL,
	"challenge" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "certificate_pins" (
	"id" text PRIMARY KEY NOT NULL,
	"pin_type" text NOT NULL,
	"fingerprint" text NOT NULL,
	"certificate_id" text,
	"valid_from" timestamp DEFAULT now() NOT NULL,
	"valid_until" timestamp NOT NULL,
	"is_backup" boolean DEFAULT false,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "certificate_pins_fingerprint_unique" UNIQUE("fingerprint")
);
--> statement-breakpoint
CREATE TABLE "certificate_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"display_name" text NOT NULL,
	"description" text,
	"template_type" text NOT NULL,
	"key_size" integer DEFAULT 2048 NOT NULL,
	"signature_algorithm" text DEFAULT 'sha256' NOT NULL,
	"validity_days" integer DEFAULT 365 NOT NULL,
	"key_usage" jsonb DEFAULT '["digitalSignature","keyEncipherment"]'::jsonb,
	"extended_key_usage" jsonb DEFAULT '["clientAuth"]'::jsonb,
	"san_template" text,
	"policy_oids" jsonb,
	"is_default" boolean DEFAULT false,
	"is_system" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "certificate_templates_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "domain_banned_tags" (
	"id" text PRIMARY KEY NOT NULL,
	"domain_id" text NOT NULL,
	"tag" text NOT NULL,
	"severity" text DEFAULT 'medium' NOT NULL,
	"action" text DEFAULT 'flag' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "domain_banned_words" (
	"id" text PRIMARY KEY NOT NULL,
	"domain_id" text NOT NULL,
	"word" text NOT NULL,
	"severity" text DEFAULT 'medium' NOT NULL,
	"action" text DEFAULT 'flag' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "domain_clusters" (
	"id" text PRIMARY KEY NOT NULL,
	"domain_id" text NOT NULL,
	"cluster_id" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "domain_group_roles" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"role_id" text NOT NULL,
	"assigned_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "domain_handle_reservations" (
	"id" text PRIMARY KEY NOT NULL,
	"domain_id" text NOT NULL,
	"handle" text NOT NULL,
	"handle_type" text DEFAULT 'user' NOT NULL,
	"reason" text,
	"reserved_by" text,
	"expires_at" timestamp,
	"claimed_by" text,
	"claimed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "domain_identities" (
	"id" text PRIMARY KEY NOT NULL,
	"domain_id" text NOT NULL,
	"did" text NOT NULL,
	"handle" text NOT NULL,
	"pds_endpoint" text,
	"signing_key" text,
	"rotation_keys" jsonb,
	"status" text DEFAULT 'active' NOT NULL,
	"user_did" text,
	"created_by" text,
	"tombstoned_at" timestamp,
	"tombstone_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "domain_identities_did_unique" UNIQUE("did")
);
--> statement-breakpoint
CREATE TABLE "domain_moderation_queue" (
	"id" text PRIMARY KEY NOT NULL,
	"domain_id" text NOT NULL,
	"content_type" text NOT NULL,
	"content_uri" text NOT NULL,
	"author_did" text,
	"reason" text,
	"auto_flagged" boolean DEFAULT false NOT NULL,
	"flag_source" text,
	"priority" text DEFAULT 'medium' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"assigned_to" text,
	"resolved_by" text,
	"resolved_at" timestamp,
	"resolution" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "domain_moderators" (
	"id" text PRIMARY KEY NOT NULL,
	"domain_id" text NOT NULL,
	"user_did" text NOT NULL,
	"can_approve" boolean DEFAULT true,
	"can_reject" boolean DEFAULT true,
	"can_delete" boolean DEFAULT false,
	"can_escalate" boolean DEFAULT true,
	"can_warn_users" boolean DEFAULT false,
	"can_suspend_users" boolean DEFAULT false,
	"appointed_by" text NOT NULL,
	"appointed_at" timestamp DEFAULT now() NOT NULL,
	"active" boolean DEFAULT true,
	"deactivated_at" timestamp,
	"deactivated_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "domain_roles" (
	"id" text PRIMARY KEY NOT NULL,
	"domain_id" text NOT NULL,
	"name" text NOT NULL,
	"display_name" text NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"permissions" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "domain_services" (
	"id" text PRIMARY KEY NOT NULL,
	"domain_id" text NOT NULL,
	"service_type" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"endpoint" text,
	"config" jsonb,
	"status" text DEFAULT 'inactive' NOT NULL,
	"last_health_check" timestamp,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "domain_sso_config" (
	"id" text PRIMARY KEY NOT NULL,
	"domain_id" text NOT NULL,
	"sso_mode" text DEFAULT 'optional',
	"primary_idp_id" text,
	"allowed_idp_ids" jsonb DEFAULT '[]'::jsonb,
	"jit_provisioning" boolean DEFAULT true,
	"default_organization_id" text,
	"default_role" text DEFAULT 'member',
	"email_domain_verification" boolean DEFAULT true,
	"allowed_email_domains" jsonb DEFAULT '[]'::jsonb,
	"force_reauth_after_hours" integer DEFAULT 24,
	"updated_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "domain_sso_config_domain_id_unique" UNIQUE("domain_id")
);
--> statement-breakpoint
CREATE TABLE "domain_user_roles" (
	"id" text PRIMARY KEY NOT NULL,
	"domain_user_id" text NOT NULL,
	"role_id" text NOT NULL,
	"assigned_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "editor_comment_reactions" (
	"id" text PRIMARY KEY NOT NULL,
	"comment_id" text NOT NULL,
	"user_did" text NOT NULL,
	"emoji" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "editor_comments" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"user_did" text NOT NULL,
	"parent_id" text,
	"frame" integer,
	"canvas_x" real,
	"canvas_y" real,
	"element_id" text,
	"content" text NOT NULL,
	"resolved" boolean DEFAULT false,
	"resolved_at" timestamp,
	"resolved_by_did" text,
	"mentioned_dids" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exprsn_did_certificates" (
	"id" text PRIMARY KEY NOT NULL,
	"did" text NOT NULL,
	"certificate_id" text NOT NULL,
	"issuer_intermediate_id" text,
	"organization_id" text,
	"certificate_type" text NOT NULL,
	"public_key_multibase" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"revoked_at" timestamp,
	"revoked_by" text,
	"revocation_reason" text,
	CONSTRAINT "exprsn_did_certificates_did_unique" UNIQUE("did")
);
--> statement-breakpoint
CREATE TABLE "external_identities" (
	"id" text PRIMARY KEY NOT NULL,
	"user_did" text NOT NULL,
	"provider_id" text NOT NULL,
	"external_id" text NOT NULL,
	"email" text,
	"display_name" text,
	"avatar" text,
	"profile_url" text,
	"access_token" text,
	"refresh_token" text,
	"token_expires_at" timestamp,
	"raw_profile" jsonb,
	"linked_at" timestamp DEFAULT now() NOT NULL,
	"last_login_at" timestamp,
	"unlinked_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "external_identity_providers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"provider_key" text NOT NULL,
	"display_name" text NOT NULL,
	"icon_url" text,
	"button_color" text,
	"client_id" text,
	"client_secret" text,
	"authorization_endpoint" text,
	"token_endpoint" text,
	"userinfo_endpoint" text,
	"jwks_uri" text,
	"issuer" text,
	"sso_url" text,
	"slo_url" text,
	"idp_certificate" text,
	"idp_entity_id" text,
	"scopes" jsonb DEFAULT '["openid","profile","email"]'::jsonb,
	"claim_mapping" jsonb DEFAULT '{"sub":"external_id","email":"email","name":"display_name","picture":"avatar"}'::jsonb,
	"domain_id" text,
	"auto_provision_users" boolean DEFAULT true,
	"default_role" text DEFAULT 'member',
	"required_email_domain" text,
	"jit_config" jsonb,
	"status" text DEFAULT 'active',
	"priority" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "external_identity_providers_provider_key_unique" UNIQUE("provider_key")
);
--> statement-breakpoint
CREATE TABLE "moderation_notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"recipient_id" text NOT NULL,
	"type" text NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"content_type" text,
	"content_id" text,
	"content_uri" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"read_at" timestamp,
	"dismissed_at" timestamp,
	"actioned_at" timestamp,
	"actioned_by" text,
	"action_taken" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "oauth_authorization_codes" (
	"code" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"user_did" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"scope" text NOT NULL,
	"code_challenge" text,
	"code_challenge_method" text,
	"nonce" text,
	"state" text,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_clients" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"client_secret_hash" text,
	"client_name" text NOT NULL,
	"client_uri" text,
	"logo_uri" text,
	"client_type" text DEFAULT 'confidential' NOT NULL,
	"application_type" text DEFAULT 'web',
	"redirect_uris" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"post_logout_redirect_uris" jsonb DEFAULT '[]'::jsonb,
	"grant_types" jsonb DEFAULT '["authorization_code"]'::jsonb NOT NULL,
	"response_types" jsonb DEFAULT '["code"]'::jsonb NOT NULL,
	"token_endpoint_auth_method" text DEFAULT 'client_secret_basic',
	"access_token_ttl_seconds" integer DEFAULT 3600,
	"refresh_token_ttl_seconds" integer DEFAULT 2592000,
	"id_token_ttl_seconds" integer DEFAULT 3600,
	"allowed_scopes" jsonb DEFAULT '["openid","profile","email"]'::jsonb NOT NULL,
	"require_consent" boolean DEFAULT true,
	"require_pkce" boolean DEFAULT true,
	"jwks_uri" text,
	"jwks" jsonb,
	"domain_id" text,
	"organization_id" text,
	"owner_did" text,
	"contacts" jsonb,
	"tos_uri" text,
	"policy_uri" text,
	"status" text DEFAULT 'active',
	"approved_by" text,
	"approved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "oauth_clients_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
CREATE TABLE "oauth_consents" (
	"id" text PRIMARY KEY NOT NULL,
	"user_did" text NOT NULL,
	"client_id" text NOT NULL,
	"scopes" jsonb NOT NULL,
	"granted_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	"revoked_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "oauth_states" (
	"state" text PRIMARY KEY NOT NULL,
	"provider_id" text NOT NULL,
	"code_verifier" text,
	"nonce" text,
	"redirect_uri" text,
	"user_did" text,
	"domain_id" text,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"user_did" text NOT NULL,
	"access_token_hash" text NOT NULL,
	"refresh_token_hash" text,
	"scope" text NOT NULL,
	"session_id" text,
	"access_token_expires_at" timestamp NOT NULL,
	"refresh_token_expires_at" timestamp,
	"revoked_at" timestamp,
	"revoked_by" text,
	"revocation_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "oauth_tokens_access_token_hash_unique" UNIQUE("access_token_hash"),
	CONSTRAINT "oauth_tokens_refresh_token_hash_unique" UNIQUE("refresh_token_hash")
);
--> statement-breakpoint
CREATE TABLE "oidc_signing_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"kid" text NOT NULL,
	"algorithm" text DEFAULT 'RS256',
	"public_key" text NOT NULL,
	"private_key" text NOT NULL,
	"status" text DEFAULT 'active',
	"promoted_at" timestamp,
	"retires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "oidc_signing_keys_kid_unique" UNIQUE("kid")
);
--> statement-breakpoint
CREATE TABLE "organization_intermediate_cas" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"intermediate_cert_id" text NOT NULL,
	"common_name" text NOT NULL,
	"max_path_length" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"revoked_at" timestamp,
	"revoked_by" text,
	CONSTRAINT "organization_intermediate_cas_organization_id_unique" UNIQUE("organization_id")
);
--> statement-breakpoint
CREATE TABLE "pin_violation_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"expected_pins" jsonb NOT NULL,
	"received_chain" jsonb,
	"hostname" text NOT NULL,
	"user_agent" text,
	"client_ip" text,
	"reported_at" timestamp DEFAULT now() NOT NULL,
	"details" jsonb
);
--> statement-breakpoint
CREATE TABLE "push_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_did" text NOT NULL,
	"token" text NOT NULL,
	"platform" text NOT NULL,
	"device_id" text,
	"device_name" text,
	"app_version" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_used_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"invalidated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "repo_blobs" (
	"cid" text PRIMARY KEY NOT NULL,
	"did" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" integer NOT NULL,
	"url" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repositories" (
	"did" text PRIMARY KEY NOT NULL,
	"head" text,
	"rev" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saml_assertions_received" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_id" text NOT NULL,
	"assertion_id" text NOT NULL,
	"user_did" text,
	"subject_name_id" text NOT NULL,
	"attributes" jsonb,
	"conditions" jsonb,
	"is_valid" boolean NOT NULL,
	"validation_errors" jsonb,
	"received_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saml_service_providers" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"assertion_consumer_service_url" text NOT NULL,
	"assertion_consumer_service_binding" text DEFAULT 'HTTP-POST',
	"single_logout_service_url" text,
	"single_logout_service_binding" text DEFAULT 'HTTP-POST',
	"name_id_format" text DEFAULT 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
	"sp_certificate" text,
	"attribute_mapping" jsonb,
	"extra_attributes" jsonb DEFAULT '[]'::jsonb,
	"domain_id" text,
	"organization_id" text,
	"sign_assertions" boolean DEFAULT true,
	"sign_response" boolean DEFAULT true,
	"encrypt_assertions" boolean DEFAULT false,
	"signing_cert_id" text,
	"encryption_cert_id" text,
	"status" text DEFAULT 'active',
	"owner_did" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "saml_service_providers_entity_id_unique" UNIQUE("entity_id")
);
--> statement-breakpoint
CREATE TABLE "saml_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"session_index" text NOT NULL,
	"sp_id" text NOT NULL,
	"user_did" text NOT NULL,
	"name_id" text NOT NULL,
	"name_id_format" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"logged_out_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "saml_sessions_session_index_unique" UNIQUE("session_index")
);
--> statement-breakpoint
CREATE TABLE "session_certificate_bindings" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"certificate_fingerprint" text NOT NULL,
	"did" text NOT NULL,
	"bound_at" timestamp DEFAULT now() NOT NULL,
	"last_verified" timestamp,
	"status" text DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sso_audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"user_did" text,
	"client_id" text,
	"provider_id" text,
	"domain_id" text,
	"ip_address" text,
	"user_agent" text,
	"details" jsonb,
	"success" boolean NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"seq" integer NOT NULL,
	"did" text NOT NULL,
	"event_type" text NOT NULL,
	"commit" text,
	"ops" jsonb,
	"blocks" jsonb,
	"rebase" boolean DEFAULT false NOT NULL,
	"too_big" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"service" text NOT NULL,
	"cursor" integer,
	"status" text DEFAULT 'active' NOT NULL,
	"last_sync" timestamp,
	"error_count" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trusted_users" (
	"id" text PRIMARY KEY NOT NULL,
	"user_did" text NOT NULL,
	"trust_level" text DEFAULT 'basic' NOT NULL,
	"auto_approve" boolean DEFAULT true,
	"skip_ai_review" boolean DEFAULT false,
	"extended_upload_limits" boolean DEFAULT false,
	"granted_by" text NOT NULL,
	"granted_at" timestamp DEFAULT now() NOT NULL,
	"grant_reason" text,
	"revoked_at" timestamp,
	"revoked_by" text,
	"revoke_reason" text,
	"total_uploads" integer DEFAULT 0,
	"approved_uploads" integer DEFAULT 0,
	"rejected_uploads" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "trusted_users_user_did_unique" UNIQUE("user_did")
);
--> statement-breakpoint
CREATE TABLE "video_deletion_log" (
	"id" text PRIMARY KEY NOT NULL,
	"video_uri" text NOT NULL,
	"video_cid" text,
	"author_did" text NOT NULL,
	"deleted_by" text NOT NULL,
	"deletion_type" text NOT NULL,
	"reason" text,
	"caption" text,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"cdn_url" text,
	"thumbnail_url" text,
	"view_count" integer DEFAULT 0,
	"like_count" integer DEFAULT 0,
	"can_restore" boolean DEFAULT true,
	"restored_at" timestamp,
	"restored_by" text,
	"domain_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "video_moderation_queue" (
	"id" text PRIMARY KEY NOT NULL,
	"video_uri" text NOT NULL,
	"author_did" text NOT NULL,
	"submitted_at" timestamp DEFAULT now() NOT NULL,
	"risk_score" integer DEFAULT 0,
	"risk_level" text DEFAULT 'unknown',
	"flags" jsonb DEFAULT '[]'::jsonb,
	"ai_analysis" jsonb DEFAULT '{}'::jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"priority" integer DEFAULT 0,
	"assigned_to" text,
	"assigned_at" timestamp,
	"reviewed_by" text,
	"reviewed_at" timestamp,
	"review_notes" text,
	"rejection_reason" text,
	"domain_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "video_moderation_queue_video_uri_unique" UNIQUE("video_uri")
);
--> statement-breakpoint
ALTER TABLE "domains" ALTER COLUMN "plc_config" SET DEFAULT '{"enabled":true,"mode":"standalone","didMethod":"plc","allowCustomHandles":false,"requireInviteCode":false}'::jsonb;--> statement-breakpoint
ALTER TABLE "actor_repos" ADD COLUMN "did_method" text DEFAULT 'plc';--> statement-breakpoint
ALTER TABLE "actor_repos" ADD COLUMN "certificate_id" text;--> statement-breakpoint
ALTER TABLE "actor_repos" ADD COLUMN "is_service" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "domains" ADD COLUMN "federation_config" jsonb DEFAULT '{"enabled":false,"inboundEnabled":true,"outboundEnabled":true,"syncPosts":true,"syncLikes":true,"syncFollows":true,"syncProfiles":true,"syncBlobs":true,"discoveryEnabled":true,"searchEnabled":true,"allowedDomains":[],"blockedDomains":[]}'::jsonb;--> statement-breakpoint
ALTER TABLE "moderation_appeals" ADD COLUMN "sanction_id" text;--> statement-breakpoint
ALTER TABLE "notification_settings" ADD COLUMN "push_enabled" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "notification_settings" ADD COLUMN "push_on_follow" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "notification_settings" ADD COLUMN "push_on_like" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "notification_settings" ADD COLUMN "push_on_comment" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "notification_settings" ADD COLUMN "push_on_mention" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "notification_settings" ADD COLUMN "push_on_message" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "organization_tags" ADD COLUMN "type" text DEFAULT 'tag' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "hosting_type" text DEFAULT 'cloud';--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "plc_provider" text DEFAULT 'exprsn';--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "self_hosted_plc_url" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "custom_domain" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "handle_suffix" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "federation_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "federation_config" jsonb;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "moderation_config" jsonb;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "parent_organization_id" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "domain_id" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "hierarchy_path" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "hierarchy_level" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "suspended_at" timestamp;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "suspended_by" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "suspended_reason" text;--> statement-breakpoint
ALTER TABLE "plc_identities" ADD COLUMN "certificate_id" text;--> statement-breakpoint
ALTER TABLE "plc_identities" ADD COLUMN "certificate_fingerprint" text;--> statement-breakpoint
ALTER TABLE "render_clusters" ADD COLUMN "worker_count" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "upload_jobs" ADD COLUMN "retry_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "upload_jobs" ADD COLUMN "max_retries" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "upload_jobs" ADD COLUMN "last_retry_at" timestamp;--> statement-breakpoint
ALTER TABLE "upload_jobs" ADD COLUMN "retry_history" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "moderation_status" text DEFAULT 'approved' NOT NULL;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "deleted_by" text;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "deletion_type" text;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "deletion_reason" text;--> statement-breakpoint
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_certificate_id_ca_entity_certificates_id_fk" FOREIGN KEY ("certificate_id") REFERENCES "public"."ca_entity_certificates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_banned_tags" ADD CONSTRAINT "domain_banned_tags_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_banned_tags" ADD CONSTRAINT "domain_banned_tags_created_by_users_did_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("did") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_banned_words" ADD CONSTRAINT "domain_banned_words_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_banned_words" ADD CONSTRAINT "domain_banned_words_created_by_users_did_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("did") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_clusters" ADD CONSTRAINT "domain_clusters_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_clusters" ADD CONSTRAINT "domain_clusters_cluster_id_render_clusters_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."render_clusters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_group_roles" ADD CONSTRAINT "domain_group_roles_group_id_domain_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."domain_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_group_roles" ADD CONSTRAINT "domain_group_roles_role_id_domain_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."domain_roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_group_roles" ADD CONSTRAINT "domain_group_roles_assigned_by_users_did_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("did") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_handle_reservations" ADD CONSTRAINT "domain_handle_reservations_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_handle_reservations" ADD CONSTRAINT "domain_handle_reservations_reserved_by_users_did_fk" FOREIGN KEY ("reserved_by") REFERENCES "public"."users"("did") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_handle_reservations" ADD CONSTRAINT "domain_handle_reservations_claimed_by_users_did_fk" FOREIGN KEY ("claimed_by") REFERENCES "public"."users"("did") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_identities" ADD CONSTRAINT "domain_identities_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_identities" ADD CONSTRAINT "domain_identities_user_did_users_did_fk" FOREIGN KEY ("user_did") REFERENCES "public"."users"("did") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_identities" ADD CONSTRAINT "domain_identities_created_by_users_did_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("did") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_moderation_queue" ADD CONSTRAINT "domain_moderation_queue_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_moderation_queue" ADD CONSTRAINT "domain_moderation_queue_author_did_users_did_fk" FOREIGN KEY ("author_did") REFERENCES "public"."users"("did") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_moderation_queue" ADD CONSTRAINT "domain_moderation_queue_assigned_to_users_did_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("did") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_moderation_queue" ADD CONSTRAINT "domain_moderation_queue_resolved_by_users_did_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("did") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_roles" ADD CONSTRAINT "domain_roles_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_services" ADD CONSTRAINT "domain_services_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_sso_config" ADD CONSTRAINT "domain_sso_config_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_sso_config" ADD CONSTRAINT "domain_sso_config_primary_idp_id_external_identity_providers_id_fk" FOREIGN KEY ("primary_idp_id") REFERENCES "public"."external_identity_providers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_sso_config" ADD CONSTRAINT "domain_sso_config_default_organization_id_organizations_id_fk" FOREIGN KEY ("default_organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_sso_config" ADD CONSTRAINT "domain_sso_config_updated_by_users_did_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("did") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_user_roles" ADD CONSTRAINT "domain_user_roles_domain_user_id_domain_users_id_fk" FOREIGN KEY ("domain_user_id") REFERENCES "public"."domain_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_user_roles" ADD CONSTRAINT "domain_user_roles_role_id_domain_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."domain_roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_user_roles" ADD CONSTRAINT "domain_user_roles_assigned_by_users_did_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("did") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editor_comment_reactions" ADD CONSTRAINT "editor_comment_reactions_comment_id_editor_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."editor_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editor_comment_reactions" ADD CONSTRAINT "editor_comment_reactions_user_did_users_did_fk" FOREIGN KEY ("user_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editor_comments" ADD CONSTRAINT "editor_comments_project_id_editor_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."editor_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editor_comments" ADD CONSTRAINT "editor_comments_user_did_users_did_fk" FOREIGN KEY ("user_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editor_comments" ADD CONSTRAINT "editor_comments_resolved_by_did_users_did_fk" FOREIGN KEY ("resolved_by_did") REFERENCES "public"."users"("did") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exprsn_did_certificates" ADD CONSTRAINT "exprsn_did_certificates_certificate_id_ca_entity_certificates_id_fk" FOREIGN KEY ("certificate_id") REFERENCES "public"."ca_entity_certificates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exprsn_did_certificates" ADD CONSTRAINT "exprsn_did_certificates_issuer_intermediate_id_ca_intermediate_certificates_id_fk" FOREIGN KEY ("issuer_intermediate_id") REFERENCES "public"."ca_intermediate_certificates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exprsn_did_certificates" ADD CONSTRAINT "exprsn_did_certificates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_identities" ADD CONSTRAINT "external_identities_user_did_users_did_fk" FOREIGN KEY ("user_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_identities" ADD CONSTRAINT "external_identities_provider_id_external_identity_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."external_identity_providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_identity_providers" ADD CONSTRAINT "external_identity_providers_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_authorization_codes" ADD CONSTRAINT "oauth_authorization_codes_user_did_users_did_fk" FOREIGN KEY ("user_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_clients" ADD CONSTRAINT "oauth_clients_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_clients" ADD CONSTRAINT "oauth_clients_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_clients" ADD CONSTRAINT "oauth_clients_owner_did_users_did_fk" FOREIGN KEY ("owner_did") REFERENCES "public"."users"("did") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_consents" ADD CONSTRAINT "oauth_consents_user_did_users_did_fk" FOREIGN KEY ("user_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_states" ADD CONSTRAINT "oauth_states_provider_id_external_identity_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."external_identity_providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_states" ADD CONSTRAINT "oauth_states_user_did_users_did_fk" FOREIGN KEY ("user_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_states" ADD CONSTRAINT "oauth_states_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_tokens" ADD CONSTRAINT "oauth_tokens_user_did_users_did_fk" FOREIGN KEY ("user_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_intermediate_cas" ADD CONSTRAINT "organization_intermediate_cas_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_intermediate_cas" ADD CONSTRAINT "organization_intermediate_cas_intermediate_cert_id_ca_intermediate_certificates_id_fk" FOREIGN KEY ("intermediate_cert_id") REFERENCES "public"."ca_intermediate_certificates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_user_did_users_did_fk" FOREIGN KEY ("user_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repo_blobs" ADD CONSTRAINT "repo_blobs_did_repositories_did_fk" FOREIGN KEY ("did") REFERENCES "public"."repositories"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saml_assertions_received" ADD CONSTRAINT "saml_assertions_received_provider_id_external_identity_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."external_identity_providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saml_assertions_received" ADD CONSTRAINT "saml_assertions_received_user_did_users_did_fk" FOREIGN KEY ("user_did") REFERENCES "public"."users"("did") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saml_service_providers" ADD CONSTRAINT "saml_service_providers_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saml_service_providers" ADD CONSTRAINT "saml_service_providers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saml_service_providers" ADD CONSTRAINT "saml_service_providers_signing_cert_id_ca_entity_certificates_id_fk" FOREIGN KEY ("signing_cert_id") REFERENCES "public"."ca_entity_certificates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saml_service_providers" ADD CONSTRAINT "saml_service_providers_encryption_cert_id_ca_entity_certificates_id_fk" FOREIGN KEY ("encryption_cert_id") REFERENCES "public"."ca_entity_certificates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saml_service_providers" ADD CONSTRAINT "saml_service_providers_owner_did_users_did_fk" FOREIGN KEY ("owner_did") REFERENCES "public"."users"("did") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saml_sessions" ADD CONSTRAINT "saml_sessions_sp_id_saml_service_providers_id_fk" FOREIGN KEY ("sp_id") REFERENCES "public"."saml_service_providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saml_sessions" ADD CONSTRAINT "saml_sessions_user_did_users_did_fk" FOREIGN KEY ("user_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sso_audit_log" ADD CONSTRAINT "sso_audit_log_user_did_users_did_fk" FOREIGN KEY ("user_did") REFERENCES "public"."users"("did") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sso_audit_log" ADD CONSTRAINT "sso_audit_log_provider_id_external_identity_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."external_identity_providers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sso_audit_log" ADD CONSTRAINT "sso_audit_log_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "api_token_scopes_scope_idx" ON "api_token_scopes" USING btree ("scope");--> statement-breakpoint
CREATE INDEX "api_token_scopes_category_idx" ON "api_token_scopes" USING btree ("category");--> statement-breakpoint
CREATE UNIQUE INDEX "api_tokens_hash_idx" ON "api_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "api_tokens_owner_did_idx" ON "api_tokens" USING btree ("owner_did");--> statement-breakpoint
CREATE INDEX "api_tokens_type_idx" ON "api_tokens" USING btree ("token_type");--> statement-breakpoint
CREATE INDEX "api_tokens_status_idx" ON "api_tokens" USING btree ("status");--> statement-breakpoint
CREATE INDEX "api_tokens_expires_at_idx" ON "api_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "ca_audit_event_type_idx" ON "ca_audit_log" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "ca_audit_category_idx" ON "ca_audit_log" USING btree ("event_category");--> statement-breakpoint
CREATE INDEX "ca_audit_subject_did_idx" ON "ca_audit_log" USING btree ("subject_did");--> statement-breakpoint
CREATE INDEX "ca_audit_performed_by_idx" ON "ca_audit_log" USING btree ("performed_by");--> statement-breakpoint
CREATE INDEX "ca_audit_timestamp_idx" ON "ca_audit_log" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "ca_audit_severity_idx" ON "ca_audit_log" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "ca_crl_history_generated_at_idx" ON "ca_crl_history" USING btree ("generated_at");--> statement-breakpoint
CREATE INDEX "ca_crl_history_expires_at_idx" ON "ca_crl_history" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "cert_auth_challenges_fingerprint_idx" ON "cert_auth_challenges" USING btree ("certificate_fingerprint");--> statement-breakpoint
CREATE INDEX "cert_auth_challenges_expires_at_idx" ON "cert_auth_challenges" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cert_pins_fingerprint_idx" ON "certificate_pins" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX "cert_pins_type_idx" ON "certificate_pins" USING btree ("pin_type");--> statement-breakpoint
CREATE INDEX "cert_pins_status_idx" ON "certificate_pins" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "cert_templates_name_idx" ON "certificate_templates" USING btree ("name");--> statement-breakpoint
CREATE INDEX "cert_templates_type_idx" ON "certificate_templates" USING btree ("template_type");--> statement-breakpoint
CREATE INDEX "cert_templates_default_idx" ON "certificate_templates" USING btree ("is_default");--> statement-breakpoint
CREATE INDEX "domain_banned_tags_domain_idx" ON "domain_banned_tags" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "domain_banned_tags_severity_idx" ON "domain_banned_tags" USING btree ("severity");--> statement-breakpoint
CREATE UNIQUE INDEX "domain_banned_tags_unique_idx" ON "domain_banned_tags" USING btree ("domain_id","tag");--> statement-breakpoint
CREATE INDEX "domain_banned_words_domain_idx" ON "domain_banned_words" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "domain_banned_words_severity_idx" ON "domain_banned_words" USING btree ("severity");--> statement-breakpoint
CREATE UNIQUE INDEX "domain_banned_words_unique_idx" ON "domain_banned_words" USING btree ("domain_id","word");--> statement-breakpoint
CREATE INDEX "domain_clusters_domain_idx" ON "domain_clusters" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "domain_clusters_cluster_idx" ON "domain_clusters" USING btree ("cluster_id");--> statement-breakpoint
CREATE UNIQUE INDEX "domain_clusters_unique_idx" ON "domain_clusters" USING btree ("domain_id","cluster_id");--> statement-breakpoint
CREATE INDEX "domain_group_roles_group_idx" ON "domain_group_roles" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "domain_group_roles_role_idx" ON "domain_group_roles" USING btree ("role_id");--> statement-breakpoint
CREATE UNIQUE INDEX "domain_group_roles_unique_idx" ON "domain_group_roles" USING btree ("group_id","role_id");--> statement-breakpoint
CREATE INDEX "domain_handle_res_domain_idx" ON "domain_handle_reservations" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "domain_handle_res_handle_idx" ON "domain_handle_reservations" USING btree ("handle");--> statement-breakpoint
CREATE INDEX "domain_handle_res_expires_idx" ON "domain_handle_reservations" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "domain_handle_res_unique_idx" ON "domain_handle_reservations" USING btree ("domain_id","handle");--> statement-breakpoint
CREATE INDEX "domain_identities_domain_idx" ON "domain_identities" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "domain_identities_handle_idx" ON "domain_identities" USING btree ("handle");--> statement-breakpoint
CREATE INDEX "domain_identities_status_idx" ON "domain_identities" USING btree ("status");--> statement-breakpoint
CREATE INDEX "domain_identities_user_idx" ON "domain_identities" USING btree ("user_did");--> statement-breakpoint
CREATE UNIQUE INDEX "domain_identities_domain_handle_idx" ON "domain_identities" USING btree ("domain_id","handle");--> statement-breakpoint
CREATE INDEX "domain_mod_queue_domain_idx" ON "domain_moderation_queue" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "domain_mod_queue_status_idx" ON "domain_moderation_queue" USING btree ("status");--> statement-breakpoint
CREATE INDEX "domain_mod_queue_priority_idx" ON "domain_moderation_queue" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "domain_mod_queue_author_idx" ON "domain_moderation_queue" USING btree ("author_did");--> statement-breakpoint
CREATE INDEX "domain_mod_queue_assigned_idx" ON "domain_moderation_queue" USING btree ("assigned_to");--> statement-breakpoint
CREATE INDEX "domain_mod_queue_created_idx" ON "domain_moderation_queue" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "domain_moderators_domain_id_idx" ON "domain_moderators" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "domain_moderators_user_did_idx" ON "domain_moderators" USING btree ("user_did");--> statement-breakpoint
CREATE INDEX "domain_moderators_active_idx" ON "domain_moderators" USING btree ("active");--> statement-breakpoint
CREATE UNIQUE INDEX "domain_moderators_domain_user_idx" ON "domain_moderators" USING btree ("domain_id","user_did");--> statement-breakpoint
CREATE INDEX "domain_roles_domain_idx" ON "domain_roles" USING btree ("domain_id");--> statement-breakpoint
CREATE UNIQUE INDEX "domain_roles_unique_idx" ON "domain_roles" USING btree ("domain_id","name");--> statement-breakpoint
CREATE INDEX "domain_roles_priority_idx" ON "domain_roles" USING btree ("domain_id","priority");--> statement-breakpoint
CREATE INDEX "domain_services_domain_idx" ON "domain_services" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "domain_services_type_idx" ON "domain_services" USING btree ("service_type");--> statement-breakpoint
CREATE INDEX "domain_services_status_idx" ON "domain_services" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "domain_services_unique_idx" ON "domain_services" USING btree ("domain_id","service_type");--> statement-breakpoint
CREATE INDEX "domain_sso_config_domain_idx" ON "domain_sso_config" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "domain_sso_config_primary_idp_idx" ON "domain_sso_config" USING btree ("primary_idp_id");--> statement-breakpoint
CREATE INDEX "domain_user_roles_domain_user_idx" ON "domain_user_roles" USING btree ("domain_user_id");--> statement-breakpoint
CREATE INDEX "domain_user_roles_role_idx" ON "domain_user_roles" USING btree ("role_id");--> statement-breakpoint
CREATE UNIQUE INDEX "domain_user_roles_unique_idx" ON "domain_user_roles" USING btree ("domain_user_id","role_id");--> statement-breakpoint
CREATE INDEX "editor_comment_reactions_comment_idx" ON "editor_comment_reactions" USING btree ("comment_id");--> statement-breakpoint
CREATE INDEX "editor_comment_reactions_user_idx" ON "editor_comment_reactions" USING btree ("user_did");--> statement-breakpoint
CREATE UNIQUE INDEX "editor_comment_reactions_unique_idx" ON "editor_comment_reactions" USING btree ("comment_id","user_did","emoji");--> statement-breakpoint
CREATE INDEX "editor_comments_project_idx" ON "editor_comments" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "editor_comments_user_idx" ON "editor_comments" USING btree ("user_did");--> statement-breakpoint
CREATE INDEX "editor_comments_parent_idx" ON "editor_comments" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "editor_comments_frame_idx" ON "editor_comments" USING btree ("project_id","frame");--> statement-breakpoint
CREATE INDEX "editor_comments_resolved_idx" ON "editor_comments" USING btree ("resolved");--> statement-breakpoint
CREATE INDEX "editor_comments_created_idx" ON "editor_comments" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "exprsn_did_certs_did_idx" ON "exprsn_did_certificates" USING btree ("did");--> statement-breakpoint
CREATE INDEX "exprsn_did_certs_cert_idx" ON "exprsn_did_certificates" USING btree ("certificate_id");--> statement-breakpoint
CREATE INDEX "exprsn_did_certs_org_idx" ON "exprsn_did_certificates" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "exprsn_did_certs_status_idx" ON "exprsn_did_certificates" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ext_identities_user_idx" ON "external_identities" USING btree ("user_did");--> statement-breakpoint
CREATE INDEX "ext_identities_provider_idx" ON "external_identities" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "ext_identities_external_id_idx" ON "external_identities" USING btree ("external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ext_identities_unique_idx" ON "external_identities" USING btree ("provider_id","external_id");--> statement-breakpoint
CREATE INDEX "ext_idp_provider_key_idx" ON "external_identity_providers" USING btree ("provider_key");--> statement-breakpoint
CREATE INDEX "ext_idp_domain_idx" ON "external_identity_providers" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "ext_idp_type_idx" ON "external_identity_providers" USING btree ("type");--> statement-breakpoint
CREATE INDEX "ext_idp_status_idx" ON "external_identity_providers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "moderation_notifications_recipient_idx" ON "moderation_notifications" USING btree ("recipient_id");--> statement-breakpoint
CREATE INDEX "moderation_notifications_type_idx" ON "moderation_notifications" USING btree ("type");--> statement-breakpoint
CREATE INDEX "moderation_notifications_priority_idx" ON "moderation_notifications" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "moderation_notifications_read_idx" ON "moderation_notifications" USING btree ("read_at");--> statement-breakpoint
CREATE INDEX "moderation_notifications_created_at_idx" ON "moderation_notifications" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "oauth_auth_codes_client_idx" ON "oauth_authorization_codes" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "oauth_auth_codes_user_idx" ON "oauth_authorization_codes" USING btree ("user_did");--> statement-breakpoint
CREATE INDEX "oauth_auth_codes_expires_idx" ON "oauth_authorization_codes" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "oauth_clients_client_id_idx" ON "oauth_clients" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "oauth_clients_domain_idx" ON "oauth_clients" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "oauth_clients_owner_idx" ON "oauth_clients" USING btree ("owner_did");--> statement-breakpoint
CREATE INDEX "oauth_clients_status_idx" ON "oauth_clients" USING btree ("status");--> statement-breakpoint
CREATE INDEX "oauth_consents_user_idx" ON "oauth_consents" USING btree ("user_did");--> statement-breakpoint
CREATE INDEX "oauth_consents_client_idx" ON "oauth_consents" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_consents_unique_idx" ON "oauth_consents" USING btree ("user_did","client_id");--> statement-breakpoint
CREATE INDEX "oauth_states_provider_idx" ON "oauth_states" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "oauth_states_expires_idx" ON "oauth_states" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "oauth_tokens_client_idx" ON "oauth_tokens" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "oauth_tokens_user_idx" ON "oauth_tokens" USING btree ("user_did");--> statement-breakpoint
CREATE INDEX "oauth_tokens_access_expires_idx" ON "oauth_tokens" USING btree ("access_token_expires_at");--> statement-breakpoint
CREATE INDEX "oauth_tokens_refresh_expires_idx" ON "oauth_tokens" USING btree ("refresh_token_expires_at");--> statement-breakpoint
CREATE INDEX "oidc_signing_keys_status_idx" ON "oidc_signing_keys" USING btree ("status");--> statement-breakpoint
CREATE INDEX "oidc_signing_keys_kid_idx" ON "oidc_signing_keys" USING btree ("kid");--> statement-breakpoint
CREATE UNIQUE INDEX "org_intermediate_ca_org_idx" ON "organization_intermediate_cas" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "org_intermediate_ca_cert_idx" ON "organization_intermediate_cas" USING btree ("intermediate_cert_id");--> statement-breakpoint
CREATE INDEX "org_intermediate_ca_status_idx" ON "organization_intermediate_cas" USING btree ("status");--> statement-breakpoint
CREATE INDEX "pin_violation_hostname_idx" ON "pin_violation_reports" USING btree ("hostname");--> statement-breakpoint
CREATE INDEX "pin_violation_reported_at_idx" ON "pin_violation_reports" USING btree ("reported_at");--> statement-breakpoint
CREATE INDEX "push_tokens_user_idx" ON "push_tokens" USING btree ("user_did");--> statement-breakpoint
CREATE INDEX "push_tokens_token_idx" ON "push_tokens" USING btree ("token");--> statement-breakpoint
CREATE INDEX "push_tokens_platform_idx" ON "push_tokens" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "repo_blobs_did_idx" ON "repo_blobs" USING btree ("did");--> statement-breakpoint
CREATE UNIQUE INDEX "repo_blobs_cid_idx" ON "repo_blobs" USING btree ("cid");--> statement-breakpoint
CREATE UNIQUE INDEX "repositories_did_idx" ON "repositories" USING btree ("did");--> statement-breakpoint
CREATE INDEX "repositories_updated_at_idx" ON "repositories" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "saml_assertions_provider_idx" ON "saml_assertions_received" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "saml_assertions_user_idx" ON "saml_assertions_received" USING btree ("user_did");--> statement-breakpoint
CREATE INDEX "saml_assertions_received_at_idx" ON "saml_assertions_received" USING btree ("received_at");--> statement-breakpoint
CREATE INDEX "saml_sps_entity_id_idx" ON "saml_service_providers" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "saml_sps_domain_idx" ON "saml_service_providers" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "saml_sps_status_idx" ON "saml_service_providers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "saml_sessions_sp_idx" ON "saml_sessions" USING btree ("sp_id");--> statement-breakpoint
CREATE INDEX "saml_sessions_user_idx" ON "saml_sessions" USING btree ("user_did");--> statement-breakpoint
CREATE INDEX "saml_sessions_session_index_idx" ON "saml_sessions" USING btree ("session_index");--> statement-breakpoint
CREATE INDEX "saml_sessions_expires_idx" ON "saml_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "session_cert_session_id_idx" ON "session_certificate_bindings" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "session_cert_fingerprint_idx" ON "session_certificate_bindings" USING btree ("certificate_fingerprint");--> statement-breakpoint
CREATE INDEX "session_cert_did_idx" ON "session_certificate_bindings" USING btree ("did");--> statement-breakpoint
CREATE INDEX "session_cert_status_idx" ON "session_certificate_bindings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sso_audit_user_idx" ON "sso_audit_log" USING btree ("user_did");--> statement-breakpoint
CREATE INDEX "sso_audit_event_type_idx" ON "sso_audit_log" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "sso_audit_created_at_idx" ON "sso_audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "sso_audit_provider_idx" ON "sso_audit_log" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "sso_audit_domain_idx" ON "sso_audit_log" USING btree ("domain_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sync_events_seq_idx" ON "sync_events" USING btree ("seq");--> statement-breakpoint
CREATE INDEX "sync_events_did_idx" ON "sync_events" USING btree ("did");--> statement-breakpoint
CREATE INDEX "sync_events_type_idx" ON "sync_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "sync_events_created_idx" ON "sync_events" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sync_subscriptions_service_idx" ON "sync_subscriptions" USING btree ("service");--> statement-breakpoint
CREATE INDEX "sync_subscriptions_status_idx" ON "sync_subscriptions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "trusted_users_user_did_idx" ON "trusted_users" USING btree ("user_did");--> statement-breakpoint
CREATE INDEX "trusted_users_trust_level_idx" ON "trusted_users" USING btree ("trust_level");--> statement-breakpoint
CREATE INDEX "trusted_users_auto_approve_idx" ON "trusted_users" USING btree ("auto_approve");--> statement-breakpoint
CREATE INDEX "video_deletion_log_video_uri_idx" ON "video_deletion_log" USING btree ("video_uri");--> statement-breakpoint
CREATE INDEX "video_deletion_log_author_did_idx" ON "video_deletion_log" USING btree ("author_did");--> statement-breakpoint
CREATE INDEX "video_deletion_log_deleted_by_idx" ON "video_deletion_log" USING btree ("deleted_by");--> statement-breakpoint
CREATE INDEX "video_deletion_log_deletion_type_idx" ON "video_deletion_log" USING btree ("deletion_type");--> statement-breakpoint
CREATE INDEX "video_deletion_log_created_at_idx" ON "video_deletion_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "video_moderation_queue_video_uri_idx" ON "video_moderation_queue" USING btree ("video_uri");--> statement-breakpoint
CREATE INDEX "video_moderation_queue_author_did_idx" ON "video_moderation_queue" USING btree ("author_did");--> statement-breakpoint
CREATE INDEX "video_moderation_queue_status_idx" ON "video_moderation_queue" USING btree ("status");--> statement-breakpoint
CREATE INDEX "video_moderation_queue_priority_idx" ON "video_moderation_queue" USING btree ("priority","submitted_at");--> statement-breakpoint
CREATE INDEX "video_moderation_queue_assigned_to_idx" ON "video_moderation_queue" USING btree ("assigned_to");--> statement-breakpoint
CREATE INDEX "video_moderation_queue_risk_level_idx" ON "video_moderation_queue" USING btree ("risk_level");--> statement-breakpoint
ALTER TABLE "actor_repos" ADD CONSTRAINT "actor_repos_certificate_id_ca_entity_certificates_id_fk" FOREIGN KEY ("certificate_id") REFERENCES "public"."ca_entity_certificates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_appeals" ADD CONSTRAINT "moderation_appeals_sanction_id_user_sanctions_id_fk" FOREIGN KEY ("sanction_id") REFERENCES "public"."user_sanctions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_suspended_by_users_did_fk" FOREIGN KEY ("suspended_by") REFERENCES "public"."users"("did") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plc_identities" ADD CONSTRAINT "plc_identities_certificate_id_ca_entity_certificates_id_fk" FOREIGN KEY ("certificate_id") REFERENCES "public"."ca_entity_certificates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "actor_repos_did_method_idx" ON "actor_repos" USING btree ("did_method");--> statement-breakpoint
CREATE INDEX "actor_repos_is_service_idx" ON "actor_repos" USING btree ("is_service");--> statement-breakpoint
CREATE INDEX "moderation_appeals_sanction_id_idx" ON "moderation_appeals" USING btree ("sanction_id");--> statement-breakpoint
CREATE INDEX "organizations_status_idx" ON "organizations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "organizations_parent_org_idx" ON "organizations" USING btree ("parent_organization_id");--> statement-breakpoint
CREATE INDEX "organizations_domain_org_idx" ON "organizations" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "organizations_hierarchy_path_idx" ON "organizations" USING btree ("hierarchy_path");--> statement-breakpoint
CREATE INDEX "plc_identities_cert_fingerprint_idx" ON "plc_identities" USING btree ("certificate_fingerprint");--> statement-breakpoint
CREATE INDEX "videos_moderation_status_idx" ON "videos" USING btree ("moderation_status");--> statement-breakpoint
CREATE INDEX "videos_deleted_at_idx" ON "videos" USING btree ("deleted_at");