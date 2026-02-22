import { Hono } from 'hono';
import { eq, and, gte, desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import * as schema from '../db/schema.js';
import { videos, likes, comments, follows, users } from '../db/schema.js';
import { ServiceAuth } from '../services/federation/ServiceAuth.js';

export const syncRouter = new Hono();

// Collection name to table mapping
const COLLECTIONS = {
  'io.exprsn.video.post': videos,
  'io.exprsn.video.like': likes,
  'io.exprsn.video.comment': comments,
  'io.exprsn.graph.follow': follows,
  'io.exprsn.actor.profile': users,
} as const;

type CollectionName = keyof typeof COLLECTIONS;

interface SyncRecord {
  uri: string;
  cid: string;
  collection: string;
  rkey: string;
  record: unknown;
  createdAt: string;
  updatedAt?: string;
}

// Lazy-initialize ServiceAuth to avoid circular dependency
let serviceAuthInstance: ServiceAuth | null = null;
function getServiceAuth(): ServiceAuth {
  if (!serviceAuthInstance) {
    serviceAuthInstance = new ServiceAuth({
      db: db as any, // Cast to avoid type issues with drizzle-orm
    });
  }
  return serviceAuthInstance;
}

/**
 * Verify service authentication for sync endpoints
 */
async function verifyServiceAuth(c: any): Promise<{ valid: boolean; error?: string }> {
  const certificateId = c.req.header('x-exprsn-certificate');
  const signature = c.req.header('x-exprsn-signature');
  const timestamp = c.req.header('x-exprsn-timestamp');
  const nonce = c.req.header('x-exprsn-nonce');

  if (!certificateId || !signature || !timestamp) {
    return { valid: false, error: 'Missing authentication headers' };
  }

  try {
    const serviceAuth = getServiceAuth();
    const body = await c.req.text().catch(() => '');

    const result = await serviceAuth.verifyRequest(
      {
        'x-exprsn-certificate': certificateId,
        'x-exprsn-signature': signature,
        'x-exprsn-timestamp': timestamp,
        'x-exprsn-nonce': nonce || '',
      },
      c.req.method,
      c.req.path,
      body || undefined
    );

    // verifyRequest returns AuthenticatedRequest | null
    if (result === null) {
      return { valid: false, error: 'Invalid authentication' };
    }

    return { valid: true };
  } catch (error) {
    return { valid: false, error: 'Authentication verification failed' };
  }
}

/**
 * Extract rkey from AT-URI
 * Format: at://did/collection/rkey
 */
function extractRkey(uri: string): string {
  const parts = uri.split('/');
  return parts[parts.length - 1] || '';
}

/**
 * GET io.exprsn.sync.getRecords
 * Get records from this server for synchronization
 */
syncRouter.get('/xrpc/io.exprsn.sync.getRecords', async (c) => {
  // Optional: Verify service authentication for production
  // const authResult = await verifyServiceAuth(c);
  // if (!authResult.valid) {
  //   return c.json({ error: 'Unauthorized', message: authResult.error }, 401);
  // }

  const collection = c.req.query('collection') as CollectionName | undefined;
  const since = c.req.query('since');
  const limit = Math.min(parseInt(c.req.query('limit') || '100', 10), 1000);
  const cursor = c.req.query('cursor');
  const did = c.req.query('did');

  const records: SyncRecord[] = [];
  let nextCursor: string | undefined;

  // Parse cursor (format: timestamp:uri)
  let cursorTime: Date | undefined;
  let cursorUri: string | undefined;
  if (cursor) {
    const [ts, uri] = cursor.split(':');
    if (ts) cursorTime = new Date(parseInt(ts, 10));
    cursorUri = uri;
  }

  const sinceDate = since ? new Date(since) : undefined;

  // Fetch from specific collection or all
  const collectionsToFetch = collection
    ? [collection]
    : Object.keys(COLLECTIONS) as CollectionName[];

  for (const collectionName of collectionsToFetch) {
    if (records.length >= limit) break;

    const remaining = limit - records.length;

    switch (collectionName) {
      case 'io.exprsn.video.post': {
        let conditions = [];
        if (sinceDate) conditions.push(gte(videos.createdAt, sinceDate));
        if (did) conditions.push(eq(videos.authorDid, did));

        const videoRecords = await db
          .select()
          .from(videos)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(videos.createdAt))
          .limit(remaining + 1);

        for (const video of videoRecords.slice(0, remaining)) {
          records.push({
            uri: video.uri,
            cid: video.cid,
            collection: collectionName,
            rkey: extractRkey(video.uri),
            record: {
              $type: 'io.exprsn.video.post',
              caption: video.caption,
              tags: video.tags,
              soundUri: video.soundUri,
              cdnUrl: video.cdnUrl,
              hlsPlaylist: video.hlsPlaylist,
              thumbnailUrl: video.thumbnailUrl,
              duration: video.duration,
              aspectRatio: video.aspectRatio,
              visibility: video.visibility,
              allowDuet: video.allowDuet,
              allowStitch: video.allowStitch,
              allowComments: video.allowComments,
              createdAt: video.createdAt.toISOString(),
            },
            createdAt: video.createdAt.toISOString(),
            updatedAt: video.indexedAt.toISOString(),
          });
        }

        if (videoRecords.length > remaining) {
          const last = videoRecords[remaining - 1];
          if (last) {
            nextCursor = `${last.createdAt.getTime()}:${last.uri}`;
          }
        }
        break;
      }

      case 'io.exprsn.video.like': {
        let conditions = [];
        if (sinceDate) conditions.push(gte(likes.createdAt, sinceDate));
        if (did) conditions.push(eq(likes.authorDid, did));

        const likeRecords = await db
          .select()
          .from(likes)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(likes.createdAt))
          .limit(remaining + 1);

        for (const like of likeRecords.slice(0, remaining)) {
          records.push({
            uri: like.uri,
            cid: like.cid,
            collection: collectionName,
            rkey: extractRkey(like.uri),
            record: {
              $type: 'io.exprsn.video.like',
              subject: { uri: like.videoUri },
              createdAt: like.createdAt.toISOString(),
            },
            createdAt: like.createdAt.toISOString(),
            updatedAt: like.indexedAt.toISOString(),
          });
        }

        if (likeRecords.length > remaining) {
          const last = likeRecords[remaining - 1];
          if (last) {
            nextCursor = `${last.createdAt.getTime()}:${last.uri}`;
          }
        }
        break;
      }

      case 'io.exprsn.video.comment': {
        let conditions = [];
        if (sinceDate) conditions.push(gte(comments.createdAt, sinceDate));
        if (did) conditions.push(eq(comments.authorDid, did));

        const commentRecords = await db
          .select()
          .from(comments)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(comments.createdAt))
          .limit(remaining + 1);

        for (const comment of commentRecords.slice(0, remaining)) {
          records.push({
            uri: comment.uri,
            cid: comment.cid,
            collection: collectionName,
            rkey: extractRkey(comment.uri),
            record: {
              $type: 'io.exprsn.video.comment',
              text: comment.text,
              root: { uri: comment.videoUri },
              parent: comment.parentUri ? { uri: comment.parentUri } : undefined,
              createdAt: comment.createdAt.toISOString(),
            },
            createdAt: comment.createdAt.toISOString(),
            updatedAt: comment.indexedAt.toISOString(),
          });
        }

        if (commentRecords.length > remaining) {
          const last = commentRecords[remaining - 1];
          if (last) {
            nextCursor = `${last.createdAt.getTime()}:${last.uri}`;
          }
        }
        break;
      }

      case 'io.exprsn.graph.follow': {
        let conditions = [];
        if (sinceDate) conditions.push(gte(follows.createdAt, sinceDate));
        if (did) conditions.push(eq(follows.followerDid, did));

        const followRecords = await db
          .select()
          .from(follows)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(follows.createdAt))
          .limit(remaining + 1);

        for (const follow of followRecords.slice(0, remaining)) {
          records.push({
            uri: follow.uri,
            cid: follow.cid,
            collection: collectionName,
            rkey: extractRkey(follow.uri),
            record: {
              $type: 'io.exprsn.graph.follow',
              subject: follow.followeeDid,
              createdAt: follow.createdAt.toISOString(),
            },
            createdAt: follow.createdAt.toISOString(),
            updatedAt: follow.indexedAt.toISOString(),
          });
        }

        if (followRecords.length > remaining) {
          const last = followRecords[remaining - 1];
          if (last) {
            nextCursor = `${last.createdAt.getTime()}:${last.uri}`;
          }
        }
        break;
      }

      case 'io.exprsn.actor.profile': {
        let conditions = [];
        if (sinceDate) conditions.push(gte(users.updatedAt, sinceDate));
        if (did) conditions.push(eq(users.did, did));

        const userRecords = await db
          .select()
          .from(users)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(users.updatedAt))
          .limit(remaining + 1);

        for (const user of userRecords.slice(0, remaining)) {
          records.push({
            uri: `at://${user.did}/io.exprsn.actor.profile/self`,
            cid: '', // Profiles don't have CIDs in our cache
            collection: collectionName,
            rkey: 'self',
            record: {
              $type: 'io.exprsn.actor.profile',
              handle: user.handle,
              displayName: user.displayName,
              description: user.bio,
              avatar: user.avatar,
              website: user.website,
              location: user.location,
              socialLinks: user.socialLinks,
            },
            createdAt: user.createdAt.toISOString(),
            updatedAt: user.updatedAt.toISOString(),
          });
        }

        if (userRecords.length > remaining) {
          const last = userRecords[remaining - 1];
          if (last) {
            nextCursor = `${last.updatedAt.getTime()}:${last.did}`;
          }
        }
        break;
      }
    }
  }

  return c.json({
    records,
    cursor: nextCursor,
  });
});

