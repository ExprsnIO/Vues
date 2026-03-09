-- Domain Clusters - assign render clusters to domains
CREATE TABLE IF NOT EXISTS "domain_clusters" (
  "id" text PRIMARY KEY NOT NULL,
  "domain_id" text NOT NULL REFERENCES "domains"("id") ON DELETE CASCADE,
  "cluster_id" text NOT NULL REFERENCES "render_clusters"("id") ON DELETE CASCADE,
  "is_primary" boolean DEFAULT false NOT NULL,
  "priority" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "domain_clusters_domain_idx" ON "domain_clusters" ("domain_id");
CREATE INDEX IF NOT EXISTS "domain_clusters_cluster_idx" ON "domain_clusters" ("cluster_id");
CREATE UNIQUE INDEX IF NOT EXISTS "domain_clusters_unique_idx" ON "domain_clusters" ("domain_id", "cluster_id");

-- Domain Services - platform service configuration per domain
CREATE TABLE IF NOT EXISTS "domain_services" (
  "id" text PRIMARY KEY NOT NULL,
  "domain_id" text NOT NULL REFERENCES "domains"("id") ON DELETE CASCADE,
  "service_type" text NOT NULL,
  "enabled" boolean DEFAULT false NOT NULL,
  "endpoint" text,
  "config" jsonb,
  "status" text DEFAULT 'inactive' NOT NULL,
  "last_health_check" timestamp,
  "error_message" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "domain_services_domain_idx" ON "domain_services" ("domain_id");
CREATE INDEX IF NOT EXISTS "domain_services_type_idx" ON "domain_services" ("service_type");
CREATE INDEX IF NOT EXISTS "domain_services_status_idx" ON "domain_services" ("status");
CREATE UNIQUE INDEX IF NOT EXISTS "domain_services_unique_idx" ON "domain_services" ("domain_id", "service_type");

-- Domain Moderation Tables

-- Domain Banned Words
CREATE TABLE IF NOT EXISTS "domain_banned_words" (
  "id" text PRIMARY KEY NOT NULL,
  "domain_id" text NOT NULL REFERENCES "domains"("id") ON DELETE CASCADE,
  "word" text NOT NULL,
  "severity" text DEFAULT 'medium' NOT NULL,
  "action" text DEFAULT 'flag' NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "created_by" text REFERENCES "users"("did") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "domain_banned_words_domain_idx" ON "domain_banned_words" ("domain_id");
CREATE INDEX IF NOT EXISTS "domain_banned_words_severity_idx" ON "domain_banned_words" ("severity");
CREATE UNIQUE INDEX IF NOT EXISTS "domain_banned_words_unique_idx" ON "domain_banned_words" ("domain_id", "word");

-- Domain Banned Tags
CREATE TABLE IF NOT EXISTS "domain_banned_tags" (
  "id" text PRIMARY KEY NOT NULL,
  "domain_id" text NOT NULL REFERENCES "domains"("id") ON DELETE CASCADE,
  "tag" text NOT NULL,
  "severity" text DEFAULT 'medium' NOT NULL,
  "action" text DEFAULT 'flag' NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "created_by" text REFERENCES "users"("did") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "domain_banned_tags_domain_idx" ON "domain_banned_tags" ("domain_id");
CREATE INDEX IF NOT EXISTS "domain_banned_tags_severity_idx" ON "domain_banned_tags" ("severity");
CREATE UNIQUE INDEX IF NOT EXISTS "domain_banned_tags_unique_idx" ON "domain_banned_tags" ("domain_id", "tag");

-- Domain Moderation Queue
CREATE TABLE IF NOT EXISTS "domain_moderation_queue" (
  "id" text PRIMARY KEY NOT NULL,
  "domain_id" text NOT NULL REFERENCES "domains"("id") ON DELETE CASCADE,
  "content_type" text NOT NULL,
  "content_uri" text NOT NULL,
  "author_did" text REFERENCES "users"("did") ON DELETE SET NULL,
  "reason" text,
  "auto_flagged" boolean DEFAULT false NOT NULL,
  "flag_source" text,
  "priority" text DEFAULT 'medium' NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "assigned_to" text REFERENCES "users"("did") ON DELETE SET NULL,
  "resolved_by" text REFERENCES "users"("did") ON DELETE SET NULL,
  "resolved_at" timestamp,
  "resolution" text,
  "notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "domain_mod_queue_domain_idx" ON "domain_moderation_queue" ("domain_id");
CREATE INDEX IF NOT EXISTS "domain_mod_queue_status_idx" ON "domain_moderation_queue" ("status");
CREATE INDEX IF NOT EXISTS "domain_mod_queue_priority_idx" ON "domain_moderation_queue" ("priority");
CREATE INDEX IF NOT EXISTS "domain_mod_queue_author_idx" ON "domain_moderation_queue" ("author_did");
CREATE INDEX IF NOT EXISTS "domain_mod_queue_assigned_idx" ON "domain_moderation_queue" ("assigned_to");
CREATE INDEX IF NOT EXISTS "domain_mod_queue_created_idx" ON "domain_moderation_queue" ("created_at");

-- Domain Handle Reservations
CREATE TABLE IF NOT EXISTS "domain_handle_reservations" (
  "id" text PRIMARY KEY NOT NULL,
  "domain_id" text NOT NULL REFERENCES "domains"("id") ON DELETE CASCADE,
  "handle" text NOT NULL,
  "handle_type" text DEFAULT 'user' NOT NULL,
  "reason" text,
  "reserved_by" text REFERENCES "users"("did") ON DELETE SET NULL,
  "expires_at" timestamp,
  "claimed_by" text REFERENCES "users"("did") ON DELETE SET NULL,
  "claimed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "domain_handle_res_domain_idx" ON "domain_handle_reservations" ("domain_id");
CREATE INDEX IF NOT EXISTS "domain_handle_res_handle_idx" ON "domain_handle_reservations" ("handle");
CREATE INDEX IF NOT EXISTS "domain_handle_res_expires_idx" ON "domain_handle_reservations" ("expires_at");
CREATE UNIQUE INDEX IF NOT EXISTS "domain_handle_res_unique_idx" ON "domain_handle_reservations" ("domain_id", "handle");

-- Domain Identities (PLC)
CREATE TABLE IF NOT EXISTS "domain_identities" (
  "id" text PRIMARY KEY NOT NULL,
  "domain_id" text NOT NULL REFERENCES "domains"("id") ON DELETE CASCADE,
  "did" text NOT NULL UNIQUE,
  "handle" text NOT NULL,
  "pds_endpoint" text,
  "signing_key" text,
  "rotation_keys" jsonb,
  "status" text DEFAULT 'active' NOT NULL,
  "user_did" text REFERENCES "users"("did") ON DELETE SET NULL,
  "created_by" text REFERENCES "users"("did") ON DELETE SET NULL,
  "tombstoned_at" timestamp,
  "tombstone_reason" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "domain_identities_domain_idx" ON "domain_identities" ("domain_id");
CREATE INDEX IF NOT EXISTS "domain_identities_handle_idx" ON "domain_identities" ("handle");
CREATE INDEX IF NOT EXISTS "domain_identities_status_idx" ON "domain_identities" ("status");
CREATE INDEX IF NOT EXISTS "domain_identities_user_idx" ON "domain_identities" ("user_did");
CREATE UNIQUE INDEX IF NOT EXISTS "domain_identities_domain_handle_idx" ON "domain_identities" ("domain_id", "handle");
