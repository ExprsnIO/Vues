CREATE TABLE "blocks" (
	"uri" text PRIMARY KEY NOT NULL,
	"cid" text NOT NULL,
	"blocker_did" text NOT NULL,
	"blocked_did" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"indexed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookmarks" (
	"uri" text PRIMARY KEY NOT NULL,
	"cid" text NOT NULL,
	"video_uri" text NOT NULL,
	"author_did" text NOT NULL,
	"folder" text,
	"created_at" timestamp NOT NULL,
	"indexed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_participants" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"participant_did" text NOT NULL,
	"last_read_at" timestamp,
	"muted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"participant1_did" text NOT NULL,
	"participant2_did" text NOT NULL,
	"last_message_at" timestamp,
	"last_message_text" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"sender_did" text NOT NULL,
	"text" text NOT NULL,
	"reply_to_id" text,
	"embed_type" text,
	"embed_uri" text,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mutes" (
	"uri" text PRIMARY KEY NOT NULL,
	"cid" text NOT NULL,
	"muter_did" text NOT NULL,
	"muted_did" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"indexed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_subscriptions" (
	"user_did" text PRIMARY KEY NOT NULL,
	"likes" boolean DEFAULT true NOT NULL,
	"comments" boolean DEFAULT true NOT NULL,
	"follows" boolean DEFAULT true NOT NULL,
	"mentions" boolean DEFAULT true NOT NULL,
	"reposts" boolean DEFAULT true NOT NULL,
	"messages" boolean DEFAULT true NOT NULL,
	"from_following_only" boolean DEFAULT false NOT NULL,
	"push_enabled" boolean DEFAULT true NOT NULL,
	"email_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reposts" (
	"uri" text PRIMARY KEY NOT NULL,
	"cid" text NOT NULL,
	"video_uri" text NOT NULL,
	"author_did" text NOT NULL,
	"caption" text,
	"created_at" timestamp NOT NULL,
	"indexed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "repost_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "bookmark_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blocker_did_users_did_fk" FOREIGN KEY ("blocker_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blocked_did_users_did_fk" FOREIGN KEY ("blocked_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_video_uri_videos_uri_fk" FOREIGN KEY ("video_uri") REFERENCES "public"."videos"("uri") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_author_did_users_did_fk" FOREIGN KEY ("author_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_participant_did_users_did_fk" FOREIGN KEY ("participant_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_participant1_did_users_did_fk" FOREIGN KEY ("participant1_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_participant2_did_users_did_fk" FOREIGN KEY ("participant2_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_did_users_did_fk" FOREIGN KEY ("sender_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mutes" ADD CONSTRAINT "mutes_muter_did_users_did_fk" FOREIGN KEY ("muter_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mutes" ADD CONSTRAINT "mutes_muted_did_users_did_fk" FOREIGN KEY ("muted_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_subscriptions" ADD CONSTRAINT "notification_subscriptions_user_did_users_did_fk" FOREIGN KEY ("user_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reposts" ADD CONSTRAINT "reposts_video_uri_videos_uri_fk" FOREIGN KEY ("video_uri") REFERENCES "public"."videos"("uri") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reposts" ADD CONSTRAINT "reposts_author_did_users_did_fk" FOREIGN KEY ("author_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "blocks_blocker_idx" ON "blocks" USING btree ("blocker_did");--> statement-breakpoint
CREATE INDEX "blocks_blocked_idx" ON "blocks" USING btree ("blocked_did");--> statement-breakpoint
CREATE UNIQUE INDEX "blocks_unique_idx" ON "blocks" USING btree ("blocker_did","blocked_did");--> statement-breakpoint
CREATE INDEX "bookmarks_video_idx" ON "bookmarks" USING btree ("video_uri");--> statement-breakpoint
CREATE INDEX "bookmarks_author_idx" ON "bookmarks" USING btree ("author_did");--> statement-breakpoint
CREATE INDEX "bookmarks_folder_idx" ON "bookmarks" USING btree ("author_did","folder");--> statement-breakpoint
CREATE UNIQUE INDEX "bookmarks_unique_idx" ON "bookmarks" USING btree ("video_uri","author_did");--> statement-breakpoint
CREATE INDEX "bookmarks_created_idx" ON "bookmarks" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "conversation_participants_conversation_idx" ON "conversation_participants" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "conversation_participants_participant_idx" ON "conversation_participants" USING btree ("participant_did");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_participants_unique_idx" ON "conversation_participants" USING btree ("conversation_id","participant_did");--> statement-breakpoint
CREATE INDEX "conversations_participant1_idx" ON "conversations" USING btree ("participant1_did");--> statement-breakpoint
CREATE INDEX "conversations_participant2_idx" ON "conversations" USING btree ("participant2_did");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_unique_idx" ON "conversations" USING btree ("participant1_did","participant2_did");--> statement-breakpoint
CREATE INDEX "conversations_last_message_idx" ON "conversations" USING btree ("last_message_at");--> statement-breakpoint
CREATE INDEX "messages_conversation_idx" ON "messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "messages_sender_idx" ON "messages" USING btree ("sender_did");--> statement-breakpoint
CREATE INDEX "messages_created_idx" ON "messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "messages_read_idx" ON "messages" USING btree ("read_at");--> statement-breakpoint
CREATE INDEX "mutes_muter_idx" ON "mutes" USING btree ("muter_did");--> statement-breakpoint
CREATE INDEX "mutes_muted_idx" ON "mutes" USING btree ("muted_did");--> statement-breakpoint
CREATE UNIQUE INDEX "mutes_unique_idx" ON "mutes" USING btree ("muter_did","muted_did");--> statement-breakpoint
CREATE INDEX "reposts_video_idx" ON "reposts" USING btree ("video_uri");--> statement-breakpoint
CREATE INDEX "reposts_author_idx" ON "reposts" USING btree ("author_did");--> statement-breakpoint
CREATE UNIQUE INDEX "reposts_unique_idx" ON "reposts" USING btree ("video_uri","author_did");--> statement-breakpoint
CREATE INDEX "reposts_created_idx" ON "reposts" USING btree ("created_at");