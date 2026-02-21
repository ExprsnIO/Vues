-- PLC Directory Tables
-- Exprsn's own PLC (DID registry) for did:plc identities

-- PLC Operations - the append-only operations log (core of PLC)
CREATE TABLE IF NOT EXISTS "plc_operations" (
  "id" SERIAL PRIMARY KEY,
  "did" TEXT NOT NULL,
  "cid" TEXT NOT NULL,
  "operation" JSONB NOT NULL,
  "nullified" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS "plc_operations_did_idx" ON "plc_operations" ("did");
CREATE UNIQUE INDEX IF NOT EXISTS "plc_operations_cid_idx" ON "plc_operations" ("cid");
CREATE INDEX IF NOT EXISTS "plc_operations_created_at_idx" ON "plc_operations" ("created_at");

-- PLC Identities - current resolved state of each DID
CREATE TABLE IF NOT EXISTS "plc_identities" (
  "did" TEXT PRIMARY KEY,
  "handle" TEXT,
  "pds_endpoint" TEXT,
  "signing_key" TEXT,
  "rotation_keys" JSONB NOT NULL,
  "also_known_as" JSONB,
  "services" JSONB,
  "last_operation_cid" TEXT,
  "created_at" TIMESTAMP DEFAULT NOW() NOT NULL,
  "updated_at" TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "plc_identities_handle_idx" ON "plc_identities" ("handle");
CREATE INDEX IF NOT EXISTS "plc_identities_pds_idx" ON "plc_identities" ("pds_endpoint");

-- PLC Handle Reservations - reserved handles for organizations
CREATE TABLE IF NOT EXISTS "plc_handle_reservations" (
  "id" SERIAL PRIMARY KEY,
  "handle" TEXT NOT NULL UNIQUE,
  "handle_type" TEXT NOT NULL,
  "organization_id" TEXT,
  "reserved_by" TEXT,
  "reserved_at" TIMESTAMP DEFAULT NOW() NOT NULL,
  "expires_at" TIMESTAMP,
  "status" TEXT NOT NULL DEFAULT 'active'
);

CREATE UNIQUE INDEX IF NOT EXISTS "plc_handle_reservations_handle_idx" ON "plc_handle_reservations" ("handle");
CREATE INDEX IF NOT EXISTS "plc_handle_reservations_org_idx" ON "plc_handle_reservations" ("organization_id");

-- PLC Audit Log - track all operations for compliance
CREATE TABLE IF NOT EXISTS "plc_audit_log" (
  "id" SERIAL PRIMARY KEY,
  "did" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "operation_cid" TEXT,
  "previous_state" JSONB,
  "new_state" JSONB,
  "ip_address" TEXT,
  "user_agent" TEXT,
  "created_at" TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS "plc_audit_log_did_idx" ON "plc_audit_log" ("did");
CREATE INDEX IF NOT EXISTS "plc_audit_log_action_idx" ON "plc_audit_log" ("action");
CREATE INDEX IF NOT EXISTS "plc_audit_log_created_at_idx" ON "plc_audit_log" ("created_at");
