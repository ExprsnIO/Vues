CREATE TABLE "notification_seen_at" (
	"user_did" text PRIMARY KEY NOT NULL,
	"seen_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_did" text NOT NULL,
	"actor_did" text NOT NULL,
	"reason" text NOT NULL,
	"reason_subject" text,
	"target_uri" text,
	"target_cid" text,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"indexed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification_seen_at" ADD CONSTRAINT "notification_seen_at_user_did_users_did_fk" FOREIGN KEY ("user_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_did_users_did_fk" FOREIGN KEY ("user_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_did_users_did_fk" FOREIGN KEY ("actor_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_user_did_idx" ON "notifications" USING btree ("user_did");--> statement-breakpoint
CREATE INDEX "notifications_actor_did_idx" ON "notifications" USING btree ("actor_did");--> statement-breakpoint
CREATE INDEX "notifications_reason_idx" ON "notifications" USING btree ("reason");--> statement-breakpoint
CREATE INDEX "notifications_is_read_idx" ON "notifications" USING btree ("is_read");--> statement-breakpoint
CREATE INDEX "notifications_created_idx" ON "notifications" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "notifications_user_read_idx" ON "notifications" USING btree ("user_did","is_read");