ALTER TABLE "domains"
  ADD COLUMN IF NOT EXISTS "federation_config" jsonb DEFAULT '{
    "enabled": false,
    "inboundEnabled": true,
    "outboundEnabled": true,
    "syncPosts": true,
    "syncLikes": true,
    "syncFollows": true,
    "syncProfiles": true,
    "syncBlobs": true,
    "discoveryEnabled": true,
    "searchEnabled": true,
    "allowedDomains": [],
    "blockedDomains": []
  }'::jsonb;

ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'active' NOT NULL,
  ADD COLUMN IF NOT EXISTS "suspended_at" timestamp,
  ADD COLUMN IF NOT EXISTS "suspended_by" text,
  ADD COLUMN IF NOT EXISTS "suspended_reason" text;

ALTER TABLE "external_identity_providers"
  ADD COLUMN IF NOT EXISTS "jit_config" jsonb;

CREATE INDEX IF NOT EXISTS "organizations_status_idx" ON "organizations" USING btree ("status");

ALTER TABLE "organizations"
  ADD CONSTRAINT "organizations_suspended_by_users_did_fk"
  FOREIGN KEY ("suspended_by") REFERENCES "public"."users"("did")
  ON DELETE set null ON UPDATE no action;

CREATE TABLE IF NOT EXISTS "domain_roles" (
  "id" text PRIMARY KEY NOT NULL,
  "domain_id" text NOT NULL,
  "name" text NOT NULL,
  "display_name" text NOT NULL,
  "description" text,
  "is_system" boolean DEFAULT false NOT NULL,
  "priority" integer DEFAULT 0 NOT NULL,
  "permissions" jsonb DEFAULT '[]'::jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "domain_roles"
  ADD CONSTRAINT "domain_roles_domain_id_domains_id_fk"
  FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id")
  ON DELETE cascade ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "domain_roles_domain_idx" ON "domain_roles" USING btree ("domain_id");
CREATE INDEX IF NOT EXISTS "domain_roles_priority_idx" ON "domain_roles" USING btree ("domain_id","priority");
CREATE UNIQUE INDEX IF NOT EXISTS "domain_roles_unique_idx" ON "domain_roles" USING btree ("domain_id","name");

CREATE TABLE IF NOT EXISTS "domain_user_roles" (
  "id" text PRIMARY KEY NOT NULL,
  "domain_user_id" text NOT NULL,
  "role_id" text NOT NULL,
  "assigned_by" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "domain_user_roles"
  ADD CONSTRAINT "domain_user_roles_domain_user_id_domain_users_id_fk"
  FOREIGN KEY ("domain_user_id") REFERENCES "public"."domain_users"("id")
  ON DELETE cascade ON UPDATE no action;

ALTER TABLE "domain_user_roles"
  ADD CONSTRAINT "domain_user_roles_role_id_domain_roles_id_fk"
  FOREIGN KEY ("role_id") REFERENCES "public"."domain_roles"("id")
  ON DELETE cascade ON UPDATE no action;

ALTER TABLE "domain_user_roles"
  ADD CONSTRAINT "domain_user_roles_assigned_by_users_did_fk"
  FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("did")
  ON DELETE set null ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "domain_user_roles_domain_user_idx" ON "domain_user_roles" USING btree ("domain_user_id");
CREATE INDEX IF NOT EXISTS "domain_user_roles_role_idx" ON "domain_user_roles" USING btree ("role_id");
CREATE UNIQUE INDEX IF NOT EXISTS "domain_user_roles_unique_idx" ON "domain_user_roles" USING btree ("domain_user_id","role_id");

CREATE TABLE IF NOT EXISTS "domain_group_roles" (
  "id" text PRIMARY KEY NOT NULL,
  "group_id" text NOT NULL,
  "role_id" text NOT NULL,
  "assigned_by" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "domain_group_roles"
  ADD CONSTRAINT "domain_group_roles_group_id_domain_groups_id_fk"
  FOREIGN KEY ("group_id") REFERENCES "public"."domain_groups"("id")
  ON DELETE cascade ON UPDATE no action;

ALTER TABLE "domain_group_roles"
  ADD CONSTRAINT "domain_group_roles_role_id_domain_roles_id_fk"
  FOREIGN KEY ("role_id") REFERENCES "public"."domain_roles"("id")
  ON DELETE cascade ON UPDATE no action;

ALTER TABLE "domain_group_roles"
  ADD CONSTRAINT "domain_group_roles_assigned_by_users_did_fk"
  FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("did")
  ON DELETE set null ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "domain_group_roles_group_idx" ON "domain_group_roles" USING btree ("group_id");
CREATE INDEX IF NOT EXISTS "domain_group_roles_role_idx" ON "domain_group_roles" USING btree ("role_id");
CREATE UNIQUE INDEX IF NOT EXISTS "domain_group_roles_unique_idx" ON "domain_group_roles" USING btree ("group_id","role_id");

INSERT INTO "domain_roles" ("id", "domain_id", "name", "display_name", "description", "is_system", "priority", "permissions")
SELECT
  'drole_' || d."id" || '_' || v."name",
  d."id",
  v."name",
  v."display_name",
  v."description",
  true,
  v."priority",
  v."permissions"::jsonb
FROM "domains" d
CROSS JOIN (
  VALUES
    ('owner', 'Owner', 'Full control over the domain.', 100, '["domain.users.view","domain.users.manage","domain.groups.view","domain.groups.manage","domain.roles.view","domain.roles.manage","domain.organizations.view","domain.organizations.manage","domain.sso.view","domain.sso.manage","domain.plc.view","domain.plc.manage","domain.federation.view","domain.federation.manage","domain.moderation.view","domain.moderation.manage","domain.services.view","domain.services.manage","domain.certificates.view","domain.certificates.manage","domain.analytics.view","domain.billing.view","domain.billing.manage","domain.branding.view","domain.branding.manage","domain.content.view","domain.content.manage"]'),
    ('admin', 'Admin', 'Administrative access to the domain.', 80, '["domain.users.view","domain.users.manage","domain.groups.view","domain.groups.manage","domain.roles.view","domain.roles.manage","domain.organizations.view","domain.organizations.manage","domain.sso.view","domain.sso.manage","domain.plc.view","domain.plc.manage","domain.federation.view","domain.federation.manage","domain.moderation.view","domain.moderation.manage","domain.services.view","domain.services.manage","domain.certificates.view","domain.certificates.manage","domain.analytics.view","domain.billing.view","domain.branding.view","domain.branding.manage","domain.content.view","domain.content.manage"]'),
    ('moderator', 'Moderator', 'Moderation and review access.', 60, '["domain.users.view","domain.groups.view","domain.organizations.view","domain.moderation.view","domain.moderation.manage","domain.content.view","domain.content.manage","domain.analytics.view"]'),
    ('member', 'Member', 'Basic access to shared domain surfaces.', 20, '["domain.users.view","domain.groups.view","domain.organizations.view","domain.content.view","domain.analytics.view"]')
) AS v("name", "display_name", "description", "priority", "permissions")
ON CONFLICT ("domain_id","name") DO NOTHING;

INSERT INTO "domain_user_roles" ("id", "domain_user_id", "role_id", "assigned_by", "created_at")
SELECT
  'durole_' || du."id",
  du."id",
  dr."id",
  NULL,
  du."created_at"
FROM "domain_users" du
INNER JOIN "domain_roles" dr
  ON dr."domain_id" = du."domain_id"
 AND dr."name" = du."role"
ON CONFLICT ("domain_user_id","role_id") DO NOTHING;
