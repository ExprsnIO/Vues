import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import {
  liveStreams,
  streamChat,
  streamModerators,
  streamBannedUsers,
  streamViewers,
  users,
  follows,
} from '../db/schema.js';
import { eq, and, desc, sql, inArray, or, gt, lt } from 'drizzle-orm';
import {
  getStreamingProvider,
  generateStreamKey,
} from '../services/streaming/index.js';
import { authMiddleware, optionalAuthMiddleware } from '../auth/middleware.js';

// Middleware type for authenticated requests
type AuthContext = {
  Variables: {
    did: string;
  };
};

export const liveRoutes = new Hono<AuthContext>();

// ============================================
// Stream Management
// ============================================

// Create a new stream
liveRoutes.post('/io.exprsn.live.createStream', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const body = await c.req.json<{
    title: string;
    description?: string;
    category?: string;
    tags?: string[];
    visibility?: 'public' | 'followers' | 'private';
    chatEnabled?: boolean;
    recordingEnabled?: boolean;
    scheduledAt?: string;
  }>();

  if (!body.title || body.title.length < 1 || body.title.length > 100) {
    throw new HTTPException(400, { message: 'Title must be 1-100 characters' });
  }

  // Check if user already has an active stream
  const existingStream = await db
    .select()
    .from(liveStreams)
    .where(
      and(
        eq(liveStreams.userDid, userDid),
        inArray(liveStreams.status, ['scheduled', 'live'])
      )
    )
    .limit(1);

  if (existingStream[0]) {
    throw new HTTPException(409, { message: 'You already have an active stream' });
  }

  const streamId = nanoid();
  const streamKey = generateStreamKey();
  const now = new Date();

  // Get streaming provider info
  const provider = await getStreamingProvider();
  let providerInfo;

  try {
    providerInfo = await provider.createStream({
      title: body.title,
      description: body.description,
      category: body.category,
      tags: body.tags,
      recordingEnabled: body.recordingEnabled,
      chatEnabled: body.chatEnabled,
    });
  } catch (error) {
    console.error('Failed to create stream with provider:', error);
    // Continue without provider - will use internal stream key
  }

  await db.insert(liveStreams).values({
    id: streamId,
    userDid,
    title: body.title,
    description: body.description,
    status: body.scheduledAt ? 'scheduled' : 'idle' as 'scheduled' | 'live' | 'ended',
    streamKey: providerInfo?.streamKey || streamKey,
    ingestUrl: providerInfo?.ingestUrl,
    playbackUrl: providerInfo?.playbackUrl,
    provider: provider.type,
    providerStreamId: providerInfo?.providerStreamId,
    providerChannelArn: providerInfo?.providerChannelArn,
    category: body.category,
    tags: body.tags || [],
    visibility: body.visibility || 'public',
    chatEnabled: body.chatEnabled !== false,
    recordingEnabled: body.recordingEnabled !== false,
    scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
    createdAt: now,
    updatedAt: now,
  });

  return c.json({
    streamId,
    streamKey: providerInfo?.streamKey || streamKey,
    ingestUrl: providerInfo?.ingestUrl || `rtmp://live.exprsn.io/live/${streamKey}`,
    playbackUrl: providerInfo?.playbackUrl,
    status: body.scheduledAt ? 'scheduled' : 'idle',
  });
});

// Get stream details
liveRoutes.get('/io.exprsn.live.getStream', optionalAuthMiddleware, async (c) => {
  const userDid = c.get('did');
  const streamId = c.req.query('id');

  if (!streamId) {
    throw new HTTPException(400, { message: 'Stream ID required' });
  }

  const result = await db
    .select({
      stream: liveStreams,
      user: {
        did: users.did,
        handle: users.handle,
        displayName: users.displayName,
        avatar: users.avatar,
        followerCount: users.followerCount,
      },
    })
    .from(liveStreams)
    .innerJoin(users, eq(users.did, liveStreams.userDid))
    .where(eq(liveStreams.id, streamId))
    .limit(1);

  const data = result[0];
  if (!data) {
    throw new HTTPException(404, { message: 'Stream not found' });
  }

  const { stream, user } = data;

  // Check visibility
  if (stream.visibility === 'private' && stream.userDid !== userDid) {
    throw new HTTPException(403, { message: 'This stream is private' });
  }

  if (stream.visibility === 'followers' && stream.userDid !== userDid) {
    // Check if viewer follows the streamer
    const followResult = await db
      .select()
      .from(follows)
      .where(
        and(
          eq(follows.followerDid, userDid || ''),
          eq(follows.followeeDid, stream.userDid)
        )
      )
      .limit(1);

    if (!followResult[0]) {
      throw new HTTPException(403, { message: 'This stream is for followers only' });
    }
  }

  // Check if viewer is banned
  if (userDid) {
    const banResult = await db
      .select()
      .from(streamBannedUsers)
      .where(
        and(
          eq(streamBannedUsers.streamId, streamId),
          eq(streamBannedUsers.userDid, userDid),
          or(
            sql`${streamBannedUsers.expiresAt} IS NULL`,
            gt(streamBannedUsers.expiresAt, new Date())
          )
        )
      )
      .limit(1);

    if (banResult[0]) {
      throw new HTTPException(403, { message: 'You are banned from this stream' });
    }
  }

  // Check if viewer is moderator
  let isModerator = false;
  if (userDid) {
    const modResult = await db
      .select()
      .from(streamModerators)
      .where(
        and(
          eq(streamModerators.streamId, streamId),
          eq(streamModerators.userDid, userDid)
        )
      )
      .limit(1);

    isModerator = !!modResult[0];
  }

  // Only show stream key to the owner
  const isOwner = stream.userDid === userDid;

  return c.json({
    stream: {
      id: stream.id,
      title: stream.title,
      description: stream.description,
      status: stream.status,
      category: stream.category,
      tags: stream.tags,
      visibility: stream.visibility,
      viewerCount: stream.viewerCount,
      peakViewers: stream.peakViewers,
      chatEnabled: stream.chatEnabled,
      playbackUrl: stream.playbackUrl,
      thumbnailUrl: stream.thumbnailUrl,
      scheduledAt: stream.scheduledAt?.toISOString(),
      startedAt: stream.startedAt?.toISOString(),
      createdAt: stream.createdAt.toISOString(),
      // Only for owner
      ...(isOwner && {
        streamKey: stream.streamKey,
        ingestUrl: stream.ingestUrl,
        recordingEnabled: stream.recordingEnabled,
      }),
    },
    streamer: user,
    viewer: {
      isOwner,
      isModerator: isModerator || isOwner,
    },
  });
});

// Start streaming (mark as live)
liveRoutes.post('/io.exprsn.live.startStream', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const body = await c.req.json<{ streamId: string }>();
  if (!body.streamId) {
    throw new HTTPException(400, { message: 'Stream ID required' });
  }

  const result = await db
    .select()
    .from(liveStreams)
    .where(eq(liveStreams.id, body.streamId))
    .limit(1);

  const stream = result[0];
  if (!stream) {
    throw new HTTPException(404, { message: 'Stream not found' });
  }

  if (stream.userDid !== userDid) {
    throw new HTTPException(403, { message: 'Not your stream' });
  }

  if (stream.status === 'live') {
    throw new HTTPException(400, { message: 'Stream is already live' });
  }

  if (stream.status === 'ended') {
    throw new HTTPException(400, { message: 'Stream has ended' });
  }

  // Notify provider
  try {
    const provider = await getStreamingProvider();
    await provider.startStream(body.streamId);
  } catch (error) {
    console.error('Failed to start stream with provider:', error);
  }

  await db
    .update(liveStreams)
    .set({
      status: 'live',
      startedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(liveStreams.id, body.streamId));

  return c.json({ success: true, status: 'live' });
});

// End stream
liveRoutes.post('/io.exprsn.live.endStream', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const body = await c.req.json<{ streamId: string }>();
  if (!body.streamId) {
    throw new HTTPException(400, { message: 'Stream ID required' });
  }

  const result = await db
    .select()
    .from(liveStreams)
    .where(eq(liveStreams.id, body.streamId))
    .limit(1);

  const stream = result[0];
  if (!stream) {
    throw new HTTPException(404, { message: 'Stream not found' });
  }

  if (stream.userDid !== userDid) {
    throw new HTTPException(403, { message: 'Not your stream' });
  }

  if (stream.status === 'ended') {
    throw new HTTPException(400, { message: 'Stream already ended' });
  }

  // Notify provider
  try {
    const provider = await getStreamingProvider();
    await provider.endStream(body.streamId);
  } catch (error) {
    console.error('Failed to end stream with provider:', error);
  }

  await db
    .update(liveStreams)
    .set({
      status: 'ended',
      endedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(liveStreams.id, body.streamId));

  return c.json({ success: true, status: 'ended' });
});

// Update stream settings
liveRoutes.post('/io.exprsn.live.updateStream', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const body = await c.req.json<{
    streamId: string;
    title?: string;
    description?: string;
    category?: string;
    tags?: string[];
    visibility?: 'public' | 'followers' | 'private';
    chatEnabled?: boolean;
    thumbnailUrl?: string;
  }>();

  if (!body.streamId) {
    throw new HTTPException(400, { message: 'Stream ID required' });
  }

  const result = await db
    .select()
    .from(liveStreams)
    .where(eq(liveStreams.id, body.streamId))
    .limit(1);

  const stream = result[0];
  if (!stream) {
    throw new HTTPException(404, { message: 'Stream not found' });
  }

  if (stream.userDid !== userDid) {
    throw new HTTPException(403, { message: 'Not your stream' });
  }

  const updates: Partial<typeof liveStreams.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (body.title !== undefined) {
    if (body.title.length < 1 || body.title.length > 100) {
      throw new HTTPException(400, { message: 'Title must be 1-100 characters' });
    }
    updates.title = body.title;
  }
  if (body.description !== undefined) updates.description = body.description;
  if (body.category !== undefined) updates.category = body.category;
  if (body.tags !== undefined) updates.tags = body.tags;
  if (body.visibility !== undefined) updates.visibility = body.visibility;
  if (body.chatEnabled !== undefined) updates.chatEnabled = body.chatEnabled;
  if (body.thumbnailUrl !== undefined) updates.thumbnailUrl = body.thumbnailUrl;

  await db
    .update(liveStreams)
    .set(updates)
    .where(eq(liveStreams.id, body.streamId));

  return c.json({ success: true });
});

// Delete stream
liveRoutes.post('/io.exprsn.live.deleteStream', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const body = await c.req.json<{ streamId: string }>();
  if (!body.streamId) {
    throw new HTTPException(400, { message: 'Stream ID required' });
  }

  const result = await db
    .select()
    .from(liveStreams)
    .where(eq(liveStreams.id, body.streamId))
    .limit(1);

  const stream = result[0];
  if (!stream) {
    throw new HTTPException(404, { message: 'Stream not found' });
  }

  if (stream.userDid !== userDid) {
    throw new HTTPException(403, { message: 'Not your stream' });
  }

  // End stream if live
  if (stream.status === 'live') {
    try {
      const provider = await getStreamingProvider();
      await provider.endStream(body.streamId);
    } catch (error) {
      console.error('Failed to end stream with provider:', error);
    }
  }

  // Delete associated data
  await db.delete(streamChat).where(eq(streamChat.streamId, body.streamId));
  await db.delete(streamModerators).where(eq(streamModerators.streamId, body.streamId));
  await db.delete(streamBannedUsers).where(eq(streamBannedUsers.streamId, body.streamId));
  await db.delete(streamViewers).where(eq(streamViewers.streamId, body.streamId));

  // Delete provider stream
  try {
    const provider = await getStreamingProvider();
    await provider.deleteStream(body.streamId);
  } catch (error) {
    console.error('Failed to delete stream from provider:', error);
  }

  await db.delete(liveStreams).where(eq(liveStreams.id, body.streamId));

  return c.json({ success: true });
});

// ============================================
// Stream Discovery
// ============================================

// Get currently live streams
liveRoutes.get('/io.exprsn.live.getLiveNow', optionalAuthMiddleware, async (c) => {
  const limit = Math.min(parseInt(c.req.query('limit') || '20'), 50);
  const cursor = c.req.query('cursor');
  const category = c.req.query('category');

  let query = db
    .select({
      stream: liveStreams,
      user: {
        did: users.did,
        handle: users.handle,
        displayName: users.displayName,
        avatar: users.avatar,
      },
    })
    .from(liveStreams)
    .innerJoin(users, eq(users.did, liveStreams.userDid))
    .where(
      and(
        eq(liveStreams.status, 'live'),
        eq(liveStreams.visibility, 'public'),
        category ? eq(liveStreams.category, category) : undefined
      )
    )
    .orderBy(desc(liveStreams.viewerCount))
    .limit(limit + 1);

  if (cursor) {
    const parts = cursor.split(':');
    const viewerCountStr = parts[0] || '0';
    const streamId = parts[1] || '';
    // @ts-expect-error - Drizzle query chaining type issue
    query = query.where(
      and(
        eq(liveStreams.status, 'live'),
        eq(liveStreams.visibility, 'public'),
        or(
          lt(liveStreams.viewerCount, parseInt(viewerCountStr)),
          and(
            eq(liveStreams.viewerCount, parseInt(viewerCountStr)),
            lt(liveStreams.id, streamId)
          )
        )
      )
    ) as typeof query;
  }

  const results = await query;
  const hasMore = results.length > limit;
  const streams = hasMore ? results.slice(0, -1) : results;

  return c.json({
    streams: streams.map(({ stream, user }) => ({
      id: stream.id,
      title: stream.title,
      category: stream.category,
      tags: stream.tags,
      viewerCount: stream.viewerCount,
      thumbnailUrl: stream.thumbnailUrl,
      startedAt: stream.startedAt?.toISOString(),
      streamer: user,
    })),
    cursor: hasMore
      ? `${streams[streams.length - 1]?.stream.viewerCount}:${streams[streams.length - 1]?.stream.id}`
      : undefined,
  });
});

// Get scheduled streams
liveRoutes.get('/io.exprsn.live.getScheduled', optionalAuthMiddleware, async (c) => {
  const limit = Math.min(parseInt(c.req.query('limit') || '20'), 50);

  const results = await db
    .select({
      stream: liveStreams,
      user: {
        did: users.did,
        handle: users.handle,
        displayName: users.displayName,
        avatar: users.avatar,
      },
    })
    .from(liveStreams)
    .innerJoin(users, eq(users.did, liveStreams.userDid))
    .where(
      and(
        eq(liveStreams.status, 'scheduled'),
        eq(liveStreams.visibility, 'public'),
        gt(liveStreams.scheduledAt, new Date())
      )
    )
    .orderBy(liveStreams.scheduledAt)
    .limit(limit);

  return c.json({
    streams: results.map(({ stream, user }) => ({
      id: stream.id,
      title: stream.title,
      description: stream.description,
      category: stream.category,
      tags: stream.tags,
      thumbnailUrl: stream.thumbnailUrl,
      scheduledAt: stream.scheduledAt?.toISOString(),
      streamer: user,
    })),
  });
});

// Get user's streams (past and current)
liveRoutes.get('/io.exprsn.live.getUserStreams', optionalAuthMiddleware, async (c) => {
  const userDid = c.req.query('userDid');
  const limit = Math.min(parseInt(c.req.query('limit') || '20'), 50);
  const status = c.req.query('status'); // 'live' | 'ended' | 'scheduled'

  if (!userDid) {
    throw new HTTPException(400, { message: 'User DID required' });
  }

  const results = await db
    .select()
    .from(liveStreams)
    .where(
      and(
        eq(liveStreams.userDid, userDid),
        eq(liveStreams.visibility, 'public'),
        status ? eq(liveStreams.status, status as 'live' | 'ended' | 'scheduled') : undefined
      )
    )
    .orderBy(desc(liveStreams.createdAt))
    .limit(limit);

  return c.json({
    streams: results.map((stream) => ({
      id: stream.id,
      title: stream.title,
      status: stream.status,
      category: stream.category,
      viewerCount: stream.viewerCount,
      peakViewers: stream.peakViewers,
      totalViews: stream.totalViews,
      thumbnailUrl: stream.thumbnailUrl,
      recordingUrl: stream.recordingUrl,
      scheduledAt: stream.scheduledAt?.toISOString(),
      startedAt: stream.startedAt?.toISOString(),
      endedAt: stream.endedAt?.toISOString(),
      createdAt: stream.createdAt.toISOString(),
    })),
  });
});

// ============================================
// Chat
// ============================================

// Get chat messages
liveRoutes.get('/io.exprsn.live.chat.messages', optionalAuthMiddleware, async (c) => {
  const streamId = c.req.query('streamId');
  const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);
  const before = c.req.query('before'); // Message ID for pagination

  if (!streamId) {
    throw new HTTPException(400, { message: 'Stream ID required' });
  }

  let query = db
    .select({
      message: streamChat,
      user: {
        did: users.did,
        handle: users.handle,
        displayName: users.displayName,
        avatar: users.avatar,
      },
    })
    .from(streamChat)
    .innerJoin(users, eq(users.did, streamChat.userDid))
    .where(
      and(
        eq(streamChat.streamId, streamId),
        eq(streamChat.isDeleted, false)
      )
    )
    .orderBy(desc(streamChat.createdAt))
    .limit(limit);

  if (before) {
    // @ts-expect-error - Drizzle query chaining type issue
    query = query.where(
      and(
        eq(streamChat.streamId, streamId),
        eq(streamChat.isDeleted, false),
        lt(streamChat.id, before)
      )
    ) as typeof query;
  }

  const results = await query;

  return c.json({
    messages: results.reverse().map(({ message, user }) => ({
      id: message.id,
      message: message.message,
      type: message.messageType,
      user,
      createdAt: message.createdAt.toISOString(),
    })),
  });
});

// Send chat message
liveRoutes.post('/io.exprsn.live.chat.send', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const body = await c.req.json<{
    streamId: string;
    message: string;
  }>();

  if (!body.streamId || !body.message) {
    throw new HTTPException(400, { message: 'Stream ID and message required' });
  }

  if (body.message.length > 500) {
    throw new HTTPException(400, { message: 'Message too long (max 500 characters)' });
  }

  // Check if stream exists and has chat enabled
  const streamResult = await db
    .select()
    .from(liveStreams)
    .where(eq(liveStreams.id, body.streamId))
    .limit(1);

  const stream = streamResult[0];
  if (!stream) {
    throw new HTTPException(404, { message: 'Stream not found' });
  }

  if (!stream.chatEnabled) {
    throw new HTTPException(403, { message: 'Chat is disabled for this stream' });
  }

  if (stream.status !== 'live') {
    throw new HTTPException(400, { message: 'Stream is not live' });
  }

  // Check if user is banned
  const banResult = await db
    .select()
    .from(streamBannedUsers)
    .where(
      and(
        eq(streamBannedUsers.streamId, body.streamId),
        eq(streamBannedUsers.userDid, userDid),
        or(
          sql`${streamBannedUsers.expiresAt} IS NULL`,
          gt(streamBannedUsers.expiresAt, new Date())
        )
      )
    )
    .limit(1);

  if (banResult[0]) {
    throw new HTTPException(403, { message: 'You are banned from this chat' });
  }

  const messageId = nanoid();

  await db.insert(streamChat).values({
    id: messageId,
    streamId: body.streamId,
    userDid,
    message: body.message.trim(),
    messageType: 'text',
    createdAt: new Date(),
  });

  // Get user info for response
  const userResult = await db
    .select({
      did: users.did,
      handle: users.handle,
      displayName: users.displayName,
      avatar: users.avatar,
    })
    .from(users)
    .where(eq(users.did, userDid))
    .limit(1);

  return c.json({
    id: messageId,
    message: body.message.trim(),
    type: 'text',
    user: userResult[0],
    createdAt: new Date().toISOString(),
  });
});

// Delete chat message (moderator/owner only)
liveRoutes.post('/io.exprsn.live.chat.delete', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const body = await c.req.json<{
    streamId: string;
    messageId: string;
  }>();

  if (!body.streamId || !body.messageId) {
    throw new HTTPException(400, { message: 'Stream ID and message ID required' });
  }

  // Check if user is owner or moderator
  const streamResult = await db
    .select()
    .from(liveStreams)
    .where(eq(liveStreams.id, body.streamId))
    .limit(1);

  const stream = streamResult[0];
  if (!stream) {
    throw new HTTPException(404, { message: 'Stream not found' });
  }

  const isOwner = stream.userDid === userDid;

  if (!isOwner) {
    const modResult = await db
      .select()
      .from(streamModerators)
      .where(
        and(
          eq(streamModerators.streamId, body.streamId),
          eq(streamModerators.userDid, userDid)
        )
      )
      .limit(1);

    if (!modResult[0]) {
      throw new HTTPException(403, { message: 'Not authorized to delete messages' });
    }
  }

  await db
    .update(streamChat)
    .set({ isDeleted: true })
    .where(eq(streamChat.id, body.messageId));

  return c.json({ success: true });
});

// ============================================
// Moderation
// ============================================

// Add moderator
liveRoutes.post('/io.exprsn.live.moderators.add', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const body = await c.req.json<{
    streamId: string;
    moderatorDid: string;
  }>();

  if (!body.streamId || !body.moderatorDid) {
    throw new HTTPException(400, { message: 'Stream ID and moderator DID required' });
  }

  // Check if user is stream owner
  const streamResult = await db
    .select()
    .from(liveStreams)
    .where(eq(liveStreams.id, body.streamId))
    .limit(1);

  const stream = streamResult[0];
  if (!stream || stream.userDid !== userDid) {
    throw new HTTPException(403, { message: 'Only stream owner can add moderators' });
  }

  // Check if already a moderator
  const existingMod = await db
    .select()
    .from(streamModerators)
    .where(
      and(
        eq(streamModerators.streamId, body.streamId),
        eq(streamModerators.userDid, body.moderatorDid)
      )
    )
    .limit(1);

  if (existingMod[0]) {
    throw new HTTPException(409, { message: 'User is already a moderator' });
  }

  await db.insert(streamModerators).values({
    id: nanoid(),
    streamId: body.streamId,
    userDid: body.moderatorDid,
    addedBy: userDid,
    createdAt: new Date(),
  });

  return c.json({ success: true });
});

// Remove moderator
liveRoutes.post('/io.exprsn.live.moderators.remove', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const body = await c.req.json<{
    streamId: string;
    moderatorDid: string;
  }>();

  // Check if user is stream owner
  const streamResult = await db
    .select()
    .from(liveStreams)
    .where(eq(liveStreams.id, body.streamId))
    .limit(1);

  const stream = streamResult[0];
  if (!stream || stream.userDid !== userDid) {
    throw new HTTPException(403, { message: 'Only stream owner can remove moderators' });
  }

  await db
    .delete(streamModerators)
    .where(
      and(
        eq(streamModerators.streamId, body.streamId),
        eq(streamModerators.userDid, body.moderatorDid)
      )
    );

  return c.json({ success: true });
});

// Ban user from stream
liveRoutes.post('/io.exprsn.live.ban', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const body = await c.req.json<{
    streamId: string;
    targetDid: string;
    reason?: string;
    duration?: number; // Minutes, null for permanent
  }>();

  if (!body.streamId || !body.targetDid) {
    throw new HTTPException(400, { message: 'Stream ID and target DID required' });
  }

  // Check if user is owner or moderator
  const streamResult = await db
    .select()
    .from(liveStreams)
    .where(eq(liveStreams.id, body.streamId))
    .limit(1);

  const stream = streamResult[0];
  if (!stream) {
    throw new HTTPException(404, { message: 'Stream not found' });
  }

  const isOwner = stream.userDid === userDid;

  if (!isOwner) {
    const modResult = await db
      .select()
      .from(streamModerators)
      .where(
        and(
          eq(streamModerators.streamId, body.streamId),
          eq(streamModerators.userDid, userDid)
        )
      )
      .limit(1);

    if (!modResult[0]) {
      throw new HTTPException(403, { message: 'Not authorized to ban users' });
    }
  }

  // Can't ban the stream owner
  if (body.targetDid === stream.userDid) {
    throw new HTTPException(400, { message: 'Cannot ban the stream owner' });
  }

  const expiresAt = body.duration
    ? new Date(Date.now() + body.duration * 60 * 1000)
    : null;

  // Upsert ban
  await db
    .insert(streamBannedUsers)
    .values({
      id: nanoid(),
      streamId: body.streamId,
      userDid: body.targetDid,
      reason: body.reason,
      bannedBy: userDid,
      expiresAt,
      createdAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [streamBannedUsers.streamId, streamBannedUsers.userDid],
      set: {
        reason: body.reason,
        bannedBy: userDid,
        expiresAt,
        createdAt: new Date(),
      },
    });

  return c.json({ success: true });
});

// Unban user
liveRoutes.post('/io.exprsn.live.unban', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const body = await c.req.json<{
    streamId: string;
    targetDid: string;
  }>();

  // Check if user is owner or moderator
  const streamResult = await db
    .select()
    .from(liveStreams)
    .where(eq(liveStreams.id, body.streamId))
    .limit(1);

  const stream = streamResult[0];
  if (!stream) {
    throw new HTTPException(404, { message: 'Stream not found' });
  }

  const isOwner = stream.userDid === userDid;

  if (!isOwner) {
    const modResult = await db
      .select()
      .from(streamModerators)
      .where(
        and(
          eq(streamModerators.streamId, body.streamId),
          eq(streamModerators.userDid, userDid)
        )
      )
      .limit(1);

    if (!modResult[0]) {
      throw new HTTPException(403, { message: 'Not authorized to unban users' });
    }
  }

  await db
    .delete(streamBannedUsers)
    .where(
      and(
        eq(streamBannedUsers.streamId, body.streamId),
        eq(streamBannedUsers.userDid, body.targetDid)
      )
    );

  return c.json({ success: true });
});

// ============================================
// Stream Status & Recording
// ============================================

// Get stream status from provider
liveRoutes.get('/io.exprsn.live.getStreamStatus', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const streamId = c.req.query('streamId');
  if (!streamId) {
    throw new HTTPException(400, { message: 'Stream ID required' });
  }

  // Verify ownership
  const result = await db
    .select()
    .from(liveStreams)
    .where(eq(liveStreams.id, streamId))
    .limit(1);

  const stream = result[0];
  if (!stream) {
    throw new HTTPException(404, { message: 'Stream not found' });
  }

  if (stream.userDid !== userDid) {
    throw new HTTPException(403, { message: 'Not your stream' });
  }

  try {
    const provider = await getStreamingProvider();
    const status = await provider.getStreamStatus(streamId);

    return c.json({
      streamId,
      providerStatus: status,
      dbStatus: stream.status,
      viewerCount: stream.viewerCount,
      peakViewers: stream.peakViewers,
    });
  } catch (error) {
    return c.json({
      streamId,
      providerStatus: null,
      dbStatus: stream.status,
      viewerCount: stream.viewerCount,
      peakViewers: stream.peakViewers,
      error: 'Failed to get provider status',
    });
  }
});

// Get recording status (AWS IVS specific)
liveRoutes.get('/io.exprsn.live.getRecordingStatus', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const streamId = c.req.query('streamId');
  if (!streamId) {
    throw new HTTPException(400, { message: 'Stream ID required' });
  }

  // Verify ownership
  const result = await db
    .select()
    .from(liveStreams)
    .where(eq(liveStreams.id, streamId))
    .limit(1);

  const stream = result[0];
  if (!stream) {
    throw new HTTPException(404, { message: 'Stream not found' });
  }

  if (stream.userDid !== userDid) {
    throw new HTTPException(403, { message: 'Not your stream' });
  }

  try {
    const provider = await getStreamingProvider();

    // Check if provider supports recording status
    if ('getRecordingStatus' in provider && typeof provider.getRecordingStatus === 'function') {
      const recordingStatus = await provider.getRecordingStatus(streamId);
      return c.json({
        streamId,
        recordingEnabled: stream.recordingEnabled,
        ...recordingStatus,
      });
    }

    return c.json({
      streamId,
      recordingEnabled: stream.recordingEnabled,
      isRecording: false,
      message: 'Recording status not available for this provider',
    });
  } catch (error) {
    return c.json({
      streamId,
      recordingEnabled: stream.recordingEnabled,
      isRecording: false,
      error: 'Failed to get recording status',
    });
  }
});

// List past recordings
liveRoutes.get('/io.exprsn.live.listRecordings', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const streamId = c.req.query('streamId');
  const limit = Math.min(parseInt(c.req.query('limit') || '10'), 50);

  if (!streamId) {
    throw new HTTPException(400, { message: 'Stream ID required' });
  }

  // Verify ownership
  const result = await db
    .select()
    .from(liveStreams)
    .where(eq(liveStreams.id, streamId))
    .limit(1);

  const stream = result[0];
  if (!stream) {
    throw new HTTPException(404, { message: 'Stream not found' });
  }

  if (stream.userDid !== userDid) {
    throw new HTTPException(403, { message: 'Not your stream' });
  }

  try {
    const provider = await getStreamingProvider();

    // Check if provider supports listing recordings
    if ('listRecordings' in provider && typeof provider.listRecordings === 'function') {
      const recordings = await provider.listRecordings(streamId, limit);
      return c.json({
        streamId,
        recordings,
      });
    }

    return c.json({
      streamId,
      recordings: [],
      message: 'Recording list not available for this provider',
    });
  } catch (error) {
    return c.json({
      streamId,
      recordings: [],
      error: 'Failed to list recordings',
    });
  }
});

// Get stream metrics (bitrate, resolution, etc.)
liveRoutes.get('/io.exprsn.live.getStreamMetrics', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const streamId = c.req.query('streamId');
  if (!streamId) {
    throw new HTTPException(400, { message: 'Stream ID required' });
  }

  // Verify ownership
  const result = await db
    .select()
    .from(liveStreams)
    .where(eq(liveStreams.id, streamId))
    .limit(1);

  const stream = result[0];
  if (!stream) {
    throw new HTTPException(404, { message: 'Stream not found' });
  }

  if (stream.userDid !== userDid) {
    throw new HTTPException(403, { message: 'Not your stream' });
  }

  try {
    const provider = await getStreamingProvider();

    // Check if provider supports metrics
    if ('getStreamMetrics' in provider && typeof provider.getStreamMetrics === 'function') {
      const metrics = await provider.getStreamMetrics(streamId);
      return c.json({
        streamId,
        metrics,
      });
    }

    return c.json({
      streamId,
      metrics: null,
      message: 'Stream metrics not available for this provider',
    });
  } catch (error) {
    return c.json({
      streamId,
      metrics: null,
      error: 'Failed to get stream metrics',
    });
  }
});

// ============================================
// Viewer Tracking
// ============================================

// Join stream (track viewer)
liveRoutes.post('/io.exprsn.live.viewer.join', authMiddleware, async (c) => {
  const userDid = c.get('did');
  const body = await c.req.json<{
    streamId: string;
    sessionId: string;
  }>();

  if (!body.streamId || !body.sessionId) {
    throw new HTTPException(400, { message: 'Stream ID and session ID required' });
  }

  // Record viewer
  await db.insert(streamViewers).values({
    id: nanoid(),
    streamId: body.streamId,
    userDid: userDid || null,
    sessionId: body.sessionId,
    joinedAt: new Date(),
  });

  // Increment viewer count
  await db
    .update(liveStreams)
    .set({
      viewerCount: sql`${liveStreams.viewerCount} + 1`,
      peakViewers: sql`GREATEST(${liveStreams.peakViewers}, ${liveStreams.viewerCount} + 1)`,
      totalViews: sql`${liveStreams.totalViews} + 1`,
    })
    .where(eq(liveStreams.id, body.streamId));

  return c.json({ success: true });
});

// Leave stream
liveRoutes.post('/io.exprsn.live.viewer.leave', authMiddleware, async (c) => {
  const body = await c.req.json<{
    streamId: string;
    sessionId: string;
  }>();

  if (!body.streamId || !body.sessionId) {
    throw new HTTPException(400, { message: 'Stream ID and session ID required' });
  }

  // Update viewer record
  const now = new Date();
  await db
    .update(streamViewers)
    .set({
      leftAt: now,
      watchDuration: sql`EXTRACT(EPOCH FROM (${now} - ${streamViewers.joinedAt}))::integer`,
    })
    .where(
      and(
        eq(streamViewers.streamId, body.streamId),
        eq(streamViewers.sessionId, body.sessionId),
        sql`${streamViewers.leftAt} IS NULL`
      )
    );

  // Decrement viewer count
  await db
    .update(liveStreams)
    .set({
      viewerCount: sql`GREATEST(0, ${liveStreams.viewerCount} - 1)`,
    })
    .where(eq(liveStreams.id, body.streamId));

  return c.json({ success: true });
});

export default liveRoutes;
