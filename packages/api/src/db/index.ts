import { drizzle as drizzlePg } from 'drizzle-orm/postgres-js';
import { drizzle as drizzleSqlite } from 'drizzle-orm/better-sqlite3';
import postgres from 'postgres';
import Database from 'better-sqlite3';
import * as pgSchema from './schema.js';
import * as sqliteSchema from './schema.sqlite.js';
import { existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', '..', 'data');
const SQLITE_PATH = join(DATA_DIR, 'exprsn.db');

const DEFAULT_POSTGRES_URL = 'postgresql://exprsn:exprsn_dev@localhost:5432/exprsn';

export type DatabaseType = 'postgres' | 'sqlite';

interface DatabaseConnection {
  db: ReturnType<typeof drizzlePg<typeof pgSchema>> | ReturnType<typeof drizzleSqlite<typeof sqliteSchema>>;
  type: DatabaseType;
  schema: typeof pgSchema | typeof sqliteSchema;
}

async function tryPostgresConnection(url: string): Promise<DatabaseConnection | null> {
  try {
    const client = postgres(url, {
      connect_timeout: 5,
      max: 1,
    });

    // Test the connection
    await client`SELECT 1`;

    console.log(`Connected to PostgreSQL: ${url.replace(/:[^:@]+@/, ':****@')}`);
    const db = drizzlePg(client, { schema: pgSchema });
    return { db, type: 'postgres', schema: pgSchema };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`PostgreSQL connection failed (${url.replace(/:[^:@]+@/, ':****@')}): ${message}`);
    return null;
  }
}

function initSqliteConnection(): DatabaseConnection {
  // Ensure data directory exists
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  console.log(`Using SQLite database: ${SQLITE_PATH}`);
  const sqlite = new Database(SQLITE_PATH);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  const db = drizzleSqlite(sqlite, { schema: sqliteSchema });

  // Create tables if they don't exist
  createSqliteTables(sqlite);

  return { db, type: 'sqlite', schema: sqliteSchema };
}

function createSqliteTables(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      did TEXT PRIMARY KEY,
      handle TEXT NOT NULL,
      display_name TEXT,
      avatar TEXT,
      bio TEXT,
      follower_count INTEGER NOT NULL DEFAULT 0,
      following_count INTEGER NOT NULL DEFAULT 0,
      video_count INTEGER NOT NULL DEFAULT 0,
      verified INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      indexed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS users_handle_idx ON users(handle);
    CREATE INDEX IF NOT EXISTS users_updated_at_idx ON users(updated_at);

    CREATE TABLE IF NOT EXISTS videos (
      uri TEXT PRIMARY KEY,
      cid TEXT NOT NULL,
      author_did TEXT NOT NULL REFERENCES users(did) ON DELETE CASCADE,
      caption TEXT,
      tags TEXT NOT NULL DEFAULT '[]',
      sound_uri TEXT,
      cdn_url TEXT,
      hls_playlist TEXT,
      thumbnail_url TEXT,
      duration INTEGER,
      aspect_ratio TEXT,
      visibility TEXT NOT NULL DEFAULT 'public',
      allow_duet INTEGER NOT NULL DEFAULT 1,
      allow_stitch INTEGER NOT NULL DEFAULT 1,
      allow_comments INTEGER NOT NULL DEFAULT 1,
      view_count INTEGER NOT NULL DEFAULT 0,
      like_count INTEGER NOT NULL DEFAULT 0,
      comment_count INTEGER NOT NULL DEFAULT 0,
      share_count INTEGER NOT NULL DEFAULT 0,
      indexed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS videos_author_idx ON videos(author_did);
    CREATE INDEX IF NOT EXISTS videos_created_idx ON videos(created_at);
    CREATE INDEX IF NOT EXISTS videos_sound_idx ON videos(sound_uri);
    CREATE INDEX IF NOT EXISTS videos_visibility_idx ON videos(visibility);

    CREATE TABLE IF NOT EXISTS likes (
      uri TEXT PRIMARY KEY,
      cid TEXT NOT NULL,
      video_uri TEXT NOT NULL REFERENCES videos(uri) ON DELETE CASCADE,
      author_did TEXT NOT NULL REFERENCES users(did) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      indexed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS likes_video_idx ON likes(video_uri);
    CREATE INDEX IF NOT EXISTS likes_author_idx ON likes(author_did);
    CREATE UNIQUE INDEX IF NOT EXISTS likes_unique_idx ON likes(video_uri, author_did);

    CREATE TABLE IF NOT EXISTS comments (
      uri TEXT PRIMARY KEY,
      cid TEXT NOT NULL,
      video_uri TEXT NOT NULL REFERENCES videos(uri) ON DELETE CASCADE,
      parent_uri TEXT,
      author_did TEXT NOT NULL REFERENCES users(did) ON DELETE CASCADE,
      text TEXT NOT NULL,
      like_count INTEGER NOT NULL DEFAULT 0,
      reply_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      indexed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS comments_video_idx ON comments(video_uri);
    CREATE INDEX IF NOT EXISTS comments_parent_idx ON comments(parent_uri);
    CREATE INDEX IF NOT EXISTS comments_author_idx ON comments(author_did);
    CREATE INDEX IF NOT EXISTS comments_created_idx ON comments(created_at);

    CREATE TABLE IF NOT EXISTS follows (
      uri TEXT PRIMARY KEY,
      cid TEXT NOT NULL,
      follower_did TEXT NOT NULL REFERENCES users(did) ON DELETE CASCADE,
      followee_did TEXT NOT NULL REFERENCES users(did) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      indexed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS follows_follower_idx ON follows(follower_did);
    CREATE INDEX IF NOT EXISTS follows_followee_idx ON follows(followee_did);
    CREATE UNIQUE INDEX IF NOT EXISTS follows_unique_idx ON follows(follower_did, followee_did);

    CREATE TABLE IF NOT EXISTS sounds (
      id TEXT PRIMARY KEY,
      original_video_uri TEXT,
      title TEXT NOT NULL,
      artist TEXT,
      duration INTEGER,
      audio_url TEXT,
      cover_url TEXT,
      use_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS sounds_use_count_idx ON sounds(use_count);
    CREATE INDEX IF NOT EXISTS sounds_title_idx ON sounds(title);

    CREATE TABLE IF NOT EXISTS user_interactions (
      id TEXT PRIMARY KEY,
      user_did TEXT NOT NULL,
      video_uri TEXT NOT NULL,
      interaction_type TEXT NOT NULL,
      watch_duration INTEGER,
      completion_rate REAL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS interactions_user_idx ON user_interactions(user_did);
    CREATE INDEX IF NOT EXISTS interactions_video_idx ON user_interactions(video_uri);
    CREATE INDEX IF NOT EXISTS interactions_type_idx ON user_interactions(interaction_type);
    CREATE INDEX IF NOT EXISTS interactions_created_idx ON user_interactions(created_at);

    CREATE TABLE IF NOT EXISTS trending_videos (
      video_uri TEXT PRIMARY KEY REFERENCES videos(uri) ON DELETE CASCADE,
      score REAL NOT NULL,
      velocity REAL NOT NULL DEFAULT 0,
      rank INTEGER NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS trending_score_idx ON trending_videos(score);
    CREATE INDEX IF NOT EXISTS trending_rank_idx ON trending_videos(rank);

    CREATE TABLE IF NOT EXISTS video_embeddings (
      video_uri TEXT PRIMARY KEY REFERENCES videos(uri) ON DELETE CASCADE,
      embedding TEXT NOT NULL,
      model TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS upload_jobs (
      id TEXT PRIMARY KEY,
      user_did TEXT NOT NULL,
      status TEXT NOT NULL,
      progress INTEGER NOT NULL DEFAULT 0,
      input_key TEXT,
      cdn_url TEXT,
      hls_playlist TEXT,
      thumbnail_url TEXT,
      error TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS upload_jobs_user_idx ON upload_jobs(user_did);
    CREATE INDEX IF NOT EXISTS upload_jobs_status_idx ON upload_jobs(status);

    CREATE TABLE IF NOT EXISTS user_settings (
      user_did TEXT PRIMARY KEY REFERENCES users(did) ON DELETE CASCADE,
      theme_id TEXT NOT NULL DEFAULT 'slate',
      color_mode TEXT NOT NULL DEFAULT 'dark',
      accessibility TEXT,
      playback TEXT,
      notifications TEXT,
      privacy TEXT,
      content TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

async function initDatabase(): Promise<DatabaseConnection> {
  const databaseUrl = process.env.DATABASE_URL;

  // Try configured DATABASE_URL first
  if (databaseUrl) {
    const connection = await tryPostgresConnection(databaseUrl);
    if (connection) return connection;
  }

  // Try localhost PostgreSQL as failover
  if (!databaseUrl || databaseUrl !== DEFAULT_POSTGRES_URL) {
    const connection = await tryPostgresConnection(DEFAULT_POSTGRES_URL);
    if (connection) return connection;
  }

  // Fall back to SQLite
  console.log('No PostgreSQL available, falling back to SQLite');
  return initSqliteConnection();
}

// Initialize database connection
const connection = await initDatabase();

export const db = connection.db;
export const dbType = connection.type;
export const schema = connection.schema;

// Re-export schema types (use PostgreSQL types as canonical)
export * from './schema.js';
