CREATE TABLE "notification_log" (
	"id" text PRIMARY KEY NOT NULL,
	"user_did" text NOT NULL,
	"type" text NOT NULL,
	"event" text NOT NULL,
	"status" text NOT NULL,
	"recipient_email" text,
	"webhook_url" text,
	"payload" jsonb,
	"error_message" text,
	"response_code" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_settings" (
	"user_did" text PRIMARY KEY NOT NULL,
	"email" text,
	"email_enabled" boolean DEFAULT true,
	"webhook_url" text,
	"webhook_secret" text,
	"notify_on_complete" boolean DEFAULT true,
	"notify_on_failed" boolean DEFAULT true,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "render_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"user_did" text NOT NULL,
	"name" text,
	"total_jobs" integer DEFAULT 0,
	"completed_jobs" integer DEFAULT 0,
	"failed_jobs" integer DEFAULT 0,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "render_clusters" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"endpoint" text,
	"config" jsonb,
	"status" text DEFAULT 'active' NOT NULL,
	"region" text,
	"max_workers" integer,
	"current_workers" integer DEFAULT 0,
	"gpu_enabled" boolean DEFAULT false,
	"gpu_count" integer DEFAULT 0,
	"priority_routing" jsonb,
	"last_health_check" timestamp,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "render_presets" (
	"id" text PRIMARY KEY NOT NULL,
	"user_did" text,
	"name" text NOT NULL,
	"description" text,
	"settings" jsonb NOT NULL,
	"is_default" boolean DEFAULT false,
	"is_system" boolean DEFAULT false,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "render_workers" (
	"id" text PRIMARY KEY NOT NULL,
	"hostname" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"concurrency" integer DEFAULT 2,
	"active_jobs" integer DEFAULT 0,
	"total_processed" integer DEFAULT 0,
	"failed_jobs" integer DEFAULT 0,
	"avg_processing_time" real,
	"gpu_enabled" boolean DEFAULT false,
	"gpu_model" text,
	"last_heartbeat" timestamp,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "setup_state" (
	"id" text PRIMARY KEY DEFAULT 'singleton' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"current_step" integer DEFAULT 0,
	"completed_steps" jsonb DEFAULT '[]'::jsonb,
	"setup_token" text,
	"token_expires_at" timestamp,
	"completed_at" timestamp,
	"completed_by" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_render_quotas" (
	"user_did" text PRIMARY KEY NOT NULL,
	"daily_limit" integer DEFAULT 10,
	"daily_used" integer DEFAULT 0,
	"daily_reset_at" timestamp,
	"weekly_limit" integer DEFAULT 50,
	"weekly_used" integer DEFAULT 0,
	"weekly_reset_at" timestamp,
	"concurrent_limit" integer DEFAULT 2,
	"max_quality" text DEFAULT 'ultra',
	"priority_boost" integer DEFAULT 0,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "render_jobs" ADD COLUMN "priority" text DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE "render_jobs" ADD COLUMN "priority_score" integer DEFAULT 50;--> statement-breakpoint
ALTER TABLE "render_jobs" ADD COLUMN "batch_id" text;--> statement-breakpoint
ALTER TABLE "render_jobs" ADD COLUMN "depends_on_job_id" text;--> statement-breakpoint
ALTER TABLE "render_jobs" ADD COLUMN "worker_id" text;--> statement-breakpoint
ALTER TABLE "render_jobs" ADD COLUMN "worker_started_at" timestamp;--> statement-breakpoint
ALTER TABLE "render_jobs" ADD COLUMN "estimated_duration_seconds" integer;--> statement-breakpoint
ALTER TABLE "render_jobs" ADD COLUMN "estimated_memory_mb" integer;--> statement-breakpoint
ALTER TABLE "render_jobs" ADD COLUMN "actual_duration_seconds" integer;--> statement-breakpoint
ALTER TABLE "render_jobs" ADD COLUMN "actual_memory_mb" integer;--> statement-breakpoint
ALTER TABLE "render_jobs" ADD COLUMN "paused_at" timestamp;--> statement-breakpoint
ALTER TABLE "render_jobs" ADD COLUMN "paused_by_admin_id" text;--> statement-breakpoint
ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_user_did_users_did_fk" FOREIGN KEY ("user_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_user_did_users_did_fk" FOREIGN KEY ("user_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "render_batches" ADD CONSTRAINT "render_batches_user_did_users_did_fk" FOREIGN KEY ("user_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "render_presets" ADD CONSTRAINT "render_presets_user_did_users_did_fk" FOREIGN KEY ("user_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_render_quotas" ADD CONSTRAINT "user_render_quotas_user_did_users_did_fk" FOREIGN KEY ("user_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_log_user_idx" ON "notification_log" USING btree ("user_did");--> statement-breakpoint
CREATE INDEX "notification_log_type_idx" ON "notification_log" USING btree ("type");--> statement-breakpoint
CREATE INDEX "notification_log_event_idx" ON "notification_log" USING btree ("event");--> statement-breakpoint
CREATE INDEX "notification_log_created_idx" ON "notification_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "render_batches_user_idx" ON "render_batches" USING btree ("user_did");--> statement-breakpoint
CREATE INDEX "render_batches_status_idx" ON "render_batches" USING btree ("status");--> statement-breakpoint
CREATE INDEX "render_clusters_status_idx" ON "render_clusters" USING btree ("status");--> statement-breakpoint
CREATE INDEX "render_clusters_type_idx" ON "render_clusters" USING btree ("type");--> statement-breakpoint
CREATE INDEX "render_clusters_region_idx" ON "render_clusters" USING btree ("region");--> statement-breakpoint
CREATE INDEX "render_presets_user_idx" ON "render_presets" USING btree ("user_did");--> statement-breakpoint
CREATE INDEX "render_presets_system_idx" ON "render_presets" USING btree ("is_system");--> statement-breakpoint
CREATE INDEX "render_presets_default_idx" ON "render_presets" USING btree ("is_default");--> statement-breakpoint
CREATE INDEX "render_workers_status_idx" ON "render_workers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "render_workers_heartbeat_idx" ON "render_workers" USING btree ("last_heartbeat");--> statement-breakpoint
CREATE INDEX "render_jobs_priority_idx" ON "render_jobs" USING btree ("priority","priority_score");--> statement-breakpoint
CREATE INDEX "render_jobs_batch_idx" ON "render_jobs" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "render_jobs_depends_on_idx" ON "render_jobs" USING btree ("depends_on_job_id");--> statement-breakpoint
CREATE INDEX "render_jobs_worker_idx" ON "render_jobs" USING btree ("worker_id");