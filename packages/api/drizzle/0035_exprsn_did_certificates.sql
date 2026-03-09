-- Migration: did:exprsn Certificate Integration
-- Adds tables and columns for certificate-backed DID:exprsn support

-- =====================================================
-- Table: exprsn_did_certificates
-- Links did:exprsn DIDs to their X.509 certificates
-- =====================================================

CREATE TABLE IF NOT EXISTS "exprsn_did_certificates" (
	"id" text PRIMARY KEY NOT NULL,
	"did" text NOT NULL UNIQUE,
	"certificate_id" text NOT NULL REFERENCES "ca_entity_certificates"("id") ON DELETE cascade,
	"issuer_intermediate_id" text REFERENCES "ca_intermediate_certificates"("id") ON DELETE set null,
	"organization_id" text REFERENCES "organizations"("id") ON DELETE set null,
	"certificate_type" text NOT NULL, -- 'platform' | 'organization'
	"public_key_multibase" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL, -- 'active' | 'revoked' | 'expired'
	"created_at" timestamp DEFAULT now() NOT NULL,
	"revoked_at" timestamp,
	"revoked_by" text,
	"revocation_reason" text
);

CREATE UNIQUE INDEX IF NOT EXISTS "exprsn_did_certs_did_idx" ON "exprsn_did_certificates" USING btree ("did");
CREATE INDEX IF NOT EXISTS "exprsn_did_certs_cert_idx" ON "exprsn_did_certificates" USING btree ("certificate_id");
CREATE INDEX IF NOT EXISTS "exprsn_did_certs_org_idx" ON "exprsn_did_certificates" USING btree ("organization_id");
CREATE INDEX IF NOT EXISTS "exprsn_did_certs_status_idx" ON "exprsn_did_certificates" USING btree ("status");

-- =====================================================
-- Table: organization_intermediate_cas
-- Links organizations to their intermediate CA
-- =====================================================

CREATE TABLE IF NOT EXISTS "organization_intermediate_cas" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL UNIQUE REFERENCES "organizations"("id") ON DELETE cascade,
	"intermediate_cert_id" text NOT NULL REFERENCES "ca_intermediate_certificates"("id") ON DELETE cascade,
	"common_name" text NOT NULL,
	"max_path_length" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL, -- 'active' | 'revoked' | 'expired'
	"created_at" timestamp DEFAULT now() NOT NULL,
	"revoked_at" timestamp,
	"revoked_by" text
);

CREATE UNIQUE INDEX IF NOT EXISTS "org_intermediate_ca_org_idx" ON "organization_intermediate_cas" USING btree ("organization_id");
CREATE INDEX IF NOT EXISTS "org_intermediate_ca_cert_idx" ON "organization_intermediate_cas" USING btree ("intermediate_cert_id");
CREATE INDEX IF NOT EXISTS "org_intermediate_ca_status_idx" ON "organization_intermediate_cas" USING btree ("status");

-- =====================================================
-- Extend actor_repos with DID method and certificate
-- =====================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'actor_repos' AND column_name = 'did_method'
    ) THEN
        ALTER TABLE "actor_repos" ADD COLUMN "did_method" text DEFAULT 'plc';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'actor_repos' AND column_name = 'certificate_id'
    ) THEN
        ALTER TABLE "actor_repos" ADD COLUMN "certificate_id" text REFERENCES "ca_entity_certificates"("id") ON DELETE set null;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "actor_repos_did_method_idx" ON "actor_repos" USING btree ("did_method");

-- =====================================================
-- Extend plc_identities with certificate info
-- =====================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'plc_identities' AND column_name = 'certificate_id'
    ) THEN
        ALTER TABLE "plc_identities" ADD COLUMN "certificate_id" text REFERENCES "ca_entity_certificates"("id") ON DELETE set null;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'plc_identities' AND column_name = 'certificate_fingerprint'
    ) THEN
        ALTER TABLE "plc_identities" ADD COLUMN "certificate_fingerprint" text;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "plc_identities_cert_fingerprint_idx" ON "plc_identities" USING btree ("certificate_fingerprint");
