CREATE TABLE "bulk_import_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"created_by" text NOT NULL,
	"file_type" text NOT NULL,
	"file_name" text NOT NULL,
	"file_size" integer,
	"status" text NOT NULL,
	"total_rows" integer,
	"processed_rows" integer DEFAULT 0 NOT NULL,
	"success_count" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"errors" jsonb,
	"field_mapping" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "ca_certificate_revocation_lists" (
	"id" text PRIMARY KEY NOT NULL,
	"issuer_id" text NOT NULL,
	"issuer_type" text NOT NULL,
	"crl" text NOT NULL,
	"this_update" timestamp NOT NULL,
	"next_update" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ca_entity_certificates" (
	"id" text PRIMARY KEY NOT NULL,
	"issuer_id" text NOT NULL,
	"issuer_type" text NOT NULL,
	"subject_did" text,
	"service_id" text,
	"cert_type" text NOT NULL,
	"common_name" text NOT NULL,
	"subject" jsonb NOT NULL,
	"subject_alt_names" jsonb,
	"certificate" text NOT NULL,
	"public_key" text NOT NULL,
	"private_key" text NOT NULL,
	"serial_number" text NOT NULL,
	"fingerprint" text NOT NULL,
	"algorithm" jsonb NOT NULL,
	"not_before" timestamp NOT NULL,
	"not_after" timestamp NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"revoked_at" timestamp,
	"revocation_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ca_intermediate_certificates" (
	"id" text PRIMARY KEY NOT NULL,
	"root_id" text NOT NULL,
	"common_name" text NOT NULL,
	"subject" jsonb NOT NULL,
	"certificate" text NOT NULL,
	"public_key" text NOT NULL,
	"private_key" text NOT NULL,
	"serial_number" text NOT NULL,
	"fingerprint" text NOT NULL,
	"path_length" integer DEFAULT 0 NOT NULL,
	"algorithm" jsonb NOT NULL,
	"not_before" timestamp NOT NULL,
	"not_after" timestamp NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ca_root_certificates" (
	"id" text PRIMARY KEY NOT NULL,
	"common_name" text NOT NULL,
	"subject" jsonb NOT NULL,
	"certificate" text NOT NULL,
	"public_key" text NOT NULL,
	"private_key" text NOT NULL,
	"serial_number" text NOT NULL,
	"fingerprint" text NOT NULL,
	"algorithm" jsonb NOT NULL,
	"not_before" timestamp NOT NULL,
	"not_after" timestamp NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creator_earnings" (
	"user_did" text PRIMARY KEY NOT NULL,
	"total_earnings" integer DEFAULT 0 NOT NULL,
	"available_balance" integer DEFAULT 0 NOT NULL,
	"pending_balance" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"last_payout_at" timestamp,
	"last_payout_amount" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "editor_collaborators" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"user_did" text NOT NULL,
	"access_level" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "editor_document_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"snapshot" text NOT NULL,
	"version" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "editor_projects" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_did" text NOT NULL,
	"title" text NOT NULL,
	"settings" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "live_streams" (
	"id" text PRIMARY KEY NOT NULL,
	"user_did" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" text NOT NULL,
	"stream_key" text NOT NULL,
	"ingest_url" text,
	"playback_url" text,
	"thumbnail_url" text,
	"viewer_count" integer DEFAULT 0 NOT NULL,
	"peak_viewers" integer DEFAULT 0 NOT NULL,
	"total_views" integer DEFAULT 0 NOT NULL,
	"provider" text NOT NULL,
	"provider_stream_id" text,
	"provider_channel_arn" text,
	"category" text,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"visibility" text DEFAULT 'public' NOT NULL,
	"chat_enabled" boolean DEFAULT true NOT NULL,
	"recording_enabled" boolean DEFAULT true NOT NULL,
	"recording_url" text,
	"scheduled_at" timestamp,
	"started_at" timestamp,
	"ended_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_activity" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"actor_did" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"details" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_blocked_words" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"word" text NOT NULL,
	"severity" text DEFAULT 'medium' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_member_tags" (
	"id" text PRIMARY KEY NOT NULL,
	"member_id" text NOT NULL,
	"tag_id" text NOT NULL,
	"assigned_by" text,
	"assigned_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_members" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_did" text NOT NULL,
	"role" text NOT NULL,
	"permissions" jsonb DEFAULT '[]'::jsonb,
	"invited_by" text,
	"display_order" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"suspended_at" timestamp,
	"suspended_by" text,
	"suspended_reason" text,
	"joined_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_tags" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#6366f1' NOT NULL,
	"description" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_did" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"description" text,
	"website" text,
	"avatar" text,
	"verified" boolean DEFAULT false NOT NULL,
	"member_count" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_configs" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"user_did" text,
	"provider" text NOT NULL,
	"provider_account_id" text,
	"credentials" jsonb,
	"test_mode" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_customers" (
	"id" text PRIMARY KEY NOT NULL,
	"user_did" text NOT NULL,
	"config_id" text NOT NULL,
	"provider_customer_id" text NOT NULL,
	"email" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_methods" (
	"id" text PRIMARY KEY NOT NULL,
	"user_did" text NOT NULL,
	"config_id" text NOT NULL,
	"customer_id" text,
	"provider_payment_method_id" text NOT NULL,
	"type" text NOT NULL,
	"last4" text,
	"brand" text,
	"expiry_month" integer,
	"expiry_year" integer,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"config_id" text NOT NULL,
	"customer_id" text,
	"provider_transaction_id" text,
	"type" text NOT NULL,
	"status" text NOT NULL,
	"amount" integer NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"from_did" text,
	"to_did" text,
	"description" text,
	"metadata" jsonb,
	"error_message" text,
	"refunded_amount" integer,
	"idempotency_key" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stream_banned_users" (
	"id" text PRIMARY KEY NOT NULL,
	"stream_id" text NOT NULL,
	"user_did" text NOT NULL,
	"reason" text,
	"banned_by" text NOT NULL,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stream_chat" (
	"id" text PRIMARY KEY NOT NULL,
	"stream_id" text NOT NULL,
	"user_did" text NOT NULL,
	"message" text NOT NULL,
	"message_type" text DEFAULT 'text' NOT NULL,
	"metadata" jsonb,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stream_moderators" (
	"id" text PRIMARY KEY NOT NULL,
	"stream_id" text NOT NULL,
	"user_did" text NOT NULL,
	"added_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stream_viewers" (
	"id" text PRIMARY KEY NOT NULL,
	"stream_id" text NOT NULL,
	"user_did" text,
	"session_id" text NOT NULL,
	"watch_duration" integer DEFAULT 0 NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	"left_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "layout" jsonb;--> statement-breakpoint
ALTER TABLE "bulk_import_jobs" ADD CONSTRAINT "bulk_import_jobs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bulk_import_jobs" ADD CONSTRAINT "bulk_import_jobs_created_by_users_did_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("did") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ca_entity_certificates" ADD CONSTRAINT "ca_entity_certificates_subject_did_users_did_fk" FOREIGN KEY ("subject_did") REFERENCES "public"."users"("did") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ca_intermediate_certificates" ADD CONSTRAINT "ca_intermediate_certificates_root_id_ca_root_certificates_id_fk" FOREIGN KEY ("root_id") REFERENCES "public"."ca_root_certificates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_earnings" ADD CONSTRAINT "creator_earnings_user_did_users_did_fk" FOREIGN KEY ("user_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editor_collaborators" ADD CONSTRAINT "editor_collaborators_project_id_editor_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."editor_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editor_collaborators" ADD CONSTRAINT "editor_collaborators_user_did_users_did_fk" FOREIGN KEY ("user_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editor_document_snapshots" ADD CONSTRAINT "editor_document_snapshots_project_id_editor_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."editor_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editor_projects" ADD CONSTRAINT "editor_projects_owner_did_users_did_fk" FOREIGN KEY ("owner_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_streams" ADD CONSTRAINT "live_streams_user_did_users_did_fk" FOREIGN KEY ("user_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_activity" ADD CONSTRAINT "organization_activity_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_activity" ADD CONSTRAINT "organization_activity_actor_did_users_did_fk" FOREIGN KEY ("actor_did") REFERENCES "public"."users"("did") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_blocked_words" ADD CONSTRAINT "organization_blocked_words_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_blocked_words" ADD CONSTRAINT "organization_blocked_words_created_by_users_did_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("did") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_member_tags" ADD CONSTRAINT "organization_member_tags_member_id_organization_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."organization_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_member_tags" ADD CONSTRAINT "organization_member_tags_tag_id_organization_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."organization_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_member_tags" ADD CONSTRAINT "organization_member_tags_assigned_by_users_did_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("did") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_user_did_users_did_fk" FOREIGN KEY ("user_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_tags" ADD CONSTRAINT "organization_tags_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_tags" ADD CONSTRAINT "organization_tags_created_by_users_did_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("did") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_owner_did_users_did_fk" FOREIGN KEY ("owner_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_configs" ADD CONSTRAINT "payment_configs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_configs" ADD CONSTRAINT "payment_configs_user_did_users_did_fk" FOREIGN KEY ("user_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_customers" ADD CONSTRAINT "payment_customers_user_did_users_did_fk" FOREIGN KEY ("user_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_customers" ADD CONSTRAINT "payment_customers_config_id_payment_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."payment_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_user_did_users_did_fk" FOREIGN KEY ("user_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_config_id_payment_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."payment_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_customer_id_payment_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."payment_customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_config_id_payment_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."payment_configs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_customer_id_payment_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."payment_customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_from_did_users_did_fk" FOREIGN KEY ("from_did") REFERENCES "public"."users"("did") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_to_did_users_did_fk" FOREIGN KEY ("to_did") REFERENCES "public"."users"("did") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stream_banned_users" ADD CONSTRAINT "stream_banned_users_stream_id_live_streams_id_fk" FOREIGN KEY ("stream_id") REFERENCES "public"."live_streams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stream_banned_users" ADD CONSTRAINT "stream_banned_users_user_did_users_did_fk" FOREIGN KEY ("user_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stream_banned_users" ADD CONSTRAINT "stream_banned_users_banned_by_users_did_fk" FOREIGN KEY ("banned_by") REFERENCES "public"."users"("did") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stream_chat" ADD CONSTRAINT "stream_chat_stream_id_live_streams_id_fk" FOREIGN KEY ("stream_id") REFERENCES "public"."live_streams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stream_chat" ADD CONSTRAINT "stream_chat_user_did_users_did_fk" FOREIGN KEY ("user_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stream_moderators" ADD CONSTRAINT "stream_moderators_stream_id_live_streams_id_fk" FOREIGN KEY ("stream_id") REFERENCES "public"."live_streams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stream_moderators" ADD CONSTRAINT "stream_moderators_user_did_users_did_fk" FOREIGN KEY ("user_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stream_moderators" ADD CONSTRAINT "stream_moderators_added_by_users_did_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("did") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stream_viewers" ADD CONSTRAINT "stream_viewers_stream_id_live_streams_id_fk" FOREIGN KEY ("stream_id") REFERENCES "public"."live_streams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stream_viewers" ADD CONSTRAINT "stream_viewers_user_did_users_did_fk" FOREIGN KEY ("user_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bulk_import_jobs_org_idx" ON "bulk_import_jobs" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "bulk_import_jobs_created_by_idx" ON "bulk_import_jobs" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "bulk_import_jobs_status_idx" ON "bulk_import_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "bulk_import_jobs_created_idx" ON "bulk_import_jobs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ca_crl_issuer_idx" ON "ca_certificate_revocation_lists" USING btree ("issuer_id");--> statement-breakpoint
CREATE INDEX "ca_crl_next_update_idx" ON "ca_certificate_revocation_lists" USING btree ("next_update");--> statement-breakpoint
CREATE INDEX "ca_entity_issuer_idx" ON "ca_entity_certificates" USING btree ("issuer_id");--> statement-breakpoint
CREATE INDEX "ca_entity_subject_did_idx" ON "ca_entity_certificates" USING btree ("subject_did");--> statement-breakpoint
CREATE INDEX "ca_entity_service_id_idx" ON "ca_entity_certificates" USING btree ("service_id");--> statement-breakpoint
CREATE INDEX "ca_entity_cert_type_idx" ON "ca_entity_certificates" USING btree ("cert_type");--> statement-breakpoint
CREATE UNIQUE INDEX "ca_entity_serial_idx" ON "ca_entity_certificates" USING btree ("serial_number");--> statement-breakpoint
CREATE INDEX "ca_entity_status_idx" ON "ca_entity_certificates" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ca_intermediate_root_idx" ON "ca_intermediate_certificates" USING btree ("root_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ca_intermediate_serial_idx" ON "ca_intermediate_certificates" USING btree ("serial_number");--> statement-breakpoint
CREATE INDEX "ca_intermediate_status_idx" ON "ca_intermediate_certificates" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "ca_root_serial_idx" ON "ca_root_certificates" USING btree ("serial_number");--> statement-breakpoint
CREATE INDEX "ca_root_fingerprint_idx" ON "ca_root_certificates" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX "ca_root_status_idx" ON "ca_root_certificates" USING btree ("status");--> statement-breakpoint
CREATE INDEX "editor_collaborators_project_idx" ON "editor_collaborators" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "editor_collaborators_user_idx" ON "editor_collaborators" USING btree ("user_did");--> statement-breakpoint
CREATE UNIQUE INDEX "editor_collaborators_unique_idx" ON "editor_collaborators" USING btree ("project_id","user_did");--> statement-breakpoint
CREATE INDEX "editor_snapshots_project_idx" ON "editor_document_snapshots" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "editor_snapshots_version_idx" ON "editor_document_snapshots" USING btree ("project_id","version");--> statement-breakpoint
CREATE INDEX "editor_projects_owner_idx" ON "editor_projects" USING btree ("owner_did");--> statement-breakpoint
CREATE INDEX "editor_projects_created_idx" ON "editor_projects" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "live_streams_user_idx" ON "live_streams" USING btree ("user_did");--> statement-breakpoint
CREATE INDEX "live_streams_status_idx" ON "live_streams" USING btree ("status");--> statement-breakpoint
CREATE INDEX "live_streams_provider_idx" ON "live_streams" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "live_streams_category_idx" ON "live_streams" USING btree ("category");--> statement-breakpoint
CREATE INDEX "live_streams_visibility_idx" ON "live_streams" USING btree ("visibility");--> statement-breakpoint
CREATE INDEX "live_streams_scheduled_idx" ON "live_streams" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX "live_streams_created_idx" ON "live_streams" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "live_streams_stream_key_idx" ON "live_streams" USING btree ("stream_key");--> statement-breakpoint
CREATE INDEX "org_activity_org_idx" ON "organization_activity" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "org_activity_actor_idx" ON "organization_activity" USING btree ("actor_did");--> statement-breakpoint
CREATE INDEX "org_activity_action_idx" ON "organization_activity" USING btree ("action");--> statement-breakpoint
CREATE INDEX "org_activity_created_idx" ON "organization_activity" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "org_blocked_words_org_idx" ON "organization_blocked_words" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "org_blocked_words_word_idx" ON "organization_blocked_words" USING btree ("word");--> statement-breakpoint
CREATE UNIQUE INDEX "org_blocked_words_unique_idx" ON "organization_blocked_words" USING btree ("organization_id","word");--> statement-breakpoint
CREATE INDEX "org_member_tags_member_idx" ON "organization_member_tags" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "org_member_tags_tag_idx" ON "organization_member_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "org_member_tags_unique_idx" ON "organization_member_tags" USING btree ("member_id","tag_id");--> statement-breakpoint
CREATE INDEX "org_members_org_idx" ON "organization_members" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "org_members_user_idx" ON "organization_members" USING btree ("user_did");--> statement-breakpoint
CREATE INDEX "org_members_role_idx" ON "organization_members" USING btree ("role");--> statement-breakpoint
CREATE INDEX "org_members_status_idx" ON "organization_members" USING btree ("status");--> statement-breakpoint
CREATE INDEX "org_members_display_order_idx" ON "organization_members" USING btree ("organization_id","display_order");--> statement-breakpoint
CREATE UNIQUE INDEX "org_members_unique_idx" ON "organization_members" USING btree ("organization_id","user_did");--> statement-breakpoint
CREATE INDEX "org_tags_org_idx" ON "organization_tags" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "org_tags_name_idx" ON "organization_tags" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "org_tags_unique_idx" ON "organization_tags" USING btree ("organization_id","name");--> statement-breakpoint
CREATE INDEX "organizations_owner_idx" ON "organizations" USING btree ("owner_did");--> statement-breakpoint
CREATE INDEX "organizations_type_idx" ON "organizations" USING btree ("type");--> statement-breakpoint
CREATE INDEX "organizations_name_idx" ON "organizations" USING btree ("name");--> statement-breakpoint
CREATE INDEX "payment_configs_org_idx" ON "payment_configs" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "payment_configs_user_idx" ON "payment_configs" USING btree ("user_did");--> statement-breakpoint
CREATE INDEX "payment_configs_provider_idx" ON "payment_configs" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "payment_configs_active_idx" ON "payment_configs" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "payment_customers_user_idx" ON "payment_customers" USING btree ("user_did");--> statement-breakpoint
CREATE INDEX "payment_customers_config_idx" ON "payment_customers" USING btree ("config_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_customers_provider_id_idx" ON "payment_customers" USING btree ("config_id","provider_customer_id");--> statement-breakpoint
CREATE INDEX "payment_methods_user_did_idx" ON "payment_methods" USING btree ("user_did");--> statement-breakpoint
CREATE INDEX "payment_methods_config_idx" ON "payment_methods" USING btree ("config_id");--> statement-breakpoint
CREATE INDEX "payment_methods_customer_idx" ON "payment_methods" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "payment_methods_default_idx" ON "payment_methods" USING btree ("user_did","is_default");--> statement-breakpoint
CREATE INDEX "payment_transactions_config_idx" ON "payment_transactions" USING btree ("config_id");--> statement-breakpoint
CREATE INDEX "payment_transactions_customer_idx" ON "payment_transactions" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "payment_transactions_type_idx" ON "payment_transactions" USING btree ("type");--> statement-breakpoint
CREATE INDEX "payment_transactions_status_idx" ON "payment_transactions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payment_transactions_from_did_idx" ON "payment_transactions" USING btree ("from_did");--> statement-breakpoint
CREATE INDEX "payment_transactions_to_did_idx" ON "payment_transactions" USING btree ("to_did");--> statement-breakpoint
CREATE INDEX "payment_transactions_created_idx" ON "payment_transactions" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_transactions_idempotency_idx" ON "payment_transactions" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "payment_transactions_provider_id_idx" ON "payment_transactions" USING btree ("provider_transaction_id");--> statement-breakpoint
CREATE INDEX "stream_banned_users_stream_idx" ON "stream_banned_users" USING btree ("stream_id");--> statement-breakpoint
CREATE INDEX "stream_banned_users_user_idx" ON "stream_banned_users" USING btree ("user_did");--> statement-breakpoint
CREATE UNIQUE INDEX "stream_banned_users_unique_idx" ON "stream_banned_users" USING btree ("stream_id","user_did");--> statement-breakpoint
CREATE INDEX "stream_banned_users_expires_idx" ON "stream_banned_users" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "stream_chat_stream_idx" ON "stream_chat" USING btree ("stream_id");--> statement-breakpoint
CREATE INDEX "stream_chat_user_idx" ON "stream_chat" USING btree ("user_did");--> statement-breakpoint
CREATE INDEX "stream_chat_created_idx" ON "stream_chat" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "stream_chat_stream_created_idx" ON "stream_chat" USING btree ("stream_id","created_at");--> statement-breakpoint
CREATE INDEX "stream_moderators_stream_idx" ON "stream_moderators" USING btree ("stream_id");--> statement-breakpoint
CREATE INDEX "stream_moderators_user_idx" ON "stream_moderators" USING btree ("user_did");--> statement-breakpoint
CREATE UNIQUE INDEX "stream_moderators_unique_idx" ON "stream_moderators" USING btree ("stream_id","user_did");--> statement-breakpoint
CREATE INDEX "stream_viewers_stream_idx" ON "stream_viewers" USING btree ("stream_id");--> statement-breakpoint
CREATE INDEX "stream_viewers_user_idx" ON "stream_viewers" USING btree ("user_did");--> statement-breakpoint
CREATE INDEX "stream_viewers_session_idx" ON "stream_viewers" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "stream_viewers_joined_idx" ON "stream_viewers" USING btree ("joined_at");