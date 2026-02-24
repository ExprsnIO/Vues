CREATE TABLE "challenge_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"challenge_id" text NOT NULL,
	"video_uri" text NOT NULL,
	"user_did" text NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"like_count" integer DEFAULT 0 NOT NULL,
	"comment_count" integer DEFAULT 0 NOT NULL,
	"share_count" integer DEFAULT 0 NOT NULL,
	"engagement_score" real DEFAULT 0 NOT NULL,
	"rank" integer,
	"is_featured" boolean DEFAULT false NOT NULL,
	"is_winner" boolean DEFAULT false NOT NULL,
	"winner_position" integer,
	"submitted_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "challenge_participation" (
	"id" text PRIMARY KEY NOT NULL,
	"challenge_id" text NOT NULL,
	"user_did" text NOT NULL,
	"entry_count" integer DEFAULT 1 NOT NULL,
	"best_rank" integer,
	"is_winner" boolean DEFAULT false NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "challenges" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"hashtag" text NOT NULL,
	"rules" text,
	"cover_image_url" text,
	"banner_image_url" text,
	"prizes" jsonb,
	"status" text DEFAULT 'upcoming' NOT NULL,
	"visibility" text DEFAULT 'public' NOT NULL,
	"entry_count" integer DEFAULT 0 NOT NULL,
	"participant_count" integer DEFAULT 0 NOT NULL,
	"total_views" integer DEFAULT 0 NOT NULL,
	"total_engagement" integer DEFAULT 0 NOT NULL,
	"start_at" timestamp NOT NULL,
	"end_at" timestamp NOT NULL,
	"voting_end_at" timestamp,
	"created_by" text NOT NULL,
	"featured_sound_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sound_usage_history" (
	"id" text PRIMARY KEY NOT NULL,
	"sound_id" text NOT NULL,
	"video_uri" text NOT NULL,
	"user_did" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trending_sounds" (
	"sound_id" text PRIMARY KEY NOT NULL,
	"score" real NOT NULL,
	"velocity" real DEFAULT 0 NOT NULL,
	"rank" integer NOT NULL,
	"recent_use_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "watch_parties" (
	"id" text PRIMARY KEY NOT NULL,
	"host_did" text NOT NULL,
	"name" text NOT NULL,
	"invite_code" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"max_participants" integer DEFAULT 10 NOT NULL,
	"participant_count" integer DEFAULT 1 NOT NULL,
	"current_video_uri" text,
	"current_position" integer DEFAULT 0 NOT NULL,
	"is_playing" boolean DEFAULT false NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"chat_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"ended_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "watch_party_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"party_id" text NOT NULL,
	"sender_did" text NOT NULL,
	"text" text NOT NULL,
	"message_type" text DEFAULT 'text' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "watch_party_participants" (
	"id" text PRIMARY KEY NOT NULL,
	"party_id" text NOT NULL,
	"user_did" text NOT NULL,
	"role" text DEFAULT 'viewer' NOT NULL,
	"is_present" boolean DEFAULT true NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	"left_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "watch_party_queue" (
	"id" text PRIMARY KEY NOT NULL,
	"party_id" text NOT NULL,
	"video_uri" text NOT NULL,
	"added_by" text NOT NULL,
	"position" integer NOT NULL,
	"played_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "challenge_entries" ADD CONSTRAINT "challenge_entries_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_entries" ADD CONSTRAINT "challenge_entries_video_uri_videos_uri_fk" FOREIGN KEY ("video_uri") REFERENCES "public"."videos"("uri") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_entries" ADD CONSTRAINT "challenge_entries_user_did_users_did_fk" FOREIGN KEY ("user_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_participation" ADD CONSTRAINT "challenge_participation_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_participation" ADD CONSTRAINT "challenge_participation_user_did_users_did_fk" FOREIGN KEY ("user_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_created_by_admin_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_featured_sound_id_sounds_id_fk" FOREIGN KEY ("featured_sound_id") REFERENCES "public"."sounds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sound_usage_history" ADD CONSTRAINT "sound_usage_history_sound_id_sounds_id_fk" FOREIGN KEY ("sound_id") REFERENCES "public"."sounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sound_usage_history" ADD CONSTRAINT "sound_usage_history_video_uri_videos_uri_fk" FOREIGN KEY ("video_uri") REFERENCES "public"."videos"("uri") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sound_usage_history" ADD CONSTRAINT "sound_usage_history_user_did_users_did_fk" FOREIGN KEY ("user_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trending_sounds" ADD CONSTRAINT "trending_sounds_sound_id_sounds_id_fk" FOREIGN KEY ("sound_id") REFERENCES "public"."sounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watch_parties" ADD CONSTRAINT "watch_parties_host_did_users_did_fk" FOREIGN KEY ("host_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watch_parties" ADD CONSTRAINT "watch_parties_current_video_uri_videos_uri_fk" FOREIGN KEY ("current_video_uri") REFERENCES "public"."videos"("uri") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watch_party_messages" ADD CONSTRAINT "watch_party_messages_party_id_watch_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."watch_parties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watch_party_messages" ADD CONSTRAINT "watch_party_messages_sender_did_users_did_fk" FOREIGN KEY ("sender_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watch_party_participants" ADD CONSTRAINT "watch_party_participants_party_id_watch_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."watch_parties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watch_party_participants" ADD CONSTRAINT "watch_party_participants_user_did_users_did_fk" FOREIGN KEY ("user_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watch_party_queue" ADD CONSTRAINT "watch_party_queue_party_id_watch_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."watch_parties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watch_party_queue" ADD CONSTRAINT "watch_party_queue_video_uri_videos_uri_fk" FOREIGN KEY ("video_uri") REFERENCES "public"."videos"("uri") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watch_party_queue" ADD CONSTRAINT "watch_party_queue_added_by_users_did_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("did") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "challenge_entries_challenge_idx" ON "challenge_entries" USING btree ("challenge_id");--> statement-breakpoint
CREATE UNIQUE INDEX "challenge_entries_video_idx" ON "challenge_entries" USING btree ("video_uri");--> statement-breakpoint
CREATE INDEX "challenge_entries_user_idx" ON "challenge_entries" USING btree ("user_did");--> statement-breakpoint
CREATE INDEX "challenge_entries_score_idx" ON "challenge_entries" USING btree ("challenge_id","engagement_score");--> statement-breakpoint
CREATE INDEX "challenge_entries_rank_idx" ON "challenge_entries" USING btree ("challenge_id","rank");--> statement-breakpoint
CREATE INDEX "challenge_entries_featured_idx" ON "challenge_entries" USING btree ("challenge_id","is_featured");--> statement-breakpoint
CREATE INDEX "challenge_entries_winner_idx" ON "challenge_entries" USING btree ("challenge_id","is_winner");--> statement-breakpoint
CREATE INDEX "challenge_participation_challenge_idx" ON "challenge_participation" USING btree ("challenge_id");--> statement-breakpoint
CREATE INDEX "challenge_participation_user_idx" ON "challenge_participation" USING btree ("user_did");--> statement-breakpoint
CREATE UNIQUE INDEX "challenge_participation_unique_idx" ON "challenge_participation" USING btree ("challenge_id","user_did");--> statement-breakpoint
CREATE INDEX "challenge_participation_winner_idx" ON "challenge_participation" USING btree ("user_did","is_winner");--> statement-breakpoint
CREATE UNIQUE INDEX "challenges_hashtag_idx" ON "challenges" USING btree ("hashtag");--> statement-breakpoint
CREATE INDEX "challenges_status_idx" ON "challenges" USING btree ("status");--> statement-breakpoint
CREATE INDEX "challenges_start_at_idx" ON "challenges" USING btree ("start_at");--> statement-breakpoint
CREATE INDEX "challenges_end_at_idx" ON "challenges" USING btree ("end_at");--> statement-breakpoint
CREATE INDEX "challenges_created_idx" ON "challenges" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "sound_usage_history_sound_idx" ON "sound_usage_history" USING btree ("sound_id");--> statement-breakpoint
CREATE INDEX "sound_usage_history_created_idx" ON "sound_usage_history" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "sound_usage_history_sound_created_idx" ON "sound_usage_history" USING btree ("sound_id","created_at");--> statement-breakpoint
CREATE INDEX "trending_sounds_score_idx" ON "trending_sounds" USING btree ("score");--> statement-breakpoint
CREATE INDEX "trending_sounds_rank_idx" ON "trending_sounds" USING btree ("rank");--> statement-breakpoint
CREATE INDEX "trending_sounds_velocity_idx" ON "trending_sounds" USING btree ("velocity");--> statement-breakpoint
CREATE INDEX "watch_parties_host_idx" ON "watch_parties" USING btree ("host_did");--> statement-breakpoint
CREATE UNIQUE INDEX "watch_parties_invite_code_idx" ON "watch_parties" USING btree ("invite_code");--> statement-breakpoint
CREATE INDEX "watch_parties_status_idx" ON "watch_parties" USING btree ("status");--> statement-breakpoint
CREATE INDEX "watch_parties_created_idx" ON "watch_parties" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "watch_party_messages_party_idx" ON "watch_party_messages" USING btree ("party_id");--> statement-breakpoint
CREATE INDEX "watch_party_messages_created_idx" ON "watch_party_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "watch_party_messages_party_created_idx" ON "watch_party_messages" USING btree ("party_id","created_at");--> statement-breakpoint
CREATE INDEX "watch_party_participants_party_idx" ON "watch_party_participants" USING btree ("party_id");--> statement-breakpoint
CREATE INDEX "watch_party_participants_user_idx" ON "watch_party_participants" USING btree ("user_did");--> statement-breakpoint
CREATE UNIQUE INDEX "watch_party_participants_unique_idx" ON "watch_party_participants" USING btree ("party_id","user_did");--> statement-breakpoint
CREATE INDEX "watch_party_queue_party_idx" ON "watch_party_queue" USING btree ("party_id");--> statement-breakpoint
CREATE INDEX "watch_party_queue_position_idx" ON "watch_party_queue" USING btree ("party_id","position");