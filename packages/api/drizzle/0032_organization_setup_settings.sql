-- Add organization infrastructure and federation settings for onboarding wizard
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "hosting_type" text DEFAULT 'cloud';
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "plc_provider" text DEFAULT 'exprsn';
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "self_hosted_plc_url" text;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "custom_domain" text;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "handle_suffix" text;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "federation_enabled" boolean DEFAULT true NOT NULL;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "federation_config" jsonb;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "moderation_config" jsonb;

-- Note: organization_tags.type column will be added when organization_tags table is created
