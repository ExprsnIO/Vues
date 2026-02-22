CREATE TABLE "admin_permission_audit" (
	"id" text PRIMARY KEY NOT NULL,
	"target_admin_id" text NOT NULL,
	"performed_by" text NOT NULL,
	"action" text NOT NULL,
	"previous_role" text,
	"new_role" text,
	"previous_permissions" jsonb,
	"new_permissions" jsonb,
	"reason" text,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"admin_id" text NOT NULL,
	"session_token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"device_info" jsonb,
	"last_activity_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"revoked_at" timestamp,
	"revoked_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_config" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"session_duration_hours" integer DEFAULT 24 NOT NULL,
	"admin_session_duration_hours" integer DEFAULT 8 NOT NULL,
	"max_concurrent_sessions" integer DEFAULT 5 NOT NULL,
	"max_concurrent_admin_sessions" integer DEFAULT 3 NOT NULL,
	"access_token_expiry_minutes" integer DEFAULT 60 NOT NULL,
	"refresh_token_expiry_days" integer DEFAULT 30 NOT NULL,
	"require_mfa_for_admins" boolean DEFAULT false NOT NULL,
	"allowed_mfa_methods" jsonb DEFAULT '["totp","webauthn"]'::jsonb,
	"password_min_length" integer DEFAULT 12 NOT NULL,
	"password_require_uppercase" boolean DEFAULT true NOT NULL,
	"password_require_numbers" boolean DEFAULT true NOT NULL,
	"password_require_symbols" boolean DEFAULT false NOT NULL,
	"max_login_attempts" integer DEFAULT 5 NOT NULL,
	"lockout_duration_minutes" integer DEFAULT 15 NOT NULL,
	"oauth_enabled" boolean DEFAULT true NOT NULL,
	"allowed_oauth_providers" jsonb DEFAULT '["atproto"]'::jsonb,
	"updated_by" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ca_config" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"root_cert_validity_days" integer DEFAULT 7300 NOT NULL,
	"intermediate_cert_validity_days" integer DEFAULT 3650 NOT NULL,
	"entity_cert_validity_days" integer DEFAULT 365 NOT NULL,
	"default_key_size" integer DEFAULT 4096 NOT NULL,
	"default_hash_algorithm" text DEFAULT 'SHA-256' NOT NULL,
	"crl_auto_generate" boolean DEFAULT true NOT NULL,
	"crl_generation_interval_hours" integer DEFAULT 24 NOT NULL,
	"crl_validity_hours" integer DEFAULT 168 NOT NULL,
	"last_crl_generated_at" timestamp,
	"renewal_reminder_days" integer DEFAULT 30 NOT NULL,
	"auto_renewal_enabled" boolean DEFAULT false NOT NULL,
	"max_certs_per_user_per_day" integer DEFAULT 5 NOT NULL,
	"max_service_certs_per_day" integer DEFAULT 50 NOT NULL,
	"ocsp_enabled" boolean DEFAULT false NOT NULL,
	"ocsp_responder_url" text,
	"updated_by" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moderation_config" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"auto_approve_threshold" integer DEFAULT 20 NOT NULL,
	"auto_reject_threshold" integer DEFAULT 80 NOT NULL,
	"require_review_threshold" integer DEFAULT 50 NOT NULL,
	"toxicity_weight" integer DEFAULT 100 NOT NULL,
	"nsfw_weight" integer DEFAULT 100 NOT NULL,
	"spam_weight" integer DEFAULT 80 NOT NULL,
	"violence_weight" integer DEFAULT 100 NOT NULL,
	"hate_speech_weight" integer DEFAULT 100 NOT NULL,
	"primary_ai_provider" text DEFAULT 'claude' NOT NULL,
	"fallback_ai_provider" text,
	"ai_timeout_ms" integer DEFAULT 30000 NOT NULL,
	"ai_retry_attempts" integer DEFAULT 2 NOT NULL,
	"max_queue_size" integer DEFAULT 10000 NOT NULL,
	"escalation_threshold_hours" integer DEFAULT 24 NOT NULL,
	"auto_assign_enabled" boolean DEFAULT false NOT NULL,
	"appeal_window_days" integer DEFAULT 30 NOT NULL,
	"max_appeals_per_user" integer DEFAULT 3 NOT NULL,
	"appeal_cooldown_days" integer DEFAULT 7 NOT NULL,
	"default_warn_expiry_days" integer DEFAULT 90 NOT NULL,
	"default_suspension_days" integer DEFAULT 7 NOT NULL,
	"notify_on_high_risk" boolean DEFAULT true NOT NULL,
	"notify_on_appeal" boolean DEFAULT true NOT NULL,
	"notify_on_escalation" boolean DEFAULT true NOT NULL,
	"updated_by" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_permission_audit" ADD CONSTRAINT "admin_permission_audit_target_admin_id_admin_users_id_fk" FOREIGN KEY ("target_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_permission_audit" ADD CONSTRAINT "admin_permission_audit_performed_by_admin_users_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_admin_id_admin_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_permission_audit_target_idx" ON "admin_permission_audit" USING btree ("target_admin_id");--> statement-breakpoint
CREATE INDEX "admin_permission_audit_performed_by_idx" ON "admin_permission_audit" USING btree ("performed_by");--> statement-breakpoint
CREATE INDEX "admin_permission_audit_action_idx" ON "admin_permission_audit" USING btree ("action");--> statement-breakpoint
CREATE INDEX "admin_permission_audit_created_at_idx" ON "admin_permission_audit" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "admin_sessions_admin_id_idx" ON "admin_sessions" USING btree ("admin_id");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_sessions_token_idx" ON "admin_sessions" USING btree ("session_token");--> statement-breakpoint
CREATE INDEX "admin_sessions_expires_at_idx" ON "admin_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "admin_sessions_last_activity_idx" ON "admin_sessions" USING btree ("last_activity_at");