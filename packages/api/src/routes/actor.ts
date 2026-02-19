import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { authMiddleware, optionalAuthMiddleware } from '../auth/middleware.js';
import { db, users, follows, blocks, mutes, videos, userPreferences } from '../db/index.js';
import { eq, desc, and, or, sql, like, ne } from 'drizzle-orm';
import { nanoid } from 'nanoid';

// S3 client for avatar uploads
const s3 = new S3Client({
  endpoint: process.env.DO_SPACES_ENDPOINT || `https://${process.env.DO_SPACES_REGION || 'nyc3'}.digitaloceanspaces.com`,
  region: process.env.DO_SPACES_REGION || 'nyc3',
  credentials: {
    accessKeyId: process.env.DO_SPACES_KEY || '',
    secretAccessKey: process.env.DO_SPACES_SECRET || '',
  },
  forcePathStyle: true,
});

export const actorRouter = new Hono();

// =============================================================================
// Profile Endpoints
// =============================================================================

/**
 * Get a user's profile
 * GET /xrpc/io.exprsn.actor.getProfile
 */
actorRouter.get('/io.exprsn.actor.getProfile', optionalAuthMiddleware, async (c) => {
  const did = c.req.query('did');
  const handle = c.req.query('handle');
  const viewerDid = c.get('did');

  if (!did && !handle) {
    throw new HTTPException(400, { message: 'Either did or handle is required' });
  }

  const user = await db.query.users.findFirst({
    where: did ? eq(users.did, did) : eq(users.handle, handle!),
  });

  if (!user) {
    throw new HTTPException(404, { message: 'User not found' });
  }

  // Get viewer relationship
  let viewer = undefined;
  if (viewerDid && viewerDid !== user.did) {
    const [followingRecord, followedByRecord, blockRecord, blockedByRecord, muteRecord] = await Promise.all([
      db.query.follows.findFirst({
        where: and(
          eq(follows.followerDid, viewerDid),
          eq(follows.followeeDid, user.did)
        ),
      }),
      db.query.follows.findFirst({
        where: and(
          eq(follows.followerDid, user.did),
          eq(follows.followeeDid, viewerDid)
        ),
      }),
      db.query.blocks.findFirst({
        where: and(
          eq(blocks.blockerDid, viewerDid),
          eq(blocks.blockedDid, user.did)
        ),
      }),
      // Check if the profile user has blocked the viewer
      db.query.blocks.findFirst({
        where: and(
          eq(blocks.blockerDid, user.did),
          eq(blocks.blockedDid, viewerDid)
        ),
      }),
      db.query.mutes.findFirst({
        where: and(
          eq(mutes.muterDid, viewerDid),
          eq(mutes.mutedDid, user.did)
        ),
      }),
    ]);

    viewer = {
      following: !!followingRecord,
      followedBy: !!followedByRecord,
      followUri: followingRecord?.uri,
      muting: !!muteRecord,
      blocking: !!blockRecord,
      blockUri: blockRecord?.uri,
      blockedBy: !!blockedByRecord,
    };
  }

  return c.json({
    profile: {
      did: user.did,
      handle: user.handle,
      displayName: user.displayName,
      bio: user.bio,
      avatar: user.avatar,
      followerCount: user.followerCount,
      followingCount: user.followingCount,
      videoCount: user.videoCount,
      verified: user.verified,
      createdAt: user.createdAt.toISOString(),
      viewer,
    },
  });
});

/**
 * Update the authenticated user's profile
 * POST /xrpc/io.exprsn.actor.updateProfile
 */
