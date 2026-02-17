CREATE TABLE "admin_audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"admin_id" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"details" jsonb,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_users" (
	"id" text PRIMARY KEY NOT NULL,
	"user_did" text NOT NULL,
	"role" text NOT NULL,
	"permissions" jsonb DEFAULT '[]'::jsonb,
	"invited_by" text,
	"last_login_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"period" text NOT NULL,
	"metrics" jsonb NOT NULL,
	"start_at" timestamp NOT NULL,
	"end_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"reporter_did" text NOT NULL,
	"content_type" text NOT NULL,
	"content_uri" text NOT NULL,
	"reason" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp,
	"action_taken" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "featured_content" (
	"id" text PRIMARY KEY NOT NULL,
	"content_type" text NOT NULL,
	"content_uri" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"section" text NOT NULL,
	"start_at" timestamp,
	"end_at" timestamp,
	"added_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moderation_actions" (
	"id" text PRIMARY KEY NOT NULL,
	"admin_id" text NOT NULL,
	"content_type" text NOT NULL,
	"content_uri" text NOT NULL,
	"action_type" text NOT NULL,
	"reason" text NOT NULL,
	"notes" text,
	"report_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_config" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"description" text,
	"updated_by" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_sanctions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_did" text NOT NULL,
	"admin_id" text NOT NULL,
	"sanction_type" text NOT NULL,
	"reason" text NOT NULL,
	"expires_at" timestamp,
	"appeal_status" text,
	"appeal_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_admin_id_admin_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_user_did_users_did_fk" FOREIGN KEY ("user_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_reporter_did_users_did_fk" FOREIGN KEY ("reporter_did") REFERENCES "public"."users"("did") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "featured_content" ADD CONSTRAINT "featured_content_added_by_admin_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_admin_id_admin_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_report_id_content_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."content_reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_sanctions" ADD CONSTRAINT "user_sanctions_user_did_users_did_fk" FOREIGN KEY ("user_did") REFERENCES "public"."users"("did") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_sanctions" ADD CONSTRAINT "user_sanctions_admin_id_admin_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_audit_log_admin_idx" ON "admin_audit_log" USING btree ("admin_id");--> statement-breakpoint
CREATE INDEX "admin_audit_log_action_idx" ON "admin_audit_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX "admin_audit_log_created_idx" ON "admin_audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_users_user_did_idx" ON "admin_users" USING btree ("user_did");--> statement-breakpoint
CREATE INDEX "admin_users_role_idx" ON "admin_users" USING btree ("role");--> statement-breakpoint
CREATE INDEX "analytics_snapshots_period_idx" ON "analytics_snapshots" USING btree ("period");--> statement-breakpoint
CREATE INDEX "analytics_snapshots_start_at_idx" ON "analytics_snapshots" USING btree ("start_at");--> statement-breakpoint
CREATE INDEX "content_reports_reporter_idx" ON "content_reports" USING btree ("reporter_did");--> statement-breakpoint
CREATE INDEX "content_reports_content_type_idx" ON "content_reports" USING btree ("content_type");--> statement-breakpoint
CREATE INDEX "content_reports_status_idx" ON "content_reports" USING btree ("status");--> statement-breakpoint
CREATE INDEX "content_reports_created_idx" ON "content_reports" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "featured_content_section_idx" ON "featured_content" USING btree ("section");--> statement-breakpoint
CREATE INDEX "featured_content_position_idx" ON "featured_content" USING btree ("position");--> statement-breakpoint
CREATE INDEX "moderation_actions_admin_idx" ON "moderation_actions" USING btree ("admin_id");--> statement-breakpoint
CREATE INDEX "moderation_actions_content_type_idx" ON "moderation_actions" USING btree ("content_type");--> statement-breakpoint
CREATE INDEX "moderation_actions_created_idx" ON "moderation_actions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "user_sanctions_user_did_idx" ON "user_sanctions" USING btree ("user_did");--> statement-breakpoint
CREATE INDEX "user_sanctions_admin_idx" ON "user_sanctions" USING btree ("admin_id");--> statement-breakpoint
CREATE INDEX "user_sanctions_type_idx" ON "user_sanctions" USING btree ("sanction_type");--> statement-breakpoint
CREATE INDEX "user_sanctions_expires_idx" ON "user_sanctions" USING btree ("expires_at");