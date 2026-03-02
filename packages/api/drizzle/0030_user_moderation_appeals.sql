-- User Moderation Appeals Migration
-- Add sanctionId reference to moderationAppeals for user appeals against sanctions

-- Add sanction_id column to moderation_appeals for linking appeals to user_sanctions
ALTER TABLE moderation_appeals
ADD COLUMN sanction_id TEXT REFERENCES user_sanctions(id);

-- Create index for efficient lookups by sanction
CREATE INDEX moderation_appeals_sanction_id_idx ON moderation_appeals(sanction_id);
