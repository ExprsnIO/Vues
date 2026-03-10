CREATE TABLE "platform_directories" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'offline' NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"version" text,
	"record_count" integer DEFAULT 0,
	"sync_enabled" boolean DEFAULT true NOT NULL,
	"sync_interval_minutes" integer DEFAULT 15,
	"last_sync_at" timestamp,
	"last_sync_error" text,
	"last_sync_duration_ms" integer,
	"last_health_check_at" timestamp,
	"health_status" text,
	"response_time_ms" integer,
	"config" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sso_providers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'inactive' NOT NULL,
	"description" text,
	"client_id" text,
	"client_secret" text,
	"issuer_url" text,
	"authorization_url" text,
	"token_url" text,
	"user_info_url" text,
	"jwks_url" text,
	"scopes" jsonb DEFAULT '["openid","profile","email"]'::jsonb,
	"saml_entity_id" text,
	"saml_sso_url" text,
	"saml_slo_url" text,
	"saml_certificate" text,
	"saml_private_key" text,
	"ldap_url" text,
	"ldap_bind_dn" text,
	"ldap_bind_password" text,
	"ldap_base_dn" text,
	"ldap_user_filter" text,
	"attribute_mapping" jsonb DEFAULT '{}'::jsonb,
	"last_used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "platform_directories_status_idx" ON "platform_directories" USING btree ("status");--> statement-breakpoint
CREATE INDEX "platform_directories_primary_idx" ON "platform_directories" USING btree ("is_primary");--> statement-breakpoint
CREATE INDEX "sso_providers_type_idx" ON "sso_providers" USING btree ("type");--> statement-breakpoint
CREATE INDEX "sso_providers_status_idx" ON "sso_providers" USING btree ("status");