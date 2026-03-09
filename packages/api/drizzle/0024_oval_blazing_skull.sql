CREATE TABLE "creator_fund_eligibility" (
	"user_did" text PRIMARY KEY NOT NULL,
	"is_eligible" boolean DEFAULT false NOT NULL,
	"enrolled_at" timestamp,
	"min_followers" integer DEFAULT 1000 NOT NULL,
	"min_views" integer DEFAULT 10000 NOT NULL,
	"current_followers" integer DEFAULT 0 NOT NULL,
	"current_monthly_views" integer DEFAULT 0 NOT NULL,
	"last_checked_at" timestamp,
	"rejection_reason" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creator_fund_payouts" (
	"id" text PRIMARY KEY NOT NULL,
	"creator_did" text NOT NULL,
	"period" text NOT NULL,
	"view_count" integer NOT NULL,
	"engagement_score" real NOT NULL,
	"pool_share" real NOT NULL,
	"amount" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"paid_at" timestamp,
	"transaction_id" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creator_subscription_tiers" (
	"id" text PRIMARY KEY NOT NULL,
	"creator_did" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price" integer NOT NULL,
	"benefits" jsonb,
	"max_subscribers" integer,
	"current_subscribers" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creator_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"subscriber_did" text NOT NULL,
	"creator_did" text NOT NULL,
	"tier_id" text NOT NULL,
	"status" text NOT NULL,
	"current_period_start" timestamp NOT NULL,
	"current_period_end" timestamp NOT NULL,
	"cancelled_at" timestamp,
	"stripe_subscription_id" text,
	"stripe_customer_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "service_registry" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "service_registry" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "creator_fund_eligibility" ADD CONSTRAINT "creator_fund_eligibility_user_did_users_did_fk" FOREIGN KEY ("user_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_fund_payouts" ADD CONSTRAINT "creator_fund_payouts_creator_did_users_did_fk" FOREIGN KEY ("creator_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_subscription_tiers" ADD CONSTRAINT "creator_subscription_tiers_creator_did_users_did_fk" FOREIGN KEY ("creator_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_subscriptions" ADD CONSTRAINT "creator_subscriptions_subscriber_did_users_did_fk" FOREIGN KEY ("subscriber_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_subscriptions" ADD CONSTRAINT "creator_subscriptions_creator_did_users_did_fk" FOREIGN KEY ("creator_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_subscriptions" ADD CONSTRAINT "creator_subscriptions_tier_id_creator_subscription_tiers_id_fk" FOREIGN KEY ("tier_id") REFERENCES "public"."creator_subscription_tiers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "creator_fund_elig_idx" ON "creator_fund_eligibility" USING btree ("is_eligible");--> statement-breakpoint
CREATE INDEX "creator_fund_creator_idx" ON "creator_fund_payouts" USING btree ("creator_did");--> statement-breakpoint
CREATE INDEX "creator_fund_period_idx" ON "creator_fund_payouts" USING btree ("period");--> statement-breakpoint
CREATE INDEX "creator_fund_status_idx" ON "creator_fund_payouts" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "creator_fund_unique_idx" ON "creator_fund_payouts" USING btree ("creator_did","period");--> statement-breakpoint
CREATE INDEX "creator_sub_tiers_creator_idx" ON "creator_subscription_tiers" USING btree ("creator_did");--> statement-breakpoint
CREATE INDEX "creator_sub_tiers_active_idx" ON "creator_subscription_tiers" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "creator_subs_subscriber_idx" ON "creator_subscriptions" USING btree ("subscriber_did");--> statement-breakpoint
CREATE INDEX "creator_subs_creator_idx" ON "creator_subscriptions" USING btree ("creator_did");--> statement-breakpoint
CREATE INDEX "creator_subs_tier_idx" ON "creator_subscriptions" USING btree ("tier_id");--> statement-breakpoint
CREATE INDEX "creator_subs_status_idx" ON "creator_subscriptions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "creator_subs_stripe_idx" ON "creator_subscriptions" USING btree ("stripe_subscription_id");--> statement-breakpoint
CREATE UNIQUE INDEX "creator_subs_unique_idx" ON "creator_subscriptions" USING btree ("subscriber_did","creator_did");