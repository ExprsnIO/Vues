-- Add tombstone support to PLC identities

-- Add status column with default
ALTER TABLE "plc_identities" ADD COLUMN IF NOT EXISTS "status" TEXT DEFAULT 'active' NOT NULL;

-- Add tombstone tracking columns
ALTER TABLE "plc_identities" ADD COLUMN IF NOT EXISTS "tombstoned_at" TIMESTAMP;
ALTER TABLE "plc_identities" ADD COLUMN IF NOT EXISTS "tombstoned_by" TEXT;
ALTER TABLE "plc_identities" ADD COLUMN IF NOT EXISTS "tombstone_reason" TEXT;

-- Create index on status for efficient filtering
CREATE INDEX IF NOT EXISTS "plc_identities_status_idx" ON "plc_identities" ("status");
