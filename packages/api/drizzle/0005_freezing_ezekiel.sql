CREATE TABLE "duets" (
	"uri" text PRIMARY KEY NOT NULL,
	"cid" text NOT NULL,
	"video_uri" text NOT NULL,
	"original_video_uri" text NOT NULL,
	"author_did" text NOT NULL,
	"layout" text DEFAULT 'side-by-side' NOT NULL,
	"created_at" timestamp NOT NULL,
	"indexed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "list_items" (
	"uri" text PRIMARY KEY NOT NULL,
	"cid" text NOT NULL,
	"list_uri" text NOT NULL,
	"subject_did" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"indexed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lists" (
	"uri" text PRIMARY KEY NOT NULL,
	"cid" text NOT NULL,
	"author_did" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"avatar" text,
	"purpose" text DEFAULT 'curatelist' NOT NULL,
	"member_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp NOT NULL,
	"indexed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shares" (
	"uri" text PRIMARY KEY NOT NULL,
	"cid" text NOT NULL,
	"video_uri" text NOT NULL,
	"author_did" text NOT NULL,
	"platform" text,
	"created_at" timestamp NOT NULL,
	"indexed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stitches" (
	"uri" text PRIMARY KEY NOT NULL,
	"cid" text NOT NULL,
	"video_uri" text NOT NULL,
	"original_video_uri" text NOT NULL,
	"author_did" text NOT NULL,
	"start_time" integer DEFAULT 0 NOT NULL,
	"end_time" integer NOT NULL,
	"created_at" timestamp NOT NULL,
	"indexed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"id" text PRIMARY KEY NOT NULL,
	"user_did" text NOT NULL,
	"pref_type" text NOT NULL,
	"pref_data" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "duets" ADD CONSTRAINT "duets_video_uri_videos_uri_fk" FOREIGN KEY ("video_uri") REFERENCES "public"."videos"("uri") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duets" ADD CONSTRAINT "duets_original_video_uri_videos_uri_fk" FOREIGN KEY ("original_video_uri") REFERENCES "public"."videos"("uri") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duets" ADD CONSTRAINT "duets_author_did_users_did_fk" FOREIGN KEY ("author_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_items" ADD CONSTRAINT "list_items_list_uri_lists_uri_fk" FOREIGN KEY ("list_uri") REFERENCES "public"."lists"("uri") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_items" ADD CONSTRAINT "list_items_subject_did_users_did_fk" FOREIGN KEY ("subject_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lists" ADD CONSTRAINT "lists_author_did_users_did_fk" FOREIGN KEY ("author_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_video_uri_videos_uri_fk" FOREIGN KEY ("video_uri") REFERENCES "public"."videos"("uri") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_author_did_users_did_fk" FOREIGN KEY ("author_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stitches" ADD CONSTRAINT "stitches_video_uri_videos_uri_fk" FOREIGN KEY ("video_uri") REFERENCES "public"."videos"("uri") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stitches" ADD CONSTRAINT "stitches_original_video_uri_videos_uri_fk" FOREIGN KEY ("original_video_uri") REFERENCES "public"."videos"("uri") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stitches" ADD CONSTRAINT "stitches_author_did_users_did_fk" FOREIGN KEY ("author_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_did_users_did_fk" FOREIGN KEY ("user_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "duets_video_idx" ON "duets" USING btree ("video_uri");--> statement-breakpoint
CREATE INDEX "duets_original_idx" ON "duets" USING btree ("original_video_uri");--> statement-breakpoint
CREATE INDEX "duets_author_idx" ON "duets" USING btree ("author_did");--> statement-breakpoint
CREATE INDEX "duets_created_idx" ON "duets" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "list_items_list_idx" ON "list_items" USING btree ("list_uri");--> statement-breakpoint
CREATE INDEX "list_items_subject_idx" ON "list_items" USING btree ("subject_did");--> statement-breakpoint
CREATE UNIQUE INDEX "list_items_unique_idx" ON "list_items" USING btree ("list_uri","subject_did");--> statement-breakpoint
CREATE INDEX "list_items_created_idx" ON "list_items" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "lists_author_idx" ON "lists" USING btree ("author_did");--> statement-breakpoint
CREATE INDEX "lists_purpose_idx" ON "lists" USING btree ("purpose");--> statement-breakpoint
CREATE INDEX "lists_created_idx" ON "lists" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "shares_video_idx" ON "shares" USING btree ("video_uri");--> statement-breakpoint
CREATE INDEX "shares_author_idx" ON "shares" USING btree ("author_did");--> statement-breakpoint
CREATE INDEX "shares_platform_idx" ON "shares" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "shares_created_idx" ON "shares" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "stitches_video_idx" ON "stitches" USING btree ("video_uri");--> statement-breakpoint
CREATE INDEX "stitches_original_idx" ON "stitches" USING btree ("original_video_uri");--> statement-breakpoint
CREATE INDEX "stitches_author_idx" ON "stitches" USING btree ("author_did");--> statement-breakpoint
CREATE INDEX "stitches_created_idx" ON "stitches" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "user_preferences_user_did_idx" ON "user_preferences" USING btree ("user_did");--> statement-breakpoint
CREATE INDEX "user_preferences_pref_type_idx" ON "user_preferences" USING btree ("pref_type");--> statement-breakpoint
CREATE UNIQUE INDEX "user_preferences_unique_idx" ON "user_preferences" USING btree ("user_did","pref_type");