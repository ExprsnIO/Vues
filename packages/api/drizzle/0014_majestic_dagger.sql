ALTER TABLE "auth_config" ADD COLUMN "local_tokens_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_config" ADD COLUMN "oauth_tokens_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_config" ADD COLUMN "api_keys_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_config" ADD COLUMN "service_tokens_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_config" ADD COLUMN "user_rate_limit_per_minute" integer DEFAULT 60 NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_config" ADD COLUMN "admin_rate_limit_per_minute" integer DEFAULT 120 NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_config" ADD COLUMN "anonymous_rate_limit_per_minute" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_config" ADD COLUMN "user_burst_limit" integer DEFAULT 20 NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_config" ADD COLUMN "admin_burst_limit" integer DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_config" ADD COLUMN "allowed_oauth_scopes" jsonb DEFAULT '["atproto","openid","profile","read","write"]'::jsonb;--> statement-breakpoint
ALTER TABLE "auth_config" ADD COLUMN "default_oauth_scopes" jsonb DEFAULT '["atproto"]'::jsonb;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "rate_limit_per_minute" integer;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "burst_limit" integer;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "daily_request_limit" integer;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "api_access_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "allowed_scopes" jsonb;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "webhooks_enabled" boolean DEFAULT false NOT NULL;