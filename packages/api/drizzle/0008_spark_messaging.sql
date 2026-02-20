-- Message reactions table
CREATE TABLE IF NOT EXISTS message_reactions (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_did TEXT NOT NULL REFERENCES users(did) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS message_reactions_message_idx ON message_reactions(message_id);
CREATE INDEX IF NOT EXISTS message_reactions_user_idx ON message_reactions(user_did);
CREATE UNIQUE INDEX IF NOT EXISTS message_reactions_unique_idx ON message_reactions(message_id, user_did, emoji);

-- Message attachments table
CREATE TABLE IF NOT EXISTS message_attachments (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  url TEXT NOT NULL,
  mime_type TEXT,
  file_name TEXT,
  file_size INTEGER,
  width INTEGER,
  height INTEGER,
  duration REAL,
  thumbnail_url TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS message_attachments_message_idx ON message_attachments(message_id);

-- User presence table
CREATE TABLE IF NOT EXISTS user_presence (
  user_did TEXT PRIMARY KEY REFERENCES users(did) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'offline',
  last_seen TIMESTAMP DEFAULT NOW() NOT NULL,
  current_conversation_id TEXT
);
