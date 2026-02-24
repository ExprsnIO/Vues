import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { authMiddleware, optionalAuthMiddleware } from '../auth/middleware.js';
import { db, videos, videoReactions, users } from '../db/index.js';
import { eq, and, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export const reactionsRouter = new Hono();

// Valid reaction types
const VALID_REACTIONS = ['fire', 'love', 'laugh', 'wow', 'sad', 'angry'] as const;
type ReactionType = (typeof VALID_REACTIONS)[number];

// Map reaction types to their count columns
const REACTION_COLUMNS: Record<ReactionType, keyof typeof videos> = {
  fire: 'fireCount',
  love: 'loveCount',
  laugh: 'laughCount',
  wow: 'wowCount',
  sad: 'sadCount',
  angry: 'angryCount',
};

/**
 * Add a reaction to a video
 * POST /xrpc/io.exprsn.video.react
 */
reactionsRouter.post('/io.exprsn.video.react', authMiddleware, async (c) => {
  const { videoUri, reactionType } = await c.req.json();
  const userDid = c.get('did');

  if (!videoUri) {
    throw new HTTPException(400, { message: 'Video URI is required' });
  }

  if (!reactionType || !VALID_REACTIONS.includes(reactionType)) {
    throw new HTTPException(400, {
      message: `Invalid reaction type. Must be one of: ${VALID_REACTIONS.join(', ')}`,
    });
  }

  // Verify video exists
  const video = await db.query.videos.findFirst({
    where: eq(videos.uri, videoUri),
  });

  if (!video) {
    throw new HTTPException(404, { message: 'Video not found' });
  }

  // Check if this exact reaction already exists
  const existing = await db.query.videoReactions.findFirst({
    where: and(
      eq(videoReactions.videoUri, videoUri),
      eq(videoReactions.authorDid, userDid),
      eq(videoReactions.reactionType, reactionType)
    ),
  });

  if (existing) {
    throw new HTTPException(400, { message: 'Reaction already exists' });
  }

  const reactionId = nanoid();

  await db.insert(videoReactions).values({
    id: reactionId,
    videoUri,
    authorDid: userDid,
    reactionType,
    createdAt: new Date(),
  });

  // Increment the appropriate count column
  const countColumn = REACTION_COLUMNS[reactionType as ReactionType];
  await db
    .update(videos)
    .set({ [countColumn]: sql`${videos[countColumn]} + 1` })
    .where(eq(videos.uri, videoUri));

  return c.json({
    id: reactionId,
    videoUri,
    reactionType,
    createdAt: new Date().toISOString(),
  });
});

/**
 * Remove a reaction from a video
 * POST /xrpc/io.exprsn.video.unreact
 */
reactionsRouter.post('/io.exprsn.video.unreact', authMiddleware, async (c) => {
  const { videoUri, reactionType } = await c.req.json();
  const userDid = c.get('did');

  if (!videoUri) {
    throw new HTTPException(400, { message: 'Video URI is required' });
  }

  if (!reactionType || !VALID_REACTIONS.includes(reactionType)) {
    throw new HTTPException(400, {
      message: `Invalid reaction type. Must be one of: ${VALID_REACTIONS.join(', ')}`,
    });
  }

  const existing = await db.query.videoReactions.findFirst({
    where: and(
      eq(videoReactions.videoUri, videoUri),
      eq(videoReactions.authorDid, userDid),
      eq(videoReactions.reactionType, reactionType)
    ),
  });

  if (!existing) {
    throw new HTTPException(404, { message: 'Reaction not found' });
  }

  await db.delete(videoReactions).where(eq(videoReactions.id, existing.id));

  // Decrement the appropriate count column
  const countColumn = REACTION_COLUMNS[reactionType as ReactionType];
  await db
    .update(videos)
    .set({ [countColumn]: sql`GREATEST(${videos[countColumn]} - 1, 0)` })
    .where(eq(videos.uri, videoUri));

  return c.json({ success: true });
});

/**
 * Get reactions for a video
 * GET /xrpc/io.exprsn.video.getReactions
 */
reactionsRouter.get('/io.exprsn.video.getReactions', optionalAuthMiddleware, async (c) => {
  const videoUri = c.req.query('videoUri');
  const userDid = c.get('did');

  if (!videoUri) {
    throw new HTTPException(400, { message: 'Video URI is required' });
  }

  // Get video with reaction counts
  const video = await db.query.videos.findFirst({
    where: eq(videos.uri, videoUri),
  });

  if (!video) {
    throw new HTTPException(404, { message: 'Video not found' });
  }

  // Build reaction counts object
  const counts: Record<string, number> = {
    fire: video.fireCount,
    love: video.loveCount,
    laugh: video.laughCount,
    wow: video.wowCount,
    sad: video.sadCount,
    angry: video.angryCount,
  };

  // Get user's reactions if logged in
  let userReactions: string[] = [];
  if (userDid) {
    const reactions = await db.query.videoReactions.findMany({
      where: and(
        eq(videoReactions.videoUri, videoUri),
        eq(videoReactions.authorDid, userDid)
      ),
    });
    userReactions = reactions.map((r) => r.reactionType);
  }

  // Calculate total reactions
  const totalReactions = Object.values(counts).reduce((sum, count) => sum + count, 0);

  return c.json({
    videoUri,
    counts,
    totalReactions,
    userReactions,
  });
});

/**
 * Get all reaction types (for UI)
 * GET /xrpc/io.exprsn.video.getReactionTypes
 */
reactionsRouter.get('/io.exprsn.video.getReactionTypes', async (c) => {
  const reactionTypes = [
    { type: 'fire', emoji: '\u{1F525}', label: 'Fire' },
    { type: 'love', emoji: '\u{2764}\u{FE0F}', label: 'Love' },
    { type: 'laugh', emoji: '\u{1F602}', label: 'Laugh' },
    { type: 'wow', emoji: '\u{1F62E}', label: 'Wow' },
    { type: 'sad', emoji: '\u{1F622}', label: 'Sad' },
    { type: 'angry', emoji: '\u{1F620}', label: 'Angry' },
  ];

  return c.json({ reactionTypes });
});

export default reactionsRouter;
