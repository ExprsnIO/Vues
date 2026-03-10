CREATE TABLE "domain_dns_records" (
	"id" text PRIMARY KEY NOT NULL,
	"domain_id" text NOT NULL,
	"record_type" text NOT NULL,
	"name" text NOT NULL,
	"expected_value" text,
	"actual_value" text,
	"status" text DEFAULT 'unknown' NOT NULL,
	"error_message" text,
	"last_checked" timestamp,
	"validated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "domain_health_checks" (
	"id" text PRIMARY KEY NOT NULL,
	"domain_id" text NOT NULL,
	"check_type" text NOT NULL,
	"status" text NOT NULL,
	"response_time" integer,
	"status_code" integer,
	"error_message" text,
	"details" jsonb,
	"checked_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "domain_health_summaries" (
	"domain_id" text PRIMARY KEY NOT NULL,
	"overall_status" text DEFAULT 'unknown' NOT NULL,
	"dns_status" text DEFAULT 'unknown' NOT NULL,
	"pds_status" text DEFAULT 'unknown' NOT NULL,
	"api_status" text DEFAULT 'unknown' NOT NULL,
	"certificate_status" text DEFAULT 'unknown' NOT NULL,
	"federation_status" text DEFAULT 'unknown' NOT NULL,
	"last_health_check" timestamp,
	"last_dns_check" timestamp,
	"uptime_percentage" real DEFAULT 100,
	"incident_count_24h" integer DEFAULT 0 NOT NULL,
	"avg_response_time" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "domain_transfers" (
	"id" text PRIMARY KEY NOT NULL,
	"domain_id" text NOT NULL,
	"source_organization_id" text,
	"source_user_did" text,
	"target_organization_id" text,
	"target_user_did" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"initiated_by" text NOT NULL,
	"approved_by" text,
	"rejected_by" text,
	"cancelled_by" text,
	"reason" text,
	"notes" text,
	"admin_notes" text,
	"requires_approval" boolean DEFAULT true NOT NULL,
	"auto_approve_after" timestamp,
	"notifications_sent" boolean DEFAULT false NOT NULL,
	"reminders_sent" integer DEFAULT 0 NOT NULL,
	"initiated_at" timestamp DEFAULT now() NOT NULL,
	"approved_at" timestamp,
	"rejected_at" timestamp,
	"cancelled_at" timestamp,
	"completed_at" timestamp,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gpu_allocations" (
	"id" text PRIMARY KEY NOT NULL,
	"worker_id" text NOT NULL,
	"job_id" text NOT NULL,
	"gpu_index" integer NOT NULL,
	"job_type" text NOT NULL,
	"allocated_at" timestamp DEFAULT now() NOT NULL,
	"released_at" timestamp,
	"memory_allocated_mb" integer
);
--> statement-breakpoint
CREATE TABLE "gpu_job_priorities" (
	"id" text PRIMARY KEY NOT NULL,
	"job_type" text NOT NULL,
	"priority" integer DEFAULT 50 NOT NULL,
	"requires_gpu" boolean DEFAULT false NOT NULL,
	"preferred_gpu_model" text,
	"max_gpu_memory_mb" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "gpu_job_priorities_job_type_unique" UNIQUE("job_type")
);
--> statement-breakpoint
CREATE TABLE "gpu_metrics" (
	"id" text PRIMARY KEY NOT NULL,
	"worker_id" text NOT NULL,
	"gpu_index" integer NOT NULL,
	"utilization" real NOT NULL,
	"memory_used_mb" integer NOT NULL,
	"memory_total_mb" integer NOT NULL,
	"temperature" real,
	"power_watts" real,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "render_workers" ADD COLUMN "gpu_memory_mb" integer;--> statement-breakpoint
ALTER TABLE "render_workers" ADD COLUMN "gpu_count" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "render_workers" ADD COLUMN "gpu_utilization" real;--> statement-breakpoint
ALTER TABLE "render_workers" ADD COLUMN "gpu_memory_used" integer;--> statement-breakpoint
ALTER TABLE "domain_dns_records" ADD CONSTRAINT "domain_dns_records_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_health_checks" ADD CONSTRAINT "domain_health_checks_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_health_summaries" ADD CONSTRAINT "domain_health_summaries_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_transfers" ADD CONSTRAINT "domain_transfers_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_transfers" ADD CONSTRAINT "domain_transfers_source_organization_id_organizations_id_fk" FOREIGN KEY ("source_organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_transfers" ADD CONSTRAINT "domain_transfers_source_user_did_users_did_fk" FOREIGN KEY ("source_user_did") REFERENCES "public"."users"("did") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_transfers" ADD CONSTRAINT "domain_transfers_target_organization_id_organizations_id_fk" FOREIGN KEY ("target_organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_transfers" ADD CONSTRAINT "domain_transfers_target_user_did_users_did_fk" FOREIGN KEY ("target_user_did") REFERENCES "public"."users"("did") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_transfers" ADD CONSTRAINT "domain_transfers_initiated_by_users_did_fk" FOREIGN KEY ("initiated_by") REFERENCES "public"."users"("did") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_transfers" ADD CONSTRAINT "domain_transfers_approved_by_users_did_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("did") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_transfers" ADD CONSTRAINT "domain_transfers_rejected_by_users_did_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."users"("did") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_transfers" ADD CONSTRAINT "domain_transfers_cancelled_by_users_did_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("did") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gpu_allocations" ADD CONSTRAINT "gpu_allocations_worker_id_render_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."render_workers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gpu_allocations" ADD CONSTRAINT "gpu_allocations_job_id_render_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."render_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gpu_metrics" ADD CONSTRAINT "gpu_metrics_worker_id_render_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."render_workers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "domain_dns_records_domain_idx" ON "domain_dns_records" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "domain_dns_records_status_idx" ON "domain_dns_records" USING btree ("status");--> statement-breakpoint
CREATE INDEX "domain_dns_records_type_idx" ON "domain_dns_records" USING btree ("record_type");--> statement-breakpoint
CREATE INDEX "domain_health_checks_domain_idx" ON "domain_health_checks" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "domain_health_checks_status_idx" ON "domain_health_checks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "domain_health_checks_type_idx" ON "domain_health_checks" USING btree ("check_type");--> statement-breakpoint
CREATE INDEX "domain_health_checks_checked_idx" ON "domain_health_checks" USING btree ("checked_at");--> statement-breakpoint
CREATE INDEX "domain_health_summaries_overall_idx" ON "domain_health_summaries" USING btree ("overall_status");--> statement-breakpoint
CREATE INDEX "domain_health_summaries_updated_idx" ON "domain_health_summaries" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "domain_transfers_domain_idx" ON "domain_transfers" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "domain_transfers_status_idx" ON "domain_transfers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "domain_transfers_source_org_idx" ON "domain_transfers" USING btree ("source_organization_id");--> statement-breakpoint
CREATE INDEX "domain_transfers_target_org_idx" ON "domain_transfers" USING btree ("target_organization_id");--> statement-breakpoint
CREATE INDEX "domain_transfers_initiated_by_idx" ON "domain_transfers" USING btree ("initiated_by");--> statement-breakpoint
CREATE INDEX "domain_transfers_status_domain_idx" ON "domain_transfers" USING btree ("status","domain_id");--> statement-breakpoint
CREATE INDEX "domain_transfers_expires_idx" ON "domain_transfers" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "gpu_allocations_worker_idx" ON "gpu_allocations" USING btree ("worker_id");--> statement-breakpoint
CREATE INDEX "gpu_allocations_job_idx" ON "gpu_allocations" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "gpu_allocations_active_idx" ON "gpu_allocations" USING btree ("released_at");--> statement-breakpoint
CREATE INDEX "gpu_job_priorities_priority_idx" ON "gpu_job_priorities" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "gpu_metrics_worker_idx" ON "gpu_metrics" USING btree ("worker_id");--> statement-breakpoint
CREATE INDEX "gpu_metrics_timestamp_idx" ON "gpu_metrics" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "render_workers_gpu_enabled_idx" ON "render_workers" USING btree ("gpu_enabled");