CREATE TABLE "render_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"user_did" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"progress" integer DEFAULT 0,
	"current_step" text,
	"format" text DEFAULT 'mp4' NOT NULL,
	"quality" text DEFAULT 'high' NOT NULL,
	"resolution" jsonb,
	"fps" integer DEFAULT 30,
	"output_key" text,
	"output_url" text,
	"output_size" integer,
	"duration" integer,
	"error_message" text,
	"error_details" jsonb,
	"render_started_at" timestamp,
	"render_completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduled_publishing" (
	"id" text PRIMARY KEY NOT NULL,
	"user_did" text NOT NULL,
	"render_job_id" text,
	"upload_job_id" text,
	"caption" text,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"thumbnail_url" text,
	"custom_thumbnail_key" text,
	"visibility" text DEFAULT 'public' NOT NULL,
	"allow_comments" boolean DEFAULT true,
	"allow_duet" boolean DEFAULT true,
	"allow_stitch" boolean DEFAULT true,
	"sound_uri" text,
	"sound_title" text,
	"scheduled_for" timestamp,
	"timezone" text DEFAULT 'UTC',
	"status" text DEFAULT 'draft' NOT NULL,
	"published_video_uri" text,
	"error_message" text,
	"published_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "render_jobs" ADD CONSTRAINT "render_jobs_project_id_editor_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."editor_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "render_jobs" ADD CONSTRAINT "render_jobs_user_did_users_did_fk" FOREIGN KEY ("user_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_publishing" ADD CONSTRAINT "scheduled_publishing_user_did_users_did_fk" FOREIGN KEY ("user_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_publishing" ADD CONSTRAINT "scheduled_publishing_render_job_id_render_jobs_id_fk" FOREIGN KEY ("render_job_id") REFERENCES "public"."render_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "render_jobs_project_idx" ON "render_jobs" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "render_jobs_user_idx" ON "render_jobs" USING btree ("user_did");--> statement-breakpoint
CREATE INDEX "render_jobs_status_idx" ON "render_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "render_jobs_created_idx" ON "render_jobs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "scheduled_publishing_user_idx" ON "scheduled_publishing" USING btree ("user_did");--> statement-breakpoint
CREATE INDEX "scheduled_publishing_status_idx" ON "scheduled_publishing" USING btree ("status");--> statement-breakpoint
CREATE INDEX "scheduled_publishing_scheduled_idx" ON "scheduled_publishing" USING btree ("scheduled_for");--> statement-breakpoint
CREATE INDEX "scheduled_publishing_render_job_idx" ON "scheduled_publishing" USING btree ("render_job_id");