import WebSocket from 'ws';
import { db, dbType } from '../db.js';
import { redis, cacheType } from '../cache.js';
import { COLLECTIONS } from '@exprsn/shared';
import { sql } from 'drizzle-orm';

const JETSTREAM_URL = process.env.JETSTREAM_URL || 'wss://jetstream2.us-east.bsky.network/subscribe';

interface JetstreamEvent {
  did: string;
  time_us: number;
  kind: 'commit' | 'identity' | 'account';
  commit?: {
    rev: string;
    operation: 'create' | 'update' | 'delete';
    collection: string;
    rkey: string;
    record?: unknown;
    cid?: string;
  };
}

export class JetstreamConsumer {
  private ws: WebSocket | null = null;
  private cursor: number | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(private collections: string[]) {}

  async start() {
    this.isRunning = true;

    // Try to restore cursor from Redis
    const savedCursor = await redis.get('jetstream:cursor');
    if (savedCursor) {
      this.cursor = parseInt(savedCursor, 10);
      console.log(`Resuming from cursor: ${this.cursor}`);
    }

    this.connect();
  }

  stop() {
    this.isRunning = false;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    if (this.ws) {
      this.ws.close();
    }
  }

  private connect() {
    const url = new URL(JETSTREAM_URL);

    for (const collection of this.collections) {
      url.searchParams.append('wantedCollections', collection);
    }

    if (this.cursor) {
      url.searchParams.set('cursor', this.cursor.toString());
    }

    console.log(`Connecting to Jetstream: ${url.toString()}`);

    this.ws = new WebSocket(url.toString());

    this.ws.on('open', () => {
      console.log('Connected to Jetstream');
    });

    this.ws.on('message', async (data: Buffer) => {
      try {
        const event: JetstreamEvent = JSON.parse(data.toString());
        await this.processEvent(event);

        // Update cursor
        this.cursor = event.time_us;

        // Save cursor periodically (every 1000 events)
        if (Math.random() < 0.001) {
          await redis.set('jetstream:cursor', this.cursor.toString());
        }
      } catch (error) {
        console.error('Error processing event:', error);
      }
    });

    this.ws.on('error', (error) => {
      console.error('Jetstream WebSocket error:', error);
    });

    this.ws.on('close', () => {
      console.log('Jetstream connection closed');
      if (this.isRunning) {
        this.scheduleReconnect();
      }
    });
  }

  private scheduleReconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    this.reconnectTimeout = setTimeout(() => {
      console.log('Reconnecting to Jetstream...');
      this.connect();
    }, 5000);
  }

  private async processEvent(event: JetstreamEvent) {
    // Skip event processing in SQLite mode - raw SQL queries are PostgreSQL-specific
    if (dbType === 'sqlite') {
      return;
    }

    if (event.kind !== 'commit' || !event.commit) {
      return;
    }

    const { did, commit } = event;
    const { operation, collection, rkey, record, cid } = commit;

    const uri = `at://${did}/${collection}/${rkey}`;

    try {
      switch (collection) {
        case COLLECTIONS.VIDEO_POST:
          if (operation === 'create' && record) {
            await this.handleVideoCreate(did, uri, cid!, record);
          } else if (operation === 'delete') {
            await this.handleVideoDelete(uri);
          }
          break;

        case COLLECTIONS.VIDEO_LIKE:
          if (operation === 'create' && record) {
            await this.handleLikeCreate(did, uri, cid!, record);
          } else if (operation === 'delete') {
            await this.handleLikeDelete(uri);
          }
          break;

        case COLLECTIONS.VIDEO_COMMENT:
          if (operation === 'create' && record) {
            await this.handleCommentCreate(did, uri, cid!, record);
          } else if (operation === 'delete') {
            await this.handleCommentDelete(uri);
          }
          break;

        case COLLECTIONS.VIDEO_FOLLOW:
          if (operation === 'create' && record) {
            await this.handleFollowCreate(did, uri, cid!, record);
          } else if (operation === 'delete') {
            await this.handleFollowDelete(uri);
          }
          break;
      }
    } catch (error) {
      console.error(`Error handling ${collection} ${operation}:`, error);
    }
  }

  private async handleVideoCreate(did: string, uri: string, cid: string, record: unknown) {
    const post = record as {
      video?: { cdnUrl?: string; hlsPlaylist?: string; thumbnail?: string; duration?: number; aspectRatio?: { width: number; height: number } };
      caption?: string;
      tags?: string[];
      soundUri?: string;
      visibility?: string;
      createdAt: string;
    };

    console.log(`Indexing video: ${uri}`);

    // Ensure user exists
    await this.ensureUser(did);

    // Insert video
    await db.execute(sql`
      INSERT INTO videos (uri, cid, author_did, caption, tags, sound_uri, cdn_url, hls_playlist, thumbnail_url, duration, aspect_ratio, visibility, created_at, indexed_at)
      VALUES (
        ${uri},
        ${cid},
        ${did},
        ${post.caption || null},
        ${JSON.stringify(post.tags || [])},
        ${post.soundUri || null},
        ${post.video?.cdnUrl || null},
        ${post.video?.hlsPlaylist || null},
        ${post.video?.thumbnail || null},
        ${post.video?.duration || null},
        ${JSON.stringify(post.video?.aspectRatio || { width: 9, height: 16 })},
        ${post.visibility || 'public'},
        ${new Date(post.createdAt)},
        NOW()
      )
      ON CONFLICT (uri) DO UPDATE SET
        cid = EXCLUDED.cid,
        caption = EXCLUDED.caption,
        tags = EXCLUDED.tags,
        indexed_at = NOW()
    `);

    // Increment user's video count
    await db.execute(sql`
      UPDATE users SET video_count = video_count + 1, updated_at = NOW()
      WHERE did = ${did}
    `);
  }

  private async handleVideoDelete(uri: string) {
    console.log(`Deleting video: ${uri}`);

    // Get author before deleting
    const result = await db.execute(sql`
      DELETE FROM videos WHERE uri = ${uri} RETURNING author_did
    `);

    if (result.length > 0) {
      const authorDid = (result[0] as { author_did: string }).author_did;
      await db.execute(sql`
        UPDATE users SET video_count = GREATEST(0, video_count - 1), updated_at = NOW()
        WHERE did = ${authorDid}
      `);
    }
  }

  private async handleLikeCreate(did: string, uri: string, cid: string, record: unknown) {
    const like = record as { subject: { uri: string; cid: string }; createdAt: string };

    console.log(`Indexing like: ${uri}`);

    await this.ensureUser(did);

    await db.execute(sql`
      INSERT INTO likes (uri, cid, video_uri, author_did, created_at, indexed_at)
      VALUES (${uri}, ${cid}, ${like.subject.uri}, ${did}, ${new Date(like.createdAt)}, NOW())
      ON CONFLICT (uri) DO NOTHING
    `);

    // Increment video's like count
    await db.execute(sql`
      UPDATE videos SET like_count = like_count + 1 WHERE uri = ${like.subject.uri}
    `);

    // Update cached counter
    await redis.incr(`counter:likes:${like.subject.uri}`);
  }

  private async handleLikeDelete(uri: string) {
    console.log(`Deleting like: ${uri}`);

    const result = await db.execute(sql`
      DELETE FROM likes WHERE uri = ${uri} RETURNING video_uri
    `);

    if (result.length > 0) {
      const videoUri = (result[0] as { video_uri: string }).video_uri;
      await db.execute(sql`
        UPDATE videos SET like_count = GREATEST(0, like_count - 1) WHERE uri = ${videoUri}
      `);
    }
  }

  private async handleCommentCreate(did: string, uri: string, cid: string, record: unknown) {
    const comment = record as {
      root: { uri: string; cid: string };
      parent?: { uri: string; cid: string };
      text: string;
      createdAt: string;
    };

    console.log(`Indexing comment: ${uri}`);

    await this.ensureUser(did);

    await db.execute(sql`
      INSERT INTO comments (uri, cid, video_uri, parent_uri, author_did, text, created_at, indexed_at)
      VALUES (
        ${uri},
        ${cid},
        ${comment.root.uri},
        ${comment.parent?.uri || null},
        ${did},
        ${comment.text},
        ${new Date(comment.createdAt)},
        NOW()
      )
      ON CONFLICT (uri) DO NOTHING
    `);

    // Increment video's comment count
    await db.execute(sql`
      UPDATE videos SET comment_count = comment_count + 1 WHERE uri = ${comment.root.uri}
    `);

    // If this is a reply, increment parent's reply count
    if (comment.parent?.uri) {
      await db.execute(sql`
        UPDATE comments SET reply_count = reply_count + 1 WHERE uri = ${comment.parent.uri}
      `);
    }
  }

  private async handleCommentDelete(uri: string) {
    console.log(`Deleting comment: ${uri}`);

    const result = await db.execute(sql`
      DELETE FROM comments WHERE uri = ${uri} RETURNING video_uri, parent_uri
    `);

    if (result.length > 0) {
      const { video_uri, parent_uri } = result[0] as { video_uri: string; parent_uri: string | null };

      await db.execute(sql`
        UPDATE videos SET comment_count = GREATEST(0, comment_count - 1) WHERE uri = ${video_uri}
      `);

      if (parent_uri) {
        await db.execute(sql`
          UPDATE comments SET reply_count = GREATEST(0, reply_count - 1) WHERE uri = ${parent_uri}
        `);
      }
    }
  }

  private async handleFollowCreate(did: string, uri: string, cid: string, record: unknown) {
    const follow = record as { subject: string; createdAt: string };

    console.log(`Indexing follow: ${uri}`);

    await this.ensureUser(did);
    await this.ensureUser(follow.subject);

    await db.execute(sql`
      INSERT INTO follows (uri, cid, follower_did, followee_did, created_at, indexed_at)
      VALUES (${uri}, ${cid}, ${did}, ${follow.subject}, ${new Date(follow.createdAt)}, NOW())
      ON CONFLICT (uri) DO NOTHING
    `);

    // Update follower counts
    await db.execute(sql`UPDATE users SET following_count = following_count + 1 WHERE did = ${did}`);
    await db.execute(sql`UPDATE users SET follower_count = follower_count + 1 WHERE did = ${follow.subject}`);
  }

  private async handleFollowDelete(uri: string) {
    console.log(`Deleting follow: ${uri}`);

    const result = await db.execute(sql`
      DELETE FROM follows WHERE uri = ${uri} RETURNING follower_did, followee_did
    `);

    if (result.length > 0) {
      const { follower_did, followee_did } = result[0] as {
        follower_did: string;
        followee_did: string;
      };

      await db.execute(sql`UPDATE users SET following_count = GREATEST(0, following_count - 1) WHERE did = ${follower_did}`);
      await db.execute(sql`UPDATE users SET follower_count = GREATEST(0, follower_count - 1) WHERE did = ${followee_did}`);
    }
  }

  private async ensureUser(did: string) {
    // TODO: Fetch profile from PDS if not exists
    await db.execute(sql`
      INSERT INTO users (did, handle, created_at, updated_at, indexed_at)
      VALUES (${did}, ${did}, NOW(), NOW(), NOW())
      ON CONFLICT (did) DO NOTHING
    `);
  }
}
