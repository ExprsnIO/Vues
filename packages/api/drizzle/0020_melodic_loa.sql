CREATE TABLE "organization_billing" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"subscription_tier" text DEFAULT 'free' NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"billing_email" text,
	"billing_name" text,
	"billing_address" jsonb,
	"payment_method_last4" text,
	"payment_method_brand" text,
	"current_period_start" timestamp,
	"current_period_end" timestamp,
	"status" text DEFAULT 'active' NOT NULL,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"trial_ends_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "organization_billing_organization_id_unique" UNIQUE("organization_id")
);
--> statement-breakpoint
CREATE TABLE "organization_content_queue" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"video_uri" text NOT NULL,
	"submitted_by" text NOT NULL,
	"submitted_caption" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp,
	"review_notes" text,
	"revision_notes" text,
	"priority" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_custom_data" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"data_type" text NOT NULL,
	"data" jsonb NOT NULL,
	"parent_id" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_follows" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"follower_did" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_invites" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text,
	"invited_did" text,
	"role_id" text,
	"role_name" text,
	"invited_by" text NOT NULL,
	"token" text NOT NULL,
	"message" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"accepted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_roles" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"display_name" text NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"permissions" jsonb DEFAULT '[]'::jsonb,
	"priority" integer DEFAULT 0 NOT NULL,
	"color" text,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_type_configs" (
	"id" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"description" text,
	"icon" text,
	"handle_suffix" text NOT NULL,
	"verification_required" boolean DEFAULT false NOT NULL,
	"verification_workflow" text,
	"custom_did_services" jsonb,
	"handle_validation_rules" jsonb,
	"default_roles" jsonb,
	"enabled_features" jsonb DEFAULT '[]'::jsonb,
	"disabled_features" jsonb DEFAULT '[]'::jsonb,
	"subscription_overrides" jsonb,
	"content_policies" jsonb,
	"custom_fields_schema" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization_members" ADD COLUMN "role_id" text;--> statement-breakpoint
ALTER TABLE "organization_members" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "organization_members" ADD COLUMN "can_publish_on_behalf" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "handle" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "display_name" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "bio" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "banner_image" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "location" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "social_links" jsonb;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "is_public" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "follower_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "video_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "require_content_approval" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "custom_fields" jsonb;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "verification_status" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "verification_submitted_at" timestamp;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "verification_completed_at" timestamp;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "verification_notes" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "verification_documents" jsonb;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "editor" jsonb;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "published_as_org_id" text;--> statement-breakpoint
ALTER TABLE "organization_billing" ADD CONSTRAINT "organization_billing_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_content_queue" ADD CONSTRAINT "organization_content_queue_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_content_queue" ADD CONSTRAINT "organization_content_queue_video_uri_videos_uri_fk" FOREIGN KEY ("video_uri") REFERENCES "public"."videos"("uri") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_content_queue" ADD CONSTRAINT "organization_content_queue_submitted_by_users_did_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("did") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_content_queue" ADD CONSTRAINT "organization_content_queue_reviewed_by_users_did_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("did") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_custom_data" ADD CONSTRAINT "organization_custom_data_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_follows" ADD CONSTRAINT "organization_follows_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_follows" ADD CONSTRAINT "organization_follows_follower_did_users_did_fk" FOREIGN KEY ("follower_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_invites" ADD CONSTRAINT "organization_invites_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_invites" ADD CONSTRAINT "organization_invites_invited_did_users_did_fk" FOREIGN KEY ("invited_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_invites" ADD CONSTRAINT "organization_invites_role_id_organization_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."organization_roles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_invites" ADD CONSTRAINT "organization_invites_invited_by_users_did_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("did") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_roles" ADD CONSTRAINT "organization_roles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "org_billing_stripe_customer_idx" ON "organization_billing" USING btree ("stripe_customer_id");--> statement-breakpoint
CREATE INDEX "org_billing_tier_idx" ON "organization_billing" USING btree ("subscription_tier");--> statement-breakpoint
CREATE INDEX "org_billing_status_idx" ON "organization_billing" USING btree ("status");--> statement-breakpoint
CREATE INDEX "org_content_queue_org_idx" ON "organization_content_queue" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "org_content_queue_status_idx" ON "organization_content_queue" USING btree ("status");--> statement-breakpoint
CREATE INDEX "org_content_queue_submitted_by_idx" ON "organization_content_queue" USING btree ("submitted_by");--> statement-breakpoint
CREATE INDEX "org_content_queue_priority_idx" ON "organization_content_queue" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "org_content_queue_created_idx" ON "organization_content_queue" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "org_custom_data_org_idx" ON "organization_custom_data" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "org_custom_data_type_idx" ON "organization_custom_data" USING btree ("data_type");--> statement-breakpoint
CREATE INDEX "org_custom_data_parent_idx" ON "organization_custom_data" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "org_custom_data_status_idx" ON "organization_custom_data" USING btree ("status");--> statement-breakpoint
CREATE INDEX "org_custom_data_org_type_idx" ON "organization_custom_data" USING btree ("organization_id","data_type");--> statement-breakpoint
CREATE INDEX "org_follows_org_idx" ON "organization_follows" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "org_follows_follower_idx" ON "organization_follows" USING btree ("follower_did");--> statement-breakpoint
CREATE UNIQUE INDEX "org_follows_unique_idx" ON "organization_follows" USING btree ("organization_id","follower_did");--> statement-breakpoint
CREATE INDEX "org_invites_org_idx" ON "organization_invites" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "org_invites_email_idx" ON "organization_invites" USING btree ("email");--> statement-breakpoint
CREATE INDEX "org_invites_invited_did_idx" ON "organization_invites" USING btree ("invited_did");--> statement-breakpoint
CREATE UNIQUE INDEX "org_invites_token_idx" ON "organization_invites" USING btree ("token");--> statement-breakpoint
CREATE INDEX "org_invites_status_idx" ON "organization_invites" USING btree ("status");--> statement-breakpoint
CREATE INDEX "org_roles_org_idx" ON "organization_roles" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "org_roles_unique_idx" ON "organization_roles" USING btree ("organization_id","name");--> statement-breakpoint
CREATE INDEX "org_type_configs_active_idx" ON "organization_type_configs" USING btree ("is_active");--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_role_id_organization_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."organization_roles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "org_members_role_id_idx" ON "organization_members" USING btree ("role_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_handle_idx" ON "organizations" USING btree ("handle");--> statement-breakpoint
CREATE INDEX "organizations_public_idx" ON "organizations" USING btree ("is_public");--> statement-breakpoint
CREATE INDEX "organizations_verification_status_idx" ON "organizations" USING btree ("verification_status");--> statement-breakpoint
CREATE INDEX "videos_published_as_org_idx" ON "videos" USING btree ("published_as_org_id");--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_handle_unique" UNIQUE("handle");