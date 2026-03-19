-- Add invite_codes table
CREATE TABLE IF NOT EXISTS "invite_codes" (
  "id" text PRIMARY KEY NOT NULL,
  "code" text NOT NULL UNIQUE,
  "code_hash" text NOT NULL,
  "issuer_did" text NOT NULL REFERENCES "users"("did") ON DELETE CASCADE,
  "issuer_certificate_id" text REFERENCES "ca_entity_certificates"("id") ON DELETE SET NULL,
  "domain_id" text REFERENCES "domains"("id") ON DELETE CASCADE,
  "max_uses" integer DEFAULT 1,
  "used_count" integer DEFAULT 0 NOT NULL,
  "expires_at" timestamp,
  "used_by" jsonb DEFAULT '[]' NOT NULL,
  "metadata" jsonb,
  "status" text DEFAULT 'active' NOT NULL,
  "signature" text,
  "signature_algorithm" text DEFAULT 'RSA-SHA256',
  "created_at" timestamp DEFAULT now() NOT NULL,
  "revoked_at" timestamp,
  "revoked_by" text REFERENCES "users"("did"),
  "revoked_reason" text
);

-- Add indexes
CREATE UNIQUE INDEX IF NOT EXISTS "invite_codes_hash_idx" ON "invite_codes" ("code_hash");
CREATE INDEX IF NOT EXISTS "invite_codes_issuer_idx" ON "invite_codes" ("issuer_did");
CREATE INDEX IF NOT EXISTS "invite_codes_domain_idx" ON "invite_codes" ("domain_id");
CREATE INDEX IF NOT EXISTS "invite_codes_status_idx" ON "invite_codes" ("status");
CREATE INDEX IF NOT EXISTS "invite_codes_expires_idx" ON "invite_codes" ("expires_at");
CREATE INDEX IF NOT EXISTS "invite_codes_cert_idx" ON "invite_codes" ("issuer_certificate_id");