/**
 * POST io.exprsn.sync.pushRecords
 * Receive records from a remote server for synchronization
 */
syncRouter.post('/xrpc/io.exprsn.sync.pushRecords', async (c) => {
  // Verify service authentication
  const authResult = await verifyServiceAuth(c);
  if (!authResult.valid) {
    return c.json({ error: 'Unauthorized', message: authResult.error }, 401);
  }

  const body = await c.req.json<{ records: SyncRecord[] }>();

  if (!body.records || !Array.isArray(body.records)) {
    return c.json({ error: 'InvalidRequest', message: 'Missing records array' }, 400);
  }

  if (body.records.length > 100) {
    return c.json({ error: 'RateLimitExceeded', message: 'Maximum 100 records per request' }, 429);
  }

  let processed = 0;
  let failed = 0;
  const errors: { uri: string; error: string }[] = [];

  for (const record of body.records) {
    try {
      const recordData = record.record as { $type?: string; [key: string]: unknown };
      const recordType = recordData.$type || record.collection;

      switch (recordType) {
        case 'io.exprsn.video.post': {
          // Extract author DID from URI
          const uriParts = record.uri.split('/');
          const authorDid = uriParts[2];

          if (!authorDid) {
            throw new Error('Invalid URI: missing author DID');
          }

          // Ensure user exists
          await db
            .insert(users)
            .values({
              did: authorDid,
              handle: authorDid, // Placeholder handle
              createdAt: new Date(),
              updatedAt: new Date(),
              indexedAt: new Date(),
            })
            .onConflictDoNothing();

          await db
            .insert(videos)
            .values({
              uri: record.uri,
              cid: record.cid,
              authorDid,
              caption: recordData.caption as string,
              tags: (recordData.tags as string[]) || [],
              soundUri: recordData.soundUri as string,
              cdnUrl: recordData.cdnUrl as string,
              hlsPlaylist: recordData.hlsPlaylist as string,
              thumbnailUrl: recordData.thumbnailUrl as string,
              duration: recordData.duration as number,
              aspectRatio: recordData.aspectRatio as { width: number; height: number },
              visibility: (recordData.visibility as string) || 'public',
              allowDuet: (recordData.allowDuet as boolean) ?? true,
              allowStitch: (recordData.allowStitch as boolean) ?? true,
              allowComments: (recordData.allowComments as boolean) ?? true,
              createdAt: new Date(record.createdAt),
              indexedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: videos.uri,
              set: {
                cid: record.cid,
                caption: recordData.caption as string,
                tags: (recordData.tags as string[]) || [],
                indexedAt: new Date(),
              },
            });

          processed++;
          break;
        }

        case 'io.exprsn.video.like': {
          const uriParts = record.uri.split('/');
          const authorDid = uriParts[2];
          const subject = recordData.subject as { uri?: string };

          if (!authorDid || !subject?.uri) {
            throw new Error('Invalid like record');
          }

          await db
            .insert(likes)
            .values({
              uri: record.uri,
              cid: record.cid,
              authorDid,
              videoUri: subject.uri,
              createdAt: new Date(record.createdAt),
              indexedAt: new Date(),
            })
            .onConflictDoNothing();

          processed++;
          break;
        }

        case 'io.exprsn.video.comment': {
          const uriParts = record.uri.split('/');
          const authorDid = uriParts[2];
          const root = recordData.root as { uri?: string };
          const parent = recordData.parent as { uri?: string } | undefined;

          if (!authorDid || !root?.uri) {
            throw new Error('Invalid comment record');
          }

          await db
            .insert(comments)
            .values({
              uri: record.uri,
              cid: record.cid,
              authorDid,
              videoUri: root.uri,
              parentUri: parent?.uri,
              text: recordData.text as string,
              createdAt: new Date(record.createdAt),
              indexedAt: new Date(),
            })
            .onConflictDoNothing();

          processed++;
          break;
        }

        case 'io.exprsn.graph.follow': {
          const uriParts = record.uri.split('/');
          const followerDid = uriParts[2];
          const followeeDid = recordData.subject as string;

          if (!followerDid || !followeeDid) {
            throw new Error('Invalid follow record');
          }

          await db
            .insert(follows)
            .values({
              uri: record.uri,
              cid: record.cid,
              followerDid,
              followeeDid,
              createdAt: new Date(record.createdAt),
              indexedAt: new Date(),
            })
            .onConflictDoNothing();

          processed++;
          break;
        }

        case 'io.exprsn.actor.profile': {
          const uriParts = record.uri.split('/');
          const did = uriParts[2];

          if (!did) {
            throw new Error('Invalid profile record');
          }

          await db
            .insert(users)
            .values({
              did,
              handle: (recordData.handle as string) || did,
              displayName: recordData.displayName as string,
              bio: recordData.description as string,
              avatar: recordData.avatar as string,
              website: recordData.website as string,
              location: recordData.location as string,
              socialLinks: recordData.socialLinks as any,
              createdAt: new Date(record.createdAt),
              updatedAt: new Date(record.updatedAt || record.createdAt),
              indexedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: users.did,
              set: {
                handle: (recordData.handle as string) || undefined,
                displayName: recordData.displayName as string,
                bio: recordData.description as string,
                avatar: recordData.avatar as string,
                website: recordData.website as string,
                location: recordData.location as string,
                socialLinks: recordData.socialLinks as any,
                updatedAt: new Date(record.updatedAt || record.createdAt),
                indexedAt: new Date(),
              },
            });

          processed++;
          break;
        }

        default:
          throw new Error(`Unknown collection type: ${recordType}`);
      }
    } catch (error) {
      failed++;
      errors.push({
        uri: record.uri,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return c.json({
    processed,
    failed,
    errors: errors.length > 0 ? errors : undefined,
  });
});

/**
 * GET io.exprsn.sync.getStatus
 * Get sync status and capabilities
 */
syncRouter.get('/xrpc/io.exprsn.sync.getStatus', async (c) => {
  const collections = Object.keys(COLLECTIONS);

  // Get record counts
  const counts: Record<string, number> = {};

  const [videoCount] = await db.select({ count: db.$count(videos) }).from(videos);
  const [likeCount] = await db.select({ count: db.$count(likes) }).from(likes);
  const [commentCount] = await db.select({ count: db.$count(comments) }).from(comments);
  const [followCount] = await db.select({ count: db.$count(follows) }).from(follows);
  const [userCount] = await db.select({ count: db.$count(users) }).from(users);

  counts['io.exprsn.video.post'] = videoCount?.count || 0;
  counts['io.exprsn.video.like'] = likeCount?.count || 0;
  counts['io.exprsn.video.comment'] = commentCount?.count || 0;
  counts['io.exprsn.graph.follow'] = followCount?.count || 0;
  counts['io.exprsn.actor.profile'] = userCount?.count || 0;

  return c.json({
    collections,
    counts,
    capabilities: {
      getRecords: true,
      pushRecords: true,
      maxBatchSize: 100,
      supportsIncrementalSync: true,
    },
  });
});

export default syncRouter;
