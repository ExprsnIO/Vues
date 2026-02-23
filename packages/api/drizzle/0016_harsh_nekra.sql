CREATE TABLE "editor_assets" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_did" text NOT NULL,
	"project_id" text,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"mime_type" text,
	"storage_key" text NOT NULL,
	"cdn_url" text,
	"thumbnail_url" text,
	"width" integer,
	"height" integer,
	"duration" real,
	"frame_rate" real,
	"file_size" integer,
	"waveform_data" jsonb,
	"bpm" real,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"metadata" jsonb,
	"processing_status" text DEFAULT 'pending',
	"proxy_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "editor_clips" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"track_id" text NOT NULL,
	"asset_id" text,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"start_frame" integer DEFAULT 0 NOT NULL,
	"end_frame" integer DEFAULT 150 NOT NULL,
	"source_start" integer DEFAULT 0,
	"source_end" integer,
	"speed" real DEFAULT 1,
	"reverse" boolean DEFAULT false,
	"loop" boolean DEFAULT false,
	"loop_count" integer,
	"transform" jsonb,
	"volume" real DEFAULT 1,
	"fade_in" integer DEFAULT 0,
	"fade_out" integer DEFAULT 0,
	"text_content" text,
	"text_style" jsonb,
	"shape_type" text,
	"shape_style" jsonb,
	"solid_color" text,
	"effects" jsonb,
	"keyframes" jsonb,
	"blend_mode" text DEFAULT 'normal',
	"locked" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "editor_effect_presets" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_did" text,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"type" text NOT NULL,
	"is_built_in" boolean DEFAULT false,
	"is_public" boolean DEFAULT false,
	"params" jsonb NOT NULL,
	"thumbnail" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "editor_project_history" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"user_did" text NOT NULL,
	"action" text NOT NULL,
	"description" text,
	"undo_data" jsonb NOT NULL,
	"redo_data" jsonb NOT NULL,
	"batch_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "editor_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_did" text,
	"name" text NOT NULL,
	"description" text,
	"category" text NOT NULL,
	"aspect_ratio" text NOT NULL,
	"duration" integer NOT NULL,
	"template_data" jsonb NOT NULL,
	"thumbnail_url" text,
	"preview_video_url" text,
	"is_built_in" boolean DEFAULT false,
	"is_public" boolean DEFAULT false,
	"usage_count" integer DEFAULT 0,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "editor_tracks" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"locked" boolean DEFAULT false,
	"muted" boolean DEFAULT false,
	"solo" boolean DEFAULT false,
	"visible" boolean DEFAULT true,
	"height" integer DEFAULT 60,
	"color" text,
	"volume" real DEFAULT 1,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "editor_transitions" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"track_id" text NOT NULL,
	"clip_a_id" text NOT NULL,
	"clip_b_id" text NOT NULL,
	"type" text NOT NULL,
	"duration" integer DEFAULT 30 NOT NULL,
	"easing" text DEFAULT 'ease-in-out',
	"params" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "editor_assets" ADD CONSTRAINT "editor_assets_owner_did_users_did_fk" FOREIGN KEY ("owner_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editor_assets" ADD CONSTRAINT "editor_assets_project_id_editor_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."editor_projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editor_clips" ADD CONSTRAINT "editor_clips_project_id_editor_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."editor_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editor_clips" ADD CONSTRAINT "editor_clips_track_id_editor_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."editor_tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editor_effect_presets" ADD CONSTRAINT "editor_effect_presets_owner_did_users_did_fk" FOREIGN KEY ("owner_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editor_project_history" ADD CONSTRAINT "editor_project_history_project_id_editor_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."editor_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editor_project_history" ADD CONSTRAINT "editor_project_history_user_did_users_did_fk" FOREIGN KEY ("user_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editor_templates" ADD CONSTRAINT "editor_templates_owner_did_users_did_fk" FOREIGN KEY ("owner_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editor_tracks" ADD CONSTRAINT "editor_tracks_project_id_editor_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."editor_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editor_transitions" ADD CONSTRAINT "editor_transitions_project_id_editor_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."editor_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editor_transitions" ADD CONSTRAINT "editor_transitions_track_id_editor_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."editor_tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editor_transitions" ADD CONSTRAINT "editor_transitions_clip_a_id_editor_clips_id_fk" FOREIGN KEY ("clip_a_id") REFERENCES "public"."editor_clips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editor_transitions" ADD CONSTRAINT "editor_transitions_clip_b_id_editor_clips_id_fk" FOREIGN KEY ("clip_b_id") REFERENCES "public"."editor_clips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "editor_assets_owner_idx" ON "editor_assets" USING btree ("owner_did");--> statement-breakpoint
CREATE INDEX "editor_assets_project_idx" ON "editor_assets" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "editor_assets_type_idx" ON "editor_assets" USING btree ("type");--> statement-breakpoint
CREATE INDEX "editor_assets_status_idx" ON "editor_assets" USING btree ("processing_status");--> statement-breakpoint
CREATE INDEX "editor_clips_project_idx" ON "editor_clips" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "editor_clips_track_idx" ON "editor_clips" USING btree ("track_id");--> statement-breakpoint
CREATE INDEX "editor_clips_timeline_idx" ON "editor_clips" USING btree ("track_id","start_frame");--> statement-breakpoint
CREATE INDEX "editor_effect_presets_owner_idx" ON "editor_effect_presets" USING btree ("owner_did");--> statement-breakpoint
CREATE INDEX "editor_effect_presets_category_idx" ON "editor_effect_presets" USING btree ("category");--> statement-breakpoint
CREATE INDEX "editor_effect_presets_public_idx" ON "editor_effect_presets" USING btree ("is_public");--> statement-breakpoint
CREATE INDEX "editor_history_project_idx" ON "editor_project_history" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "editor_history_user_idx" ON "editor_project_history" USING btree ("user_did");--> statement-breakpoint
CREATE INDEX "editor_history_batch_idx" ON "editor_project_history" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "editor_history_created_idx" ON "editor_project_history" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "editor_templates_owner_idx" ON "editor_templates" USING btree ("owner_did");--> statement-breakpoint
CREATE INDEX "editor_templates_category_idx" ON "editor_templates" USING btree ("category");--> statement-breakpoint
CREATE INDEX "editor_templates_public_idx" ON "editor_templates" USING btree ("is_public");--> statement-breakpoint
CREATE INDEX "editor_templates_usage_idx" ON "editor_templates" USING btree ("usage_count");--> statement-breakpoint
CREATE INDEX "editor_tracks_project_idx" ON "editor_tracks" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "editor_tracks_order_idx" ON "editor_tracks" USING btree ("project_id","order");--> statement-breakpoint
CREATE INDEX "editor_transitions_project_idx" ON "editor_transitions" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "editor_transitions_track_idx" ON "editor_transitions" USING btree ("track_id");