actorRouter.post('/io.exprsn.actor.updateProfile', authMiddleware, async (c) => {
  const userDid = c.get('did');
  const { displayName, bio } = await c.req.json();

  const updateData: Partial<{ displayName: string; bio: string; updatedAt: Date }> = {
    updatedAt: new Date(),
  };

  if (displayName !== undefined) {
    if (displayName.length > 64) {
      throw new HTTPException(400, { message: 'Display name too long (max 64 characters)' });
    }
    updateData.displayName = displayName;
  }

  if (bio !== undefined) {
    if (bio.length > 256) {
      throw new HTTPException(400, { message: 'Bio too long (max 256 characters)' });
    }
    updateData.bio = bio;
  }

  await db.update(users).set(updateData).where(eq(users.did, userDid));

  const updatedUser = await db.query.users.findFirst({
    where: eq(users.did, userDid),
  });

  return c.json({
    success: true,
    profile: {
      did: updatedUser!.did,
      handle: updatedUser!.handle,
      displayName: updatedUser!.displayName,
      bio: updatedUser!.bio,
      avatar: updatedUser!.avatar,
      followerCount: updatedUser!.followerCount,
      followingCount: updatedUser!.followingCount,
      videoCount: updatedUser!.videoCount,
      verified: updatedUser!.verified,
      createdAt: updatedUser!.createdAt.toISOString(),
    },
  });
});

/**
 * Get a presigned URL for avatar upload
 * POST /xrpc/io.exprsn.actor.getAvatarUploadUrl
 */
actorRouter.post('/io.exprsn.actor.getAvatarUploadUrl', authMiddleware, async (c) => {
  const userDid = c.get('did');
  const { contentType } = await c.req.json();

  if (!contentType || !contentType.startsWith('image/')) {
    throw new HTTPException(400, { message: 'Invalid content type. Must be an image.' });
  }

  // Only allow common image formats
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (!allowedTypes.includes(contentType)) {
    throw new HTTPException(400, { message: 'Unsupported image format. Use JPEG, PNG, GIF, or WebP.' });
  }

  const uploadKey = nanoid();
  const extension = contentType.split('/')[1] || 'jpg';
  const key = `avatars/${userDid}/${uploadKey}.${extension}`;

  const command = new PutObjectCommand({
    Bucket: process.env.DO_SPACES_BUCKET,
    Key: key,
    ContentType: contentType,
    ACL: 'public-read',
  });

  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });

  // Construct the public URL
  const cdnBase = process.env.CDN_BASE_URL || process.env.DO_SPACES_CDN_URL ||
    `https://${process.env.DO_SPACES_BUCKET}.${process.env.DO_SPACES_REGION || 'nyc3'}.digitaloceanspaces.com`;
  const avatarUrl = `${cdnBase}/${key}`;

  return c.json({
    uploadUrl,
    key,
    avatarUrl,
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
  });
});

/**
 * Complete avatar upload and update user profile
 * POST /xrpc/io.exprsn.actor.completeAvatarUpload
 */
actorRouter.post('/io.exprsn.actor.completeAvatarUpload', authMiddleware, async (c) => {
  const userDid = c.get('did');
  const { avatarUrl } = await c.req.json();

  if (!avatarUrl) {
    throw new HTTPException(400, { message: 'Avatar URL is required' });
  }

  // Update the user's avatar
  await db.update(users).set({
    avatar: avatarUrl,
    updatedAt: new Date(),
  }).where(eq(users.did, userDid));

  const updatedUser = await db.query.users.findFirst({
    where: eq(users.did, userDid),
  });

  return c.json({
    success: true,
    avatarUrl: updatedUser?.avatar,
  });
});

/**
 * Get suggested accounts to follow
 * GET /xrpc/io.exprsn.actor.getSuggestions
 */
actorRouter.get('/io.exprsn.actor.getSuggestions', optionalAuthMiddleware, async (c) => {
  const viewerDid = c.get('did');
  const limit = Math.min(parseInt(c.req.query('limit') || '25', 10), 100);
  const cursor = c.req.query('cursor');

  // Get popular users that the viewer doesn't follow
  let query = db
    .select()
    .from(users)
    .orderBy(desc(users.followerCount))
    .limit(limit);

  if (viewerDid) {
    // Exclude users the viewer already follows
    const followedDids = db
      .select({ did: follows.followeeDid })
      .from(follows)
      .where(eq(follows.followerDid, viewerDid));

    query = query.where(
      and(
        ne(users.did, viewerDid),
        sql`${users.did} NOT IN (${followedDids})`
      )
    ) as typeof query;
  }

  if (cursor) {
    const cursorCount = parseInt(cursor, 10);
    query = query.where(sql`${users.followerCount} < ${cursorCount}`) as typeof query;
  }

  const results = await query;

  const actors = results.map((user) => ({
    did: user.did,
    handle: user.handle,
    displayName: user.displayName,
    avatar: user.avatar,
    bio: user.bio,
    followerCount: user.followerCount,
    followingCount: user.followingCount,
    videoCount: user.videoCount,
    verified: user.verified,
  }));

  const nextCursor =
    results.length === limit
      ? results[results.length - 1].followerCount.toString()
      : undefined;

  return c.json({
    actors,
    cursor: nextCursor,
  });
});

/**
 * Search for users by handle or display name
 * GET /xrpc/io.exprsn.actor.searchActors
 */
actorRouter.get('/io.exprsn.actor.searchActors', async (c) => {
  const q = c.req.query('q');
  const limit = Math.min(parseInt(c.req.query('limit') || '25', 10), 100);
  const cursor = c.req.query('cursor');

  if (!q) {
    throw new HTTPException(400, { message: 'Search query is required' });
  }

  const searchPattern = `%${q.toLowerCase()}%`;

  let query = db
    .select()
    .from(users)
    .where(
      or(
        sql`LOWER(${users.handle}) LIKE ${searchPattern}`,
        sql`LOWER(${users.displayName}) LIKE ${searchPattern}`
      )
    )
    .orderBy(desc(users.followerCount))
    .limit(limit);

  if (cursor) {
    const cursorCount = parseInt(cursor, 10);
    query = query.where(sql`${users.followerCount} < ${cursorCount}`) as typeof query;
  }

  const results = await query;

  const actors = results.map((user) => ({
    did: user.did,
    handle: user.handle,
    displayName: user.displayName,
    avatar: user.avatar,
    bio: user.bio,
    followerCount: user.followerCount,
    followingCount: user.followingCount,
    videoCount: user.videoCount,
    verified: user.verified,
  }));

  const nextCursor =
    results.length === limit
      ? results[results.length - 1].followerCount.toString()
      : undefined;

  return c.json({
    actors,
    cursor: nextCursor,
  });
});

/**
 * Get user's videos
 * GET /xrpc/io.exprsn.actor.getVideos
 */
actorRouter.get('/io.exprsn.actor.getVideos', optionalAuthMiddleware, async (c) => {
  const did = c.req.query('did');
  const handle = c.req.query('handle');
  const limit = Math.min(parseInt(c.req.query('limit') || '30', 10), 100);
  const cursor = c.req.query('cursor');

  if (!did && !handle) {
    throw new HTTPException(400, { message: 'Either did or handle is required' });
  }

  // Find the user first
  const user = await db.query.users.findFirst({
    where: did ? eq(users.did, did) : eq(users.handle, handle!),
  });

  if (!user) {
    throw new HTTPException(404, { message: 'User not found' });
  }

  let query = db
    .select()
    .from(videos)
    .where(eq(videos.authorDid, user.did))
    .orderBy(desc(videos.createdAt))
    .limit(limit);

  if (cursor) {
    const cursorDate = new Date(cursor);
    query = query.where(sql`${videos.createdAt} < ${cursorDate}`) as typeof query;
  }

  const results = await query;

  const videoViews = results.map((video) => ({
    uri: video.uri,
    cid: video.cid,
    author: {
      did: user.did,
      handle: user.handle,
      displayName: user.displayName,
      avatar: user.avatar,
      verified: user.verified,
    },
    video: {
      thumbnail: video.thumbnailUrl,
      aspectRatio: video.aspectRatio,
      duration: video.duration,
      cdnUrl: video.cdnUrl,
      hlsPlaylist: video.hlsPlaylist,
    },
    caption: video.caption,
    tags: video.tags,
    viewCount: video.viewCount,
    likeCount: video.likeCount,
    commentCount: video.commentCount,
    shareCount: video.shareCount,
    repostCount: video.repostCount,
    bookmarkCount: video.bookmarkCount,
    createdAt: video.createdAt.toISOString(),
    indexedAt: video.indexedAt.toISOString(),
  }));

  const nextCursor =
    results.length === limit
      ? results[results.length - 1].createdAt.toISOString()
      : undefined;

  return c.json({
    videos: videoViews,
    cursor: nextCursor,
  });
});

// =============================================================================
// Preferences Endpoints
// =============================================================================

// Known preference types
const PREFERENCE_TYPES = {
  adultContentPref: 'io.exprsn.actor.getPreferences#adultContentPref',
  contentLabelPref: 'io.exprsn.actor.getPreferences#contentLabelPref',
  feedViewPref: 'io.exprsn.actor.getPreferences#feedViewPref',
  threadViewPref: 'io.exprsn.actor.getPreferences#threadViewPref',
  interestsPref: 'io.exprsn.actor.getPreferences#interestsPref',
  mutedWordsPref: 'io.exprsn.actor.getPreferences#mutedWordsPref',
  hiddenPostsPref: 'io.exprsn.actor.getPreferences#hiddenPostsPref',
} as const;

/**
 * Get the authenticated user's preferences
 * GET /xrpc/io.exprsn.actor.getPreferences
 */
actorRouter.get('/io.exprsn.actor.getPreferences', authMiddleware, async (c) => {
  const userDid = c.get('did');

  const prefs = await db.query.userPreferences.findMany({
    where: eq(userPreferences.userDid, userDid),
  });

  // Return preferences as array of objects with $type
  const preferences = prefs.map((pref) => ({
    ...pref.prefData,
    $type: pref.prefType,
  }));

  return c.json({
    preferences,
  });
});

/**
 * Set the authenticated user's preferences
 * POST /xrpc/io.exprsn.actor.putPreferences
 */
actorRouter.post('/io.exprsn.actor.putPreferences', authMiddleware, async (c) => {
  const userDid = c.get('did');
  const { preferences } = await c.req.json();

  if (!Array.isArray(preferences)) {
    throw new HTTPException(400, { message: 'Preferences must be an array' });
  }

  // Validate each preference has a $type
  for (const pref of preferences) {
    if (!pref.$type || typeof pref.$type !== 'string') {
      throw new HTTPException(400, { message: 'Each preference must have a $type' });
    }

    // Validate known preference types
    const validTypes = Object.values(PREFERENCE_TYPES);
    if (!validTypes.includes(pref.$type)) {
      throw new HTTPException(400, { message: `Unknown preference type: ${pref.$type}` });
    }
  }

  // Process each preference - upsert by type
  for (const pref of preferences) {
    const prefType = pref.$type;
    const { $type, ...prefData } = pref;

    // Check if preference exists
    const existing = await db.query.userPreferences.findFirst({
      where: and(
        eq(userPreferences.userDid, userDid),
        eq(userPreferences.prefType, prefType)
      ),
    });

    if (existing) {
      // Update existing preference
      await db
        .update(userPreferences)
        .set({
          prefData: { ...prefData, $type: prefType },
          updatedAt: new Date(),
        })
        .where(eq(userPreferences.id, existing.id));
    } else {
      // Insert new preference
      await db.insert(userPreferences).values({
        id: nanoid(),
        userDid,
        prefType,
        prefData: { ...prefData, $type: prefType },
      });
    }
  }

  return c.json({ success: true });
});
