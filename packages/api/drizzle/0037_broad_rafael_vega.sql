CREATE TABLE "domain_mfa_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"domain_id" text NOT NULL,
	"mfa_mode" text DEFAULT 'optional' NOT NULL,
	"allowed_mfa_methods" jsonb DEFAULT '["totp","webauthn"]'::jsonb,
	"totp_enabled" boolean DEFAULT true NOT NULL,
	"totp_issuer" text,
	"totp_digits" integer DEFAULT 6 NOT NULL,
	"totp_period" integer DEFAULT 30 NOT NULL,
	"totp_algorithm" text DEFAULT 'SHA1' NOT NULL,
	"webauthn_enabled" boolean DEFAULT true NOT NULL,
	"webauthn_rp_name" text,
	"webauthn_rp_id" text,
	"webauthn_user_verification" text DEFAULT 'preferred',
	"webauthn_attachment" text DEFAULT 'cross-platform',
	"sms_enabled" boolean DEFAULT false NOT NULL,
	"sms_provider" text,
	"sms_config" jsonb,
	"email_otp_enabled" boolean DEFAULT false NOT NULL,
	"email_otp_expiry_minutes" integer DEFAULT 10,
	"backup_codes_enabled" boolean DEFAULT true NOT NULL,
	"backup_codes_count" integer DEFAULT 10 NOT NULL,
	"grace_period_days" integer DEFAULT 7 NOT NULL,
	"remember_device_enabled" boolean DEFAULT true NOT NULL,
	"remember_device_days" integer DEFAULT 30 NOT NULL,
	"recovery_email_required" boolean DEFAULT false NOT NULL,
	"total_users_enrolled" integer DEFAULT 0 NOT NULL,
	"totp_enrolled_count" integer DEFAULT 0 NOT NULL,
	"webauthn_enrolled_count" integer DEFAULT 0 NOT NULL,
	"updated_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "domain_mfa_settings_domain_id_unique" UNIQUE("domain_id")
);
--> statement-breakpoint
CREATE TABLE "domain_oauth_providers" (
	"id" text PRIMARY KEY NOT NULL,
	"domain_id" text NOT NULL,
	"provider_key" text NOT NULL,
	"display_name" text NOT NULL,
	"description" text,
	"type" text NOT NULL,
	"client_id" text NOT NULL,
	"client_secret" text NOT NULL,
	"authorization_endpoint" text NOT NULL,
	"token_endpoint" text NOT NULL,
	"userinfo_endpoint" text,
	"jwks_uri" text,
	"issuer" text,
	"scopes" jsonb DEFAULT '["openid","profile","email"]'::jsonb,
	"claim_mapping" jsonb DEFAULT '{"sub":"external_id","email":"email","name":"display_name","picture":"avatar"}'::jsonb,
	"icon_url" text,
	"button_color" text,
	"button_text" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"auto_provision_users" boolean DEFAULT true NOT NULL,
	"default_role" text DEFAULT 'member',
	"required_email_domain" text,
	"allowed_email_domains" jsonb,
	"require_pkce" boolean DEFAULT true NOT NULL,
	"total_logins" integer DEFAULT 0 NOT NULL,
	"last_used_at" timestamp,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "domain_mfa_settings" ADD CONSTRAINT "domain_mfa_settings_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_mfa_settings" ADD CONSTRAINT "domain_mfa_settings_updated_by_users_did_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("did") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_oauth_providers" ADD CONSTRAINT "domain_oauth_providers_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_oauth_providers" ADD CONSTRAINT "domain_oauth_providers_created_by_users_did_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("did") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_oauth_providers" ADD CONSTRAINT "domain_oauth_providers_updated_by_users_did_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("did") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "domain_mfa_settings_domain_idx" ON "domain_mfa_settings" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "domain_mfa_settings_mode_idx" ON "domain_mfa_settings" USING btree ("mfa_mode");--> statement-breakpoint
CREATE INDEX "domain_oauth_providers_domain_idx" ON "domain_oauth_providers" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "domain_oauth_providers_key_idx" ON "domain_oauth_providers" USING btree ("provider_key");--> statement-breakpoint
CREATE INDEX "domain_oauth_providers_enabled_idx" ON "domain_oauth_providers" USING btree ("enabled");--> statement-breakpoint
CREATE UNIQUE INDEX "domain_oauth_providers_unique_idx" ON "domain_oauth_providers" USING btree ("domain_id","provider_key");