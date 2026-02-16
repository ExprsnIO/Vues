CREATE TABLE "actor_repos" (
	"did" text PRIMARY KEY NOT NULL,
	"handle" text NOT NULL,
	"email" text,
	"password_hash" text,
	"signing_key_public" text NOT NULL,
	"signing_key_private" text NOT NULL,
	"root_cid" text,
	"rev" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blobs" (
	"cid" text PRIMARY KEY NOT NULL,
	"did" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" integer NOT NULL,
	"storage_path" text NOT NULL,
	"temp_path" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"uri" text PRIMARY KEY NOT NULL,
	"cid" text NOT NULL,
	"video_uri" text NOT NULL,
	"parent_uri" text,
	"author_did" text NOT NULL,
	"text" text NOT NULL,
	"like_count" integer DEFAULT 0 NOT NULL,
	"reply_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp NOT NULL,
	"indexed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "follows" (
	"uri" text PRIMARY KEY NOT NULL,
	"cid" text NOT NULL,
	"follower_did" text NOT NULL,
	"followee_did" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"indexed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "likes" (
	"uri" text PRIMARY KEY NOT NULL,
	"cid" text NOT NULL,
	"video_uri" text NOT NULL,
	"author_did" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"indexed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repo_blocks" (
	"cid" text PRIMARY KEY NOT NULL,
	"did" text NOT NULL,
	"content" text NOT NULL,
	"referenced_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repo_commits" (
	"cid" text PRIMARY KEY NOT NULL,
	"did" text NOT NULL,
	"rev" text NOT NULL,
	"data" text NOT NULL,
	"prev" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repo_records" (
	"uri" text PRIMARY KEY NOT NULL,
	"cid" text NOT NULL,
	"did" text NOT NULL,
	"collection" text NOT NULL,
	"rkey" text NOT NULL,
	"record" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"indexed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"did" text NOT NULL,
	"access_jwt" text NOT NULL,
	"refresh_jwt" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sounds" (
	"id" text PRIMARY KEY NOT NULL,
	"original_video_uri" text,
	"title" text NOT NULL,
	"artist" text,
	"duration" integer,
	"audio_url" text,
	"cover_url" text,
	"use_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trending_videos" (
	"video_uri" text PRIMARY KEY NOT NULL,
	"score" real NOT NULL,
	"velocity" real DEFAULT 0 NOT NULL,
	"rank" integer NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "upload_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_did" text NOT NULL,
	"status" text NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"input_key" text,
	"cdn_url" text,
	"hls_playlist" text,
	"thumbnail_url" text,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_interactions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_did" text NOT NULL,
	"video_uri" text NOT NULL,
	"interaction_type" text NOT NULL,
	"watch_duration" integer,
	"completion_rate" real,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"user_did" text PRIMARY KEY NOT NULL,
	"theme_id" text DEFAULT 'slate' NOT NULL,
	"color_mode" text DEFAULT 'dark' NOT NULL,
	"accessibility" jsonb,
	"playback" jsonb,
	"notifications" jsonb,
	"privacy" jsonb,
	"content" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"did" text PRIMARY KEY NOT NULL,
	"handle" text NOT NULL,
	"display_name" text,
	"avatar" text,
	"bio" text,
	"follower_count" integer DEFAULT 0 NOT NULL,
	"following_count" integer DEFAULT 0 NOT NULL,
	"video_count" integer DEFAULT 0 NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"indexed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "video_embeddings" (
	"video_uri" text PRIMARY KEY NOT NULL,
	"embedding" jsonb NOT NULL,
	"model" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "videos" (
	"uri" text PRIMARY KEY NOT NULL,
	"cid" text NOT NULL,
	"author_did" text NOT NULL,
	"caption" text,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sound_uri" text,
	"cdn_url" text,
	"hls_playlist" text,
	"thumbnail_url" text,
	"duration" integer,
	"aspect_ratio" jsonb,
	"visibility" text DEFAULT 'public' NOT NULL,
	"allow_duet" boolean DEFAULT true NOT NULL,
	"allow_stitch" boolean DEFAULT true NOT NULL,
	"allow_comments" boolean DEFAULT true NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"like_count" integer DEFAULT 0 NOT NULL,
	"comment_count" integer DEFAULT 0 NOT NULL,
	"share_count" integer DEFAULT 0 NOT NULL,
	"indexed_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "blobs" ADD CONSTRAINT "blobs_did_actor_repos_did_fk" FOREIGN KEY ("did") REFERENCES "public"."actor_repos"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_video_uri_videos_uri_fk" FOREIGN KEY ("video_uri") REFERENCES "public"."videos"("uri") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_did_users_did_fk" FOREIGN KEY ("author_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_follower_did_users_did_fk" FOREIGN KEY ("follower_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_followee_did_users_did_fk" FOREIGN KEY ("followee_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "likes" ADD CONSTRAINT "likes_video_uri_videos_uri_fk" FOREIGN KEY ("video_uri") REFERENCES "public"."videos"("uri") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "likes" ADD CONSTRAINT "likes_author_did_users_did_fk" FOREIGN KEY ("author_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repo_blocks" ADD CONSTRAINT "repo_blocks_did_actor_repos_did_fk" FOREIGN KEY ("did") REFERENCES "public"."actor_repos"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repo_commits" ADD CONSTRAINT "repo_commits_did_actor_repos_did_fk" FOREIGN KEY ("did") REFERENCES "public"."actor_repos"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repo_records" ADD CONSTRAINT "repo_records_did_actor_repos_did_fk" FOREIGN KEY ("did") REFERENCES "public"."actor_repos"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_did_actor_repos_did_fk" FOREIGN KEY ("did") REFERENCES "public"."actor_repos"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trending_videos" ADD CONSTRAINT "trending_videos_video_uri_videos_uri_fk" FOREIGN KEY ("video_uri") REFERENCES "public"."videos"("uri") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_did_users_did_fk" FOREIGN KEY ("user_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_embeddings" ADD CONSTRAINT "video_embeddings_video_uri_videos_uri_fk" FOREIGN KEY ("video_uri") REFERENCES "public"."videos"("uri") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_author_did_users_did_fk" FOREIGN KEY ("author_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "actor_repos_handle_idx" ON "actor_repos" USING btree ("handle");--> statement-breakpoint
CREATE INDEX "actor_repos_email_idx" ON "actor_repos" USING btree ("email");--> statement-breakpoint
CREATE INDEX "actor_repos_status_idx" ON "actor_repos" USING btree ("status");--> statement-breakpoint
CREATE INDEX "blobs_did_idx" ON "blobs" USING btree ("did");--> statement-breakpoint
CREATE INDEX "blobs_mime_type_idx" ON "blobs" USING btree ("mime_type");--> statement-breakpoint
CREATE INDEX "comments_video_idx" ON "comments" USING btree ("video_uri");--> statement-breakpoint
CREATE INDEX "comments_parent_idx" ON "comments" USING btree ("parent_uri");--> statement-breakpoint
CREATE INDEX "comments_author_idx" ON "comments" USING btree ("author_did");--> statement-breakpoint
CREATE INDEX "comments_created_idx" ON "comments" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "follows_follower_idx" ON "follows" USING btree ("follower_did");--> statement-breakpoint
CREATE INDEX "follows_followee_idx" ON "follows" USING btree ("followee_did");--> statement-breakpoint
CREATE UNIQUE INDEX "follows_unique_idx" ON "follows" USING btree ("follower_did","followee_did");--> statement-breakpoint
CREATE INDEX "likes_video_idx" ON "likes" USING btree ("video_uri");--> statement-breakpoint
CREATE INDEX "likes_author_idx" ON "likes" USING btree ("author_did");--> statement-breakpoint
CREATE UNIQUE INDEX "likes_unique_idx" ON "likes" USING btree ("video_uri","author_did");--> statement-breakpoint
CREATE INDEX "repo_blocks_did_idx" ON "repo_blocks" USING btree ("did");--> statement-breakpoint
CREATE INDEX "repo_commits_did_idx" ON "repo_commits" USING btree ("did");--> statement-breakpoint
CREATE INDEX "repo_commits_rev_idx" ON "repo_commits" USING btree ("rev");--> statement-breakpoint
CREATE INDEX "repo_records_did_collection_idx" ON "repo_records" USING btree ("did","collection");--> statement-breakpoint
CREATE INDEX "repo_records_collection_idx" ON "repo_records" USING btree ("collection");--> statement-breakpoint
CREATE INDEX "repo_records_rkey_idx" ON "repo_records" USING btree ("rkey");--> statement-breakpoint
CREATE INDEX "sessions_did_idx" ON "sessions" USING btree ("did");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_access_jwt_idx" ON "sessions" USING btree ("access_jwt");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_refresh_jwt_idx" ON "sessions" USING btree ("refresh_jwt");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "sounds_use_count_idx" ON "sounds" USING btree ("use_count");--> statement-breakpoint
CREATE INDEX "sounds_title_idx" ON "sounds" USING btree ("title");--> statement-breakpoint
CREATE INDEX "trending_score_idx" ON "trending_videos" USING btree ("score");--> statement-breakpoint
CREATE INDEX "trending_rank_idx" ON "trending_videos" USING btree ("rank");--> statement-breakpoint
CREATE INDEX "upload_jobs_user_idx" ON "upload_jobs" USING btree ("user_did");--> statement-breakpoint
CREATE INDEX "upload_jobs_status_idx" ON "upload_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "interactions_user_idx" ON "user_interactions" USING btree ("user_did");--> statement-breakpoint
CREATE INDEX "interactions_video_idx" ON "user_interactions" USING btree ("video_uri");--> statement-breakpoint
CREATE INDEX "interactions_type_idx" ON "user_interactions" USING btree ("interaction_type");--> statement-breakpoint
CREATE INDEX "interactions_created_idx" ON "user_interactions" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_handle_idx" ON "users" USING btree ("handle");--> statement-breakpoint
CREATE INDEX "users_updated_at_idx" ON "users" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "videos_author_idx" ON "videos" USING btree ("author_did");--> statement-breakpoint
CREATE INDEX "videos_created_idx" ON "videos" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "videos_sound_idx" ON "videos" USING btree ("sound_uri");--> statement-breakpoint
CREATE INDEX "videos_visibility_idx" ON "videos" USING btree ("visibility");