-- Feed Optimization Indexes
-- These composite indexes optimize batch queries for feed generation

-- Optimize batch fetching of likes by author + video URIs
-- Used in: buildVideoViewsBatch() when fetching viewer engagement
CREATE INDEX IF NOT EXISTS "likes_author_video_idx" ON "likes" ("author_did", "video_uri");

-- Optimize batch fetching of reposts by author + video URIs
-- Used in: buildVideoViewsBatch() when fetching viewer engagement
CREATE INDEX IF NOT EXISTS "reposts_author_video_idx" ON "reposts" ("author_did", "video_uri");

-- Optimize batch fetching of bookmarks by author + video URIs
-- Used in: buildVideoViewsBatch() when fetching viewer engagement
CREATE INDEX IF NOT EXISTS "bookmarks_author_video_idx" ON "bookmarks" ("author_did", "video_uri");

-- Optimize challenge entries queries with challenge_id
-- Used in: getChallenges endpoint when fetching entries per challenge
CREATE INDEX IF NOT EXISTS "challenge_entries_challenge_score_idx" ON "challenge_entries" ("challenge_id", "engagement_score" DESC);

-- Optimize videos visibility + created_at for timeline queries
-- Used in: multiple feed endpoints filtering by visibility + sorting by time
CREATE INDEX IF NOT EXISTS "videos_visibility_created_idx" ON "videos" ("visibility", "created_at" DESC);

-- Optimize videos moderation + visibility for public feed queries
-- Used in: all public feed endpoints with moderation filters
CREATE INDEX IF NOT EXISTS "videos_moderation_visibility_idx" ON "videos" ("moderation_status", "visibility") WHERE "deleted_at" IS NULL;
