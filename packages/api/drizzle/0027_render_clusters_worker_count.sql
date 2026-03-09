-- Add worker_count column to render_clusters table
ALTER TABLE "render_clusters" ADD COLUMN IF NOT EXISTS "worker_count" integer DEFAULT 0;
