-- Announcements and Payout Requests Tables

-- Announcements
CREATE TABLE IF NOT EXISTS "announcements" (
  "id" TEXT PRIMARY KEY,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'info',
  "status" TEXT NOT NULL DEFAULT 'draft',
  "target_audience" TEXT NOT NULL DEFAULT 'all',
  "dismissible" BOOLEAN NOT NULL DEFAULT true,
  "starts_at" TIMESTAMP,
  "ends_at" TIMESTAMP,
  "view_count" INTEGER NOT NULL DEFAULT 0,
  "dismiss_count" INTEGER NOT NULL DEFAULT 0,
  "created_by" TEXT NOT NULL,
  "created_at" TIMESTAMP DEFAULT NOW() NOT NULL,
  "updated_at" TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS "announcements_status_idx" ON "announcements" ("status");
CREATE INDEX IF NOT EXISTS "announcements_starts_at_idx" ON "announcements" ("starts_at");

-- Payout Requests
CREATE TABLE IF NOT EXISTS "payout_requests" (
  "id" TEXT PRIMARY KEY,
  "user_did" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "status" TEXT NOT NULL DEFAULT 'pending',
  "payout_method" TEXT,
  "payout_details" JSONB,
  "processed_by" TEXT,
  "processed_at" TIMESTAMP,
  "created_at" TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS "payout_requests_user_did_idx" ON "payout_requests" ("user_did");
CREATE INDEX IF NOT EXISTS "payout_requests_status_idx" ON "payout_requests" ("status");
