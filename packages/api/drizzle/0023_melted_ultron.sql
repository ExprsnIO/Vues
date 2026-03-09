CREATE TABLE "user_content_feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"user_did" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"feedback_type" text NOT NULL,
	"reason" text,
	"weight" real DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "user_feed_preferences" (
	"user_did" text PRIMARY KEY NOT NULL,
	"tag_affinities" jsonb DEFAULT '[]'::jsonb,
	"author_affinities" jsonb DEFAULT '[]'::jsonb,
	"sound_affinities" jsonb DEFAULT '[]'::jsonb,
	"negative_signals" jsonb DEFAULT '{"hiddenAuthors":[],"hiddenTags":[],"notInterestedVideos":[],"seeLessAuthors":[],"seeLessTags":[]}'::jsonb,
	"avg_watch_completion" real DEFAULT 0.5,
	"preferred_duration" jsonb,
	"peak_activity_hours" jsonb,
	"like_threshold" real DEFAULT 0.7,
	"comment_threshold" real DEFAULT 0.8,
	"total_interactions" integer DEFAULT 0,
	"total_watch_time" integer DEFAULT 0,
	"computed_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_interactions" ADD COLUMN "skip_rate" real;--> statement-breakpoint
ALTER TABLE "user_interactions" ADD COLUMN "rewatch_count" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "user_interactions" ADD COLUMN "loop_count" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "user_interactions" ADD COLUMN "interaction_quality" real;--> statement-breakpoint
ALTER TABLE "user_interactions" ADD COLUMN "session_position" integer;--> statement-breakpoint
ALTER TABLE "user_interactions" ADD COLUMN "engagement_actions" jsonb;--> statement-breakpoint
ALTER TABLE "user_interactions" ADD COLUMN "milestone" text;--> statement-breakpoint
CREATE INDEX "user_content_feedback_user_idx" ON "user_content_feedback" USING btree ("user_did");--> statement-breakpoint
CREATE INDEX "user_content_feedback_target_idx" ON "user_content_feedback" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "user_content_feedback_type_idx" ON "user_content_feedback" USING btree ("feedback_type");--> statement-breakpoint
CREATE UNIQUE INDEX "user_content_feedback_unique_idx" ON "user_content_feedback" USING btree ("user_did","target_type","target_id","feedback_type");--> statement-breakpoint
CREATE INDEX "user_content_feedback_created_idx" ON "user_content_feedback" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "user_feed_preferences_computed_idx" ON "user_feed_preferences" USING btree ("computed_at");--> statement-breakpoint
CREATE INDEX "interactions_quality_idx" ON "user_interactions" USING btree ("interaction_quality");