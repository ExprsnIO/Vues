CREATE TABLE "announcements" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"type" text DEFAULT 'info' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"target_audience" text DEFAULT 'all' NOT NULL,
	"dismissible" boolean DEFAULT true NOT NULL,
	"starts_at" timestamp,
	"ends_at" timestamp,
	"view_count" integer DEFAULT 0 NOT NULL,
	"dismiss_count" integer DEFAULT 0 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "did_cache" (
	"did" text PRIMARY KEY NOT NULL,
	"document" jsonb NOT NULL,
	"handle" text,
	"pds_endpoint" text,
	"signing_key" text,
	"resolved_at" timestamp NOT NULL,
	"expires_at" timestamp NOT NULL,
	"stale_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "federation_sync_state" (
	"id" text PRIMARY KEY NOT NULL,
	"remote_endpoint" text NOT NULL,
	"remote_did" text,
	"last_synced_seq" integer,
	"last_synced_at" timestamp,
	"sync_direction" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"error_message" text,
	"error_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"type" text NOT NULL,
	"url" text NOT NULL,
	"mime_type" text,
	"file_name" text,
	"file_size" integer,
	"width" integer,
	"height" integer,
	"duration" real,
	"thumbnail_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_reactions" (
	"id" text PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"user_did" text NOT NULL,
	"emoji" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mod_actions_log" (
	"id" text PRIMARY KEY NOT NULL,
	"action" text NOT NULL,
	"content_type" text NOT NULL,
	"content_id" text NOT NULL,
	"source_service" text NOT NULL,
	"performed_by" text,
	"is_automated" boolean DEFAULT false,
	"reason" text,
	"moderation_item_id" text,
	"report_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"performed_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moderation_agent_executions" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"moderation_item_id" text,
	"success" boolean NOT NULL,
	"execution_time_ms" integer NOT NULL,
	"input_data" jsonb,
	"output_data" jsonb,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moderation_ai_agents" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"type" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"provider" text NOT NULL,
	"model" text,
	"prompt_template" text,
	"config" jsonb DEFAULT '{}'::jsonb,
	"threshold_scores" jsonb DEFAULT '{}'::jsonb,
	"applies_to" jsonb DEFAULT '[]'::jsonb,
	"priority" integer DEFAULT 0,
	"enabled" boolean DEFAULT true,
	"auto_action" boolean DEFAULT false,
	"total_executions" integer DEFAULT 0,
	"successful_executions" integer DEFAULT 0,
	"failed_executions" integer DEFAULT 0,
	"avg_execution_time_ms" integer DEFAULT 0,
	"last_execution_at" timestamp,
	"last_error" text,
	"last_error_at" timestamp,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "moderation_ai_agents_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "moderation_appeals" (
	"id" text PRIMARY KEY NOT NULL,
	"moderation_item_id" text,
	"user_action_id" text,
	"user_id" text NOT NULL,
	"reason" text NOT NULL,
	"additional_info" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp,
	"review_notes" text,
	"decision" text,
	"submitted_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moderation_banned_tags" (
	"id" text PRIMARY KEY NOT NULL,
	"tag" text NOT NULL,
	"reason" text,
	"action" text DEFAULT 'flag' NOT NULL,
	"enabled" boolean DEFAULT true,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moderation_banned_words" (
	"id" text PRIMARY KEY NOT NULL,
	"word" text NOT NULL,
	"category" text NOT NULL,
	"severity" text DEFAULT 'medium' NOT NULL,
	"action" text DEFAULT 'flag' NOT NULL,
	"enabled" boolean DEFAULT true,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moderation_items" (
	"id" text PRIMARY KEY NOT NULL,
	"content_type" text NOT NULL,
	"content_id" text NOT NULL,
	"source_service" text NOT NULL,
	"user_id" text NOT NULL,
	"content_text" text,
	"content_url" text,
	"content_metadata" jsonb DEFAULT '{}'::jsonb,
	"risk_score" integer DEFAULT 0 NOT NULL,
	"risk_level" text DEFAULT 'safe' NOT NULL,
	"toxicity_score" integer DEFAULT 0,
	"nsfw_score" integer DEFAULT 0,
	"spam_score" integer DEFAULT 0,
	"violence_score" integer DEFAULT 0,
	"hate_speech_score" integer DEFAULT 0,
	"ai_provider" text,
	"ai_model" text,
	"ai_response" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"action" text,
	"requires_review" boolean DEFAULT false,
	"reviewed_by" text,
	"reviewed_at" timestamp,
	"review_notes" text,
	"submitted_at" timestamp NOT NULL,
	"processed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moderation_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"content_type" text NOT NULL,
	"content_id" text NOT NULL,
	"source_service" text NOT NULL,
	"reported_by" text NOT NULL,
	"reason" text NOT NULL,
	"details" text,
	"status" text DEFAULT 'open' NOT NULL,
	"assigned_to" text,
	"assigned_at" timestamp,
	"resolved_by" text,
	"resolved_at" timestamp,
	"resolution_notes" text,
	"action_taken" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moderation_review_queue" (
	"id" text PRIMARY KEY NOT NULL,
	"moderation_item_id" text NOT NULL,
	"priority" integer DEFAULT 0,
	"escalated" boolean DEFAULT false,
	"escalated_reason" text,
	"assigned_to" text,
	"assigned_at" timestamp,
	"status" text DEFAULT 'pending' NOT NULL,
	"queued_at" timestamp NOT NULL,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moderation_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"applies_to" jsonb DEFAULT '[]'::jsonb,
	"source_services" jsonb DEFAULT '[]'::jsonb,
	"conditions" jsonb DEFAULT '{}'::jsonb,
	"threshold_score" integer,
	"action" text NOT NULL,
	"enabled" boolean DEFAULT true,
	"priority" integer DEFAULT 0,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "moderation_rules_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "moderation_user_actions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"action_type" text NOT NULL,
	"reason" text NOT NULL,
	"duration_seconds" integer,
	"expires_at" timestamp,
	"performed_by" text NOT NULL,
	"related_content_id" text,
	"related_report_id" text,
	"active" boolean DEFAULT true,
	"performed_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payout_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"user_did" text NOT NULL,
	"amount" integer NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"payout_method" text,
	"payout_details" jsonb,
	"processed_by" text,
	"processed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plc_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"did" text NOT NULL,
	"action" text NOT NULL,
	"operation_cid" text,
	"previous_state" jsonb,
	"new_state" jsonb,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plc_handle_reservations" (
	"id" serial PRIMARY KEY NOT NULL,
	"handle" text NOT NULL,
	"handle_type" text NOT NULL,
	"organization_id" text,
	"reserved_by" text,
	"reserved_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	"status" text DEFAULT 'active' NOT NULL,
	CONSTRAINT "plc_handle_reservations_handle_unique" UNIQUE("handle")
);
--> statement-breakpoint
CREATE TABLE "plc_identities" (
	"did" text PRIMARY KEY NOT NULL,
	"handle" text,
	"pds_endpoint" text,
	"signing_key" text,
	"rotation_keys" jsonb NOT NULL,
	"also_known_as" jsonb,
	"services" jsonb,
	"last_operation_cid" text,
	"status" text DEFAULT 'active' NOT NULL,
	"tombstoned_at" timestamp,
	"tombstoned_by" text,
	"tombstone_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plc_operations" (
	"id" serial PRIMARY KEY NOT NULL,
	"did" text NOT NULL,
	"cid" text NOT NULL,
	"operation" jsonb NOT NULL,
	"nullified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "relay_events" (
	"seq" integer PRIMARY KEY NOT NULL,
	"did" text NOT NULL,
	"commit" jsonb NOT NULL,
	"time" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "relay_subscribers" (
	"id" text PRIMARY KEY NOT NULL,
	"endpoint" text NOT NULL,
	"cursor" integer,
	"wanted_collections" jsonb,
	"status" text DEFAULT 'active' NOT NULL,
	"last_heartbeat" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_registry" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"endpoint" text NOT NULL,
	"did" text,
	"certificate_id" text,
	"region" text,
	"capabilities" jsonb,
	"status" text DEFAULT 'active' NOT NULL,
	"last_health_check" timestamp,
	"health_check_failures" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stream_guest_invitations" (
	"id" text PRIMARY KEY NOT NULL,
	"stream_id" text NOT NULL,
	"inviter_did" text NOT NULL,
	"invitee_did" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"role" text DEFAULT 'guest' NOT NULL,
	"message" text,
	"expires_at" timestamp NOT NULL,
	"responded_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stream_guest_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"guest_id" text NOT NULL,
	"stream_id" text NOT NULL,
	"user_did" text NOT NULL,
	"connection_id" text NOT NULL,
	"duration" integer DEFAULT 0 NOT NULL,
	"disconnect_reason" text,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	"left_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "stream_guests" (
	"id" text PRIMARY KEY NOT NULL,
	"stream_id" text NOT NULL,
	"user_did" text NOT NULL,
	"invitation_id" text,
	"role" text DEFAULT 'guest' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"audio_enabled" boolean DEFAULT true NOT NULL,
	"video_enabled" boolean DEFAULT true NOT NULL,
	"screen_share_enabled" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	"left_at" timestamp,
	"connection_id" text,
	"peer_id" text,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "user_presence" (
	"user_did" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'offline' NOT NULL,
	"last_seen" timestamp DEFAULT now() NOT NULL,
	"current_conversation_id" text
);
--> statement-breakpoint
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_user_did_users_did_fk" FOREIGN KEY ("user_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mod_actions_log" ADD CONSTRAINT "mod_actions_log_moderation_item_id_moderation_items_id_fk" FOREIGN KEY ("moderation_item_id") REFERENCES "public"."moderation_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_agent_executions" ADD CONSTRAINT "moderation_agent_executions_agent_id_moderation_ai_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."moderation_ai_agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_agent_executions" ADD CONSTRAINT "moderation_agent_executions_moderation_item_id_moderation_items_id_fk" FOREIGN KEY ("moderation_item_id") REFERENCES "public"."moderation_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_appeals" ADD CONSTRAINT "moderation_appeals_moderation_item_id_moderation_items_id_fk" FOREIGN KEY ("moderation_item_id") REFERENCES "public"."moderation_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_appeals" ADD CONSTRAINT "moderation_appeals_user_action_id_moderation_user_actions_id_fk" FOREIGN KEY ("user_action_id") REFERENCES "public"."moderation_user_actions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_review_queue" ADD CONSTRAINT "moderation_review_queue_moderation_item_id_moderation_items_id_fk" FOREIGN KEY ("moderation_item_id") REFERENCES "public"."moderation_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stream_guest_invitations" ADD CONSTRAINT "stream_guest_invitations_stream_id_live_streams_id_fk" FOREIGN KEY ("stream_id") REFERENCES "public"."live_streams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stream_guest_invitations" ADD CONSTRAINT "stream_guest_invitations_inviter_did_users_did_fk" FOREIGN KEY ("inviter_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stream_guest_invitations" ADD CONSTRAINT "stream_guest_invitations_invitee_did_users_did_fk" FOREIGN KEY ("invitee_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stream_guest_sessions" ADD CONSTRAINT "stream_guest_sessions_guest_id_stream_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."stream_guests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stream_guest_sessions" ADD CONSTRAINT "stream_guest_sessions_stream_id_live_streams_id_fk" FOREIGN KEY ("stream_id") REFERENCES "public"."live_streams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stream_guest_sessions" ADD CONSTRAINT "stream_guest_sessions_user_did_users_did_fk" FOREIGN KEY ("user_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stream_guests" ADD CONSTRAINT "stream_guests_stream_id_live_streams_id_fk" FOREIGN KEY ("stream_id") REFERENCES "public"."live_streams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stream_guests" ADD CONSTRAINT "stream_guests_user_did_users_did_fk" FOREIGN KEY ("user_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stream_guests" ADD CONSTRAINT "stream_guests_invitation_id_stream_guest_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."stream_guest_invitations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_presence" ADD CONSTRAINT "user_presence_user_did_users_did_fk" FOREIGN KEY ("user_did") REFERENCES "public"."users"("did") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "did_cache_handle_idx" ON "did_cache" USING btree ("handle");--> statement-breakpoint
CREATE INDEX "did_cache_pds_endpoint_idx" ON "did_cache" USING btree ("pds_endpoint");--> statement-breakpoint
CREATE INDEX "did_cache_expires_at_idx" ON "did_cache" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "federation_sync_state_endpoint_idx" ON "federation_sync_state" USING btree ("remote_endpoint");--> statement-breakpoint
CREATE INDEX "federation_sync_state_status_idx" ON "federation_sync_state" USING btree ("status");--> statement-breakpoint
CREATE INDEX "message_attachments_message_idx" ON "message_attachments" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "message_reactions_message_idx" ON "message_reactions" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "message_reactions_user_idx" ON "message_reactions" USING btree ("user_did");--> statement-breakpoint
CREATE UNIQUE INDEX "message_reactions_unique_idx" ON "message_reactions" USING btree ("message_id","user_did","emoji");--> statement-breakpoint
CREATE INDEX "mod_actions_log_moderation_item_id_idx" ON "mod_actions_log" USING btree ("moderation_item_id");--> statement-breakpoint
CREATE INDEX "mod_actions_log_performed_at_idx" ON "mod_actions_log" USING btree ("performed_at");--> statement-breakpoint
CREATE INDEX "moderation_agent_executions_agent_id_idx" ON "moderation_agent_executions" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "moderation_agent_executions_created_at_idx" ON "moderation_agent_executions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "moderation_ai_agents_enabled_idx" ON "moderation_ai_agents" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX "moderation_ai_agents_provider_idx" ON "moderation_ai_agents" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "moderation_ai_agents_status_idx" ON "moderation_ai_agents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "moderation_appeals_user_id_idx" ON "moderation_appeals" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "moderation_appeals_status_idx" ON "moderation_appeals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "moderation_appeals_submitted_at_idx" ON "moderation_appeals" USING btree ("submitted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "moderation_banned_tags_tag_idx" ON "moderation_banned_tags" USING btree ("tag");--> statement-breakpoint
CREATE INDEX "moderation_banned_tags_enabled_idx" ON "moderation_banned_tags" USING btree ("enabled");--> statement-breakpoint
CREATE UNIQUE INDEX "moderation_banned_words_word_idx" ON "moderation_banned_words" USING btree ("word");--> statement-breakpoint
CREATE INDEX "moderation_banned_words_category_idx" ON "moderation_banned_words" USING btree ("category");--> statement-breakpoint
CREATE INDEX "moderation_banned_words_enabled_idx" ON "moderation_banned_words" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX "moderation_items_user_id_idx" ON "moderation_items" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "moderation_items_status_idx" ON "moderation_items" USING btree ("status");--> statement-breakpoint
CREATE INDEX "moderation_items_risk_level_idx" ON "moderation_items" USING btree ("risk_level");--> statement-breakpoint
CREATE INDEX "moderation_items_source_service_idx" ON "moderation_items" USING btree ("source_service");--> statement-breakpoint
CREATE INDEX "moderation_items_submitted_at_idx" ON "moderation_items" USING btree ("submitted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "moderation_items_content_unique_idx" ON "moderation_items" USING btree ("source_service","content_type","content_id");--> statement-breakpoint
CREATE INDEX "moderation_reports_status_idx" ON "moderation_reports" USING btree ("status");--> statement-breakpoint
CREATE INDEX "moderation_reports_reported_by_idx" ON "moderation_reports" USING btree ("reported_by");--> statement-breakpoint
CREATE INDEX "moderation_reports_content_idx" ON "moderation_reports" USING btree ("source_service","content_type","content_id");--> statement-breakpoint
CREATE INDEX "moderation_review_queue_status_idx" ON "moderation_review_queue" USING btree ("status");--> statement-breakpoint
CREATE INDEX "moderation_review_queue_priority_idx" ON "moderation_review_queue" USING btree ("priority","queued_at");--> statement-breakpoint
CREATE INDEX "moderation_review_queue_assigned_to_idx" ON "moderation_review_queue" USING btree ("assigned_to");--> statement-breakpoint
CREATE INDEX "moderation_review_queue_escalated_idx" ON "moderation_review_queue" USING btree ("escalated");--> statement-breakpoint
CREATE INDEX "moderation_rules_enabled_idx" ON "moderation_rules" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX "moderation_rules_priority_idx" ON "moderation_rules" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "moderation_user_actions_user_id_idx" ON "moderation_user_actions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "moderation_user_actions_action_type_idx" ON "moderation_user_actions" USING btree ("action_type");--> statement-breakpoint
CREATE INDEX "moderation_user_actions_active_idx" ON "moderation_user_actions" USING btree ("active");--> statement-breakpoint
CREATE INDEX "moderation_user_actions_expires_at_idx" ON "moderation_user_actions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "payout_requests_user_did_idx" ON "payout_requests" USING btree ("user_did");--> statement-breakpoint
CREATE INDEX "payout_requests_status_idx" ON "payout_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "plc_audit_log_did_idx" ON "plc_audit_log" USING btree ("did");--> statement-breakpoint
CREATE INDEX "plc_audit_log_action_idx" ON "plc_audit_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX "plc_audit_log_created_at_idx" ON "plc_audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "plc_handle_reservations_handle_idx" ON "plc_handle_reservations" USING btree ("handle");--> statement-breakpoint
CREATE INDEX "plc_handle_reservations_org_idx" ON "plc_handle_reservations" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "plc_identities_handle_idx" ON "plc_identities" USING btree ("handle");--> statement-breakpoint
CREATE INDEX "plc_identities_pds_idx" ON "plc_identities" USING btree ("pds_endpoint");--> statement-breakpoint
CREATE INDEX "plc_identities_status_idx" ON "plc_identities" USING btree ("status");--> statement-breakpoint
CREATE INDEX "plc_operations_did_idx" ON "plc_operations" USING btree ("did");--> statement-breakpoint
CREATE UNIQUE INDEX "plc_operations_cid_idx" ON "plc_operations" USING btree ("cid");--> statement-breakpoint
CREATE INDEX "plc_operations_created_at_idx" ON "plc_operations" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "relay_events_did_idx" ON "relay_events" USING btree ("did");--> statement-breakpoint
CREATE INDEX "relay_events_time_idx" ON "relay_events" USING btree ("time");--> statement-breakpoint
CREATE INDEX "relay_events_collection_idx" ON "relay_events" USING btree ("did");--> statement-breakpoint
CREATE INDEX "relay_subscribers_status_idx" ON "relay_subscribers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "relay_subscribers_endpoint_idx" ON "relay_subscribers" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "service_registry_type_idx" ON "service_registry" USING btree ("type");--> statement-breakpoint
CREATE INDEX "service_registry_status_idx" ON "service_registry" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "service_registry_endpoint_idx" ON "service_registry" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "service_registry_did_idx" ON "service_registry" USING btree ("did");--> statement-breakpoint
CREATE INDEX "service_registry_region_idx" ON "service_registry" USING btree ("region");--> statement-breakpoint
CREATE INDEX "stream_guest_invitations_stream_idx" ON "stream_guest_invitations" USING btree ("stream_id");--> statement-breakpoint
CREATE INDEX "stream_guest_invitations_inviter_idx" ON "stream_guest_invitations" USING btree ("inviter_did");--> statement-breakpoint
CREATE INDEX "stream_guest_invitations_invitee_idx" ON "stream_guest_invitations" USING btree ("invitee_did");--> statement-breakpoint
CREATE INDEX "stream_guest_invitations_status_idx" ON "stream_guest_invitations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "stream_guest_invitations_expires_idx" ON "stream_guest_invitations" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "stream_guest_invitations_unique_idx" ON "stream_guest_invitations" USING btree ("stream_id","invitee_did","status");--> statement-breakpoint
CREATE INDEX "stream_guest_sessions_guest_idx" ON "stream_guest_sessions" USING btree ("guest_id");--> statement-breakpoint
CREATE INDEX "stream_guest_sessions_stream_idx" ON "stream_guest_sessions" USING btree ("stream_id");--> statement-breakpoint
CREATE INDEX "stream_guest_sessions_user_idx" ON "stream_guest_sessions" USING btree ("user_did");--> statement-breakpoint
CREATE INDEX "stream_guest_sessions_joined_idx" ON "stream_guest_sessions" USING btree ("joined_at");--> statement-breakpoint
CREATE INDEX "stream_guests_stream_idx" ON "stream_guests" USING btree ("stream_id");--> statement-breakpoint
CREATE INDEX "stream_guests_user_idx" ON "stream_guests" USING btree ("user_did");--> statement-breakpoint
CREATE INDEX "stream_guests_status_idx" ON "stream_guests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "stream_guests_position_idx" ON "stream_guests" USING btree ("stream_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "stream_guests_unique_idx" ON "stream_guests" USING btree ("stream_id","user_did");