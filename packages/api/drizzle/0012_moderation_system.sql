-- Content Moderation System Tables

-- Moderation Items - content submitted for moderation
CREATE TABLE IF NOT EXISTS "moderation_items" (
  "id" TEXT PRIMARY KEY,
  "content_type" TEXT NOT NULL,
  "content_id" TEXT NOT NULL,
  "source_service" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "content_text" TEXT,
  "content_url" TEXT,
  "content_metadata" JSONB DEFAULT '{}',
  "risk_score" INTEGER NOT NULL DEFAULT 0,
  "risk_level" TEXT NOT NULL DEFAULT 'safe',
  "toxicity_score" INTEGER DEFAULT 0,
  "nsfw_score" INTEGER DEFAULT 0,
  "spam_score" INTEGER DEFAULT 0,
  "violence_score" INTEGER DEFAULT 0,
  "hate_speech_score" INTEGER DEFAULT 0,
  "ai_provider" TEXT,
  "ai_model" TEXT,
  "ai_response" JSONB,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "action" TEXT,
  "requires_review" BOOLEAN DEFAULT false,
  "reviewed_by" TEXT,
  "reviewed_at" TIMESTAMP,
  "review_notes" TEXT,
  "submitted_at" TIMESTAMP NOT NULL,
  "processed_at" TIMESTAMP,
  "created_at" TIMESTAMP DEFAULT NOW() NOT NULL,
  "updated_at" TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS "moderation_items_user_id_idx" ON "moderation_items" ("user_id");
CREATE INDEX IF NOT EXISTS "moderation_items_status_idx" ON "moderation_items" ("status");
CREATE INDEX IF NOT EXISTS "moderation_items_risk_level_idx" ON "moderation_items" ("risk_level");
CREATE INDEX IF NOT EXISTS "moderation_items_source_service_idx" ON "moderation_items" ("source_service");
CREATE INDEX IF NOT EXISTS "moderation_items_submitted_at_idx" ON "moderation_items" ("submitted_at");
CREATE UNIQUE INDEX IF NOT EXISTS "moderation_items_content_unique_idx" ON "moderation_items" ("source_service", "content_type", "content_id");

-- Review Queue
CREATE TABLE IF NOT EXISTS "moderation_review_queue" (
  "id" TEXT PRIMARY KEY,
  "moderation_item_id" TEXT NOT NULL REFERENCES "moderation_items"("id") ON DELETE CASCADE,
  "priority" INTEGER DEFAULT 0,
  "escalated" BOOLEAN DEFAULT false,
  "escalated_reason" TEXT,
  "assigned_to" TEXT,
  "assigned_at" TIMESTAMP,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "queued_at" TIMESTAMP NOT NULL,
  "completed_at" TIMESTAMP,
  "created_at" TIMESTAMP DEFAULT NOW() NOT NULL,
  "updated_at" TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS "moderation_review_queue_status_idx" ON "moderation_review_queue" ("status");
CREATE INDEX IF NOT EXISTS "moderation_review_queue_priority_idx" ON "moderation_review_queue" ("priority", "queued_at");
CREATE INDEX IF NOT EXISTS "moderation_review_queue_assigned_to_idx" ON "moderation_review_queue" ("assigned_to");
CREATE INDEX IF NOT EXISTS "moderation_review_queue_escalated_idx" ON "moderation_review_queue" ("escalated");

-- Moderation Actions Log (AI moderation actions)
CREATE TABLE IF NOT EXISTS "mod_actions_log" (
  "id" TEXT PRIMARY KEY,
  "action" TEXT NOT NULL,
  "content_type" TEXT NOT NULL,
  "content_id" TEXT NOT NULL,
  "source_service" TEXT NOT NULL,
  "performed_by" TEXT,
  "is_automated" BOOLEAN DEFAULT false,
  "reason" TEXT,
  "moderation_item_id" TEXT REFERENCES "moderation_items"("id"),
  "report_id" TEXT,
  "metadata" JSONB DEFAULT '{}',
  "performed_at" TIMESTAMP NOT NULL,
  "created_at" TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS "mod_actions_log_moderation_item_id_idx" ON "mod_actions_log" ("moderation_item_id");
CREATE INDEX IF NOT EXISTS "mod_actions_log_performed_at_idx" ON "mod_actions_log" ("performed_at");

-- Moderation Rules
CREATE TABLE IF NOT EXISTS "moderation_rules" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL UNIQUE,
  "description" TEXT,
  "applies_to" JSONB DEFAULT '[]',
  "source_services" JSONB DEFAULT '[]',
  "conditions" JSONB DEFAULT '{}',
  "threshold_score" INTEGER,
  "action" TEXT NOT NULL,
  "enabled" BOOLEAN DEFAULT true,
  "priority" INTEGER DEFAULT 0,
  "created_by" TEXT,
  "created_at" TIMESTAMP DEFAULT NOW() NOT NULL,
  "updated_at" TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS "moderation_rules_enabled_idx" ON "moderation_rules" ("enabled");
CREATE INDEX IF NOT EXISTS "moderation_rules_priority_idx" ON "moderation_rules" ("priority");

-- User Reports
CREATE TABLE IF NOT EXISTS "moderation_reports" (
  "id" TEXT PRIMARY KEY,
  "content_type" TEXT NOT NULL,
  "content_id" TEXT NOT NULL,
  "source_service" TEXT NOT NULL,
  "reported_by" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "details" TEXT,
  "status" TEXT NOT NULL DEFAULT 'open',
  "assigned_to" TEXT,
  "assigned_at" TIMESTAMP,
  "resolved_by" TEXT,
  "resolved_at" TIMESTAMP,
  "resolution_notes" TEXT,
  "action_taken" TEXT,
  "created_at" TIMESTAMP DEFAULT NOW() NOT NULL,
  "updated_at" TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS "moderation_reports_status_idx" ON "moderation_reports" ("status");
CREATE INDEX IF NOT EXISTS "moderation_reports_reported_by_idx" ON "moderation_reports" ("reported_by");
CREATE INDEX IF NOT EXISTS "moderation_reports_content_idx" ON "moderation_reports" ("source_service", "content_type", "content_id");

-- User Actions (sanctions)
CREATE TABLE IF NOT EXISTS "moderation_user_actions" (
  "id" TEXT PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "action_type" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "duration_seconds" INTEGER,
  "expires_at" TIMESTAMP,
  "performed_by" TEXT NOT NULL,
  "related_content_id" TEXT,
  "related_report_id" TEXT,
  "active" BOOLEAN DEFAULT true,
  "performed_at" TIMESTAMP NOT NULL,
  "created_at" TIMESTAMP DEFAULT NOW() NOT NULL,
  "updated_at" TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS "moderation_user_actions_user_id_idx" ON "moderation_user_actions" ("user_id");
CREATE INDEX IF NOT EXISTS "moderation_user_actions_action_type_idx" ON "moderation_user_actions" ("action_type");
CREATE INDEX IF NOT EXISTS "moderation_user_actions_active_idx" ON "moderation_user_actions" ("active");
CREATE INDEX IF NOT EXISTS "moderation_user_actions_expires_at_idx" ON "moderation_user_actions" ("expires_at");

-- Appeals
CREATE TABLE IF NOT EXISTS "moderation_appeals" (
  "id" TEXT PRIMARY KEY,
  "moderation_item_id" TEXT REFERENCES "moderation_items"("id"),
  "user_action_id" TEXT REFERENCES "moderation_user_actions"("id"),
  "user_id" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "additional_info" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "reviewed_by" TEXT,
  "reviewed_at" TIMESTAMP,
  "review_notes" TEXT,
  "decision" TEXT,
  "submitted_at" TIMESTAMP NOT NULL,
  "created_at" TIMESTAMP DEFAULT NOW() NOT NULL,
  "updated_at" TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS "moderation_appeals_user_id_idx" ON "moderation_appeals" ("user_id");
CREATE INDEX IF NOT EXISTS "moderation_appeals_status_idx" ON "moderation_appeals" ("status");
CREATE INDEX IF NOT EXISTS "moderation_appeals_submitted_at_idx" ON "moderation_appeals" ("submitted_at");

-- AI Agents
CREATE TABLE IF NOT EXISTS "moderation_ai_agents" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL UNIQUE,
  "description" TEXT,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "provider" TEXT NOT NULL,
  "model" TEXT,
  "prompt_template" TEXT,
  "config" JSONB DEFAULT '{}',
  "threshold_scores" JSONB DEFAULT '{}',
  "applies_to" JSONB DEFAULT '[]',
  "priority" INTEGER DEFAULT 0,
  "enabled" BOOLEAN DEFAULT true,
  "auto_action" BOOLEAN DEFAULT false,
  "total_executions" INTEGER DEFAULT 0,
  "successful_executions" INTEGER DEFAULT 0,
  "failed_executions" INTEGER DEFAULT 0,
  "avg_execution_time_ms" INTEGER DEFAULT 0,
  "last_execution_at" TIMESTAMP,
  "last_error" TEXT,
  "last_error_at" TIMESTAMP,
  "created_by" TEXT,
  "created_at" TIMESTAMP DEFAULT NOW() NOT NULL,
  "updated_at" TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS "moderation_ai_agents_enabled_idx" ON "moderation_ai_agents" ("enabled");
CREATE INDEX IF NOT EXISTS "moderation_ai_agents_provider_idx" ON "moderation_ai_agents" ("provider");
CREATE INDEX IF NOT EXISTS "moderation_ai_agents_status_idx" ON "moderation_ai_agents" ("status");

-- Agent Executions
CREATE TABLE IF NOT EXISTS "moderation_agent_executions" (
  "id" TEXT PRIMARY KEY,
  "agent_id" TEXT NOT NULL REFERENCES "moderation_ai_agents"("id"),
  "moderation_item_id" TEXT REFERENCES "moderation_items"("id"),
  "success" BOOLEAN NOT NULL,
  "execution_time_ms" INTEGER NOT NULL,
  "input_data" JSONB,
  "output_data" JSONB,
  "error_message" TEXT,
  "created_at" TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS "moderation_agent_executions_agent_id_idx" ON "moderation_agent_executions" ("agent_id");
CREATE INDEX IF NOT EXISTS "moderation_agent_executions_created_at_idx" ON "moderation_agent_executions" ("created_at");

-- Banned Words
CREATE TABLE IF NOT EXISTS "moderation_banned_words" (
  "id" TEXT PRIMARY KEY,
  "word" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "severity" TEXT NOT NULL DEFAULT 'medium',
  "action" TEXT NOT NULL DEFAULT 'flag',
  "enabled" BOOLEAN DEFAULT true,
  "created_by" TEXT,
  "created_at" TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "moderation_banned_words_word_idx" ON "moderation_banned_words" ("word");
CREATE INDEX IF NOT EXISTS "moderation_banned_words_category_idx" ON "moderation_banned_words" ("category");
CREATE INDEX IF NOT EXISTS "moderation_banned_words_enabled_idx" ON "moderation_banned_words" ("enabled");

-- Banned Tags
CREATE TABLE IF NOT EXISTS "moderation_banned_tags" (
  "id" TEXT PRIMARY KEY,
  "tag" TEXT NOT NULL,
  "reason" TEXT,
  "action" TEXT NOT NULL DEFAULT 'flag',
  "enabled" BOOLEAN DEFAULT true,
  "created_by" TEXT,
  "created_at" TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "moderation_banned_tags_tag_idx" ON "moderation_banned_tags" ("tag");
CREATE INDEX IF NOT EXISTS "moderation_banned_tags_enabled_idx" ON "moderation_banned_tags" ("enabled");
