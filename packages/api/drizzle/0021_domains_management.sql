CREATE TABLE "domain_activity_log" (
	"id" text PRIMARY KEY NOT NULL,
	"domain_id" text NOT NULL,
	"actor_did" text,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "domain_group_members" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"user_did" text NOT NULL,
	"added_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "domain_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"domain_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"permissions" jsonb DEFAULT '[]'::jsonb,
	"member_count" integer DEFAULT 0 NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "domain_users" (
	"id" text PRIMARY KEY NOT NULL,
	"domain_id" text NOT NULL,
	"user_did" text NOT NULL,
	"role" text NOT NULL,
	"permissions" jsonb DEFAULT '[]'::jsonb,
	"handle" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "domains" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"domain" text NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"intermediate_cert_id" text,
	"handle_suffix" text,
	"allowed_handle_patterns" jsonb,
	"pds_endpoint" text,
	"federation_did" text,
	"service_registry_id" text,
	"features" jsonb DEFAULT '{"videoHosting":true,"liveStreaming":true,"messaging":true,"feedGeneration":true,"customBranding":false,"apiAccess":false,"analytics":true}'::jsonb,
	"rate_limits" jsonb DEFAULT '{"requestsPerMinute":60,"requestsPerHour":1000,"dailyUploadLimit":100,"storageQuotaGb":10}'::jsonb,
	"branding" jsonb,
	"dns_verification_token" text,
	"dns_verified_at" timestamp,
	"owner_org_id" text,
	"owner_user_did" text,
	"user_count" integer DEFAULT 0 NOT NULL,
	"group_count" integer DEFAULT 0 NOT NULL,
	"certificate_count" integer DEFAULT 0 NOT NULL,
	"verified_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "domains_domain_unique" UNIQUE("domain")
);
--> statement-breakpoint
ALTER TABLE "domain_activity_log" ADD CONSTRAINT "domain_activity_log_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_activity_log" ADD CONSTRAINT "domain_activity_log_actor_did_users_did_fk" FOREIGN KEY ("actor_did") REFERENCES "public"."users"("did") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_group_members" ADD CONSTRAINT "domain_group_members_group_id_domain_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."domain_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_group_members" ADD CONSTRAINT "domain_group_members_user_did_users_did_fk" FOREIGN KEY ("user_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_group_members" ADD CONSTRAINT "domain_group_members_added_by_users_did_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("did") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_groups" ADD CONSTRAINT "domain_groups_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_users" ADD CONSTRAINT "domain_users_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_users" ADD CONSTRAINT "domain_users_user_did_users_did_fk" FOREIGN KEY ("user_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domains" ADD CONSTRAINT "domains_intermediate_cert_id_ca_intermediate_certificates_id_fk" FOREIGN KEY ("intermediate_cert_id") REFERENCES "public"."ca_intermediate_certificates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domains" ADD CONSTRAINT "domains_service_registry_id_service_registry_id_fk" FOREIGN KEY ("service_registry_id") REFERENCES "public"."service_registry"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domains" ADD CONSTRAINT "domains_owner_org_id_organizations_id_fk" FOREIGN KEY ("owner_org_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domains" ADD CONSTRAINT "domains_owner_user_did_users_did_fk" FOREIGN KEY ("owner_user_did") REFERENCES "public"."users"("did") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "domain_activity_log_domain_idx" ON "domain_activity_log" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "domain_activity_log_actor_idx" ON "domain_activity_log" USING btree ("actor_did");--> statement-breakpoint
CREATE INDEX "domain_activity_log_action_idx" ON "domain_activity_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX "domain_activity_log_created_idx" ON "domain_activity_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "domain_activity_log_domain_created_idx" ON "domain_activity_log" USING btree ("domain_id","created_at");--> statement-breakpoint
CREATE INDEX "domain_group_members_group_idx" ON "domain_group_members" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "domain_group_members_user_idx" ON "domain_group_members" USING btree ("user_did");--> statement-breakpoint
CREATE UNIQUE INDEX "domain_group_members_unique_idx" ON "domain_group_members" USING btree ("group_id","user_did");--> statement-breakpoint
CREATE INDEX "domain_groups_domain_idx" ON "domain_groups" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "domain_groups_name_idx" ON "domain_groups" USING btree ("domain_id","name");--> statement-breakpoint
CREATE INDEX "domain_groups_default_idx" ON "domain_groups" USING btree ("domain_id","is_default");--> statement-breakpoint
CREATE INDEX "domain_users_domain_idx" ON "domain_users" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "domain_users_user_idx" ON "domain_users" USING btree ("user_did");--> statement-breakpoint
CREATE INDEX "domain_users_role_idx" ON "domain_users" USING btree ("domain_id","role");--> statement-breakpoint
CREATE UNIQUE INDEX "domain_users_unique_idx" ON "domain_users" USING btree ("domain_id","user_did");--> statement-breakpoint
CREATE UNIQUE INDEX "domains_domain_idx" ON "domains" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "domains_status_idx" ON "domains" USING btree ("status");--> statement-breakpoint
CREATE INDEX "domains_type_idx" ON "domains" USING btree ("type");--> statement-breakpoint
CREATE INDEX "domains_owner_org_idx" ON "domains" USING btree ("owner_org_id");--> statement-breakpoint
CREATE INDEX "domains_owner_user_idx" ON "domains" USING btree ("owner_user_did");--> statement-breakpoint
CREATE INDEX "domains_handle_suffix_idx" ON "domains" USING btree ("handle_suffix");