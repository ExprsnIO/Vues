CREATE TABLE "video_reactions" (
	"id" text PRIMARY KEY NOT NULL,
	"video_uri" text NOT NULL,
	"author_did" text NOT NULL,
	"reaction_type" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "fire_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "love_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "laugh_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "wow_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "sad_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "angry_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "video_reactions" ADD CONSTRAINT "video_reactions_video_uri_videos_uri_fk" FOREIGN KEY ("video_uri") REFERENCES "public"."videos"("uri") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_reactions" ADD CONSTRAINT "video_reactions_author_did_users_did_fk" FOREIGN KEY ("author_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "video_reactions_video_idx" ON "video_reactions" USING btree ("video_uri");--> statement-breakpoint
CREATE INDEX "video_reactions_author_idx" ON "video_reactions" USING btree ("author_did");--> statement-breakpoint
CREATE UNIQUE INDEX "video_reactions_unique_idx" ON "video_reactions" USING btree ("video_uri","author_did","reaction_type");