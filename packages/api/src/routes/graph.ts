import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { authMiddleware, optionalAuthMiddleware } from '../auth/middleware.js';
import { db, users, follows, lists, listItems } from '../db/index.js';
import { eq, desc, and, sql, or } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getNotificationService } from '../services/notifications/index.js';

export const graphRouter = new Hono();

// =============================================================================
// Follow Endpoints
// =============================================================================

/**
 * Follow a user
 * POST /xrpc/io.exprsn.graph.follow
 */
graphRouter.post('/io.exprsn.graph.follow', authMiddleware, async (c) => {
  const { did } = await c.req.json();
  const userDid = c.get('did');

  if (!did) {
    throw new HTTPException(400, { message: 'User DID is required' });
  }

  if (did === userDid) {
    throw new HTTPException(400, { message: 'Cannot follow yourself' });
  }

  // Check if target user exists
  const targetUser = await db.query.users.findFirst({
    where: eq(users.did, did),
  });

  if (!targetUser) {
    throw new HTTPException(404, { message: 'User not found' });
  }

  // Check if already following
  const existing = await db.query.follows.findFirst({
    where: and(eq(follows.followerDid, userDid), eq(follows.followeeDid, did)),
  });

  if (existing) {
    throw new HTTPException(400, { message: 'Already following' });
  }

  const followId = nanoid();
  const followUri = `at://${userDid}/io.exprsn.graph.follow/${followId}`;

  await db.insert(follows).values({
    uri: followUri,
    cid: nanoid(),
    followerDid: userDid,
    followeeDid: did,
    createdAt: new Date(),
  });

  // Update follow counts
  await db
    .update(users)
    .set({ followingCount: sql`${users.followingCount} + 1` })
    .where(eq(users.did, userDid));

  await db
    .update(users)
    .set({ followerCount: sql`${users.followerCount} + 1` })
    .where(eq(users.did, did));

  // Send follow notification email (non-blocking)
  const follower = await db.query.users.findFirst({
    where: eq(users.did, userDid),
  });

  if (follower) {
    getNotificationService().sendFollowNotification(did, {
      did: follower.did,
      handle: follower.handle,
      displayName: follower.displayName || undefined,
      avatar: follower.avatar || undefined,
    }).catch((err) => console.error('Failed to send follow notification:', err));
  }

  return c.json({ uri: followUri });
});

/**
 * Unfollow a user
 * POST /xrpc/io.exprsn.graph.unfollow
 */
graphRouter.post('/io.exprsn.graph.unfollow', authMiddleware, async (c) => {
  const { did } = await c.req.json();
  const userDid = c.get('did');

  if (!did) {
    throw new HTTPException(400, { message: 'User DID is required' });
  }

  const existing = await db.query.follows.findFirst({
    where: and(eq(follows.followerDid, userDid), eq(follows.followeeDid, did)),
  });

  if (!existing) {
    throw new HTTPException(404, { message: 'Follow not found' });
  }

  await db.delete(follows).where(eq(follows.uri, existing.uri));

  // Update follow counts
  await db
    .update(users)
    .set({ followingCount: sql`GREATEST(${users.followingCount} - 1, 0)` })
    .where(eq(users.did, userDid));

  await db
    .update(users)
    .set({ followerCount: sql`GREATEST(${users.followerCount} - 1, 0)` })
    .where(eq(users.did, did));

  return c.json({ success: true });
});

/**
 * Get followers for a user
 * GET /xrpc/io.exprsn.graph.getFollowers
 */
graphRouter.get('/io.exprsn.graph.getFollowers', optionalAuthMiddleware, async (c) => {
  const did = c.req.query('did');
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 100);
  const cursor = c.req.query('cursor');
  const viewerDid = c.get('did');

  if (!did) {
    throw new HTTPException(400, { message: 'User DID is required' });
  }

  // Verify user exists
  const targetUser = await db.query.users.findFirst({
    where: eq(users.did, did),
  });

  if (!targetUser) {
    throw new HTTPException(404, { message: 'User not found' });
  }

  const conditions = [eq(follows.followeeDid, did)];
  if (cursor) {
    const cursorDate = new Date(cursor);
    conditions.push(sql`${follows.createdAt} < ${cursorDate}`);
  }

  const results = await db
    .select({
      follow: follows,
      user: users,
    })
    .from(follows)
    .innerJoin(users, eq(follows.followerDid, users.did))
    .where(and(...conditions))
    .orderBy(desc(follows.createdAt))
    .limit(limit);

  // If viewer is logged in, check if they follow each user
  let viewerFollows: Set<string> = new Set();
  if (viewerDid) {
    const viewerFollowsQuery = await db
      .select({ followeeDid: follows.followeeDid })
      .from(follows)
      .where(
        and(
          eq(follows.followerDid, viewerDid),
          sql`${follows.followeeDid} IN (${sql.join(
            results.map((r) => sql`${r.user.did}`),
            sql`, `
          )})`
        )
      );
    viewerFollows = new Set(viewerFollowsQuery.map((f) => f.followeeDid));
  }

  const lastFollowerResult = results[results.length - 1];
  const nextCursor =
    results.length === limit && lastFollowerResult
      ? lastFollowerResult.follow.createdAt.toISOString()
      : undefined;

  return c.json({
    subject: {
      did: targetUser.did,
      handle: targetUser.handle,
      displayName: targetUser.displayName,
      avatar: targetUser.avatar,
    },
    followers: results.map((r) => ({
      did: r.user.did,
      handle: r.user.handle,
      displayName: r.user.displayName,
      avatar: r.user.avatar,
      bio: r.user.bio,
      followedAt: r.follow.createdAt.toISOString(),
      viewer: viewerDid
        ? {
            following: viewerFollows.has(r.user.did),
          }
        : undefined,
    })),
    cursor: nextCursor,
  });
});

/**
 * Get users that a user follows
 * GET /xrpc/io.exprsn.graph.getFollowing
 */
graphRouter.get('/io.exprsn.graph.getFollowing', optionalAuthMiddleware, async (c) => {
  const did = c.req.query('did');
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 100);
  const cursor = c.req.query('cursor');
  const viewerDid = c.get('did');

  if (!did) {
    throw new HTTPException(400, { message: 'User DID is required' });
  }

  // Verify user exists
  const targetUser = await db.query.users.findFirst({
    where: eq(users.did, did),
  });

  if (!targetUser) {
    throw new HTTPException(404, { message: 'User not found' });
  }

  const followingConditions = [eq(follows.followerDid, did)];
  if (cursor) {
    const cursorDate = new Date(cursor);
    followingConditions.push(sql`${follows.createdAt} < ${cursorDate}`);
  }

  const results = await db
    .select({
      follow: follows,
      user: users,
    })
    .from(follows)
    .innerJoin(users, eq(follows.followeeDid, users.did))
    .where(and(...followingConditions))
    .orderBy(desc(follows.createdAt))
    .limit(limit);

  // If viewer is logged in, check if they follow each user
  let viewerFollows: Set<string> = new Set();
  if (viewerDid && results.length > 0) {
    const viewerFollowsQuery = await db
      .select({ followeeDid: follows.followeeDid })
      .from(follows)
      .where(
        and(
          eq(follows.followerDid, viewerDid),
          sql`${follows.followeeDid} IN (${sql.join(
            results.map((r) => sql`${r.user.did}`),
            sql`, `
          )})`
        )
      );
    viewerFollows = new Set(viewerFollowsQuery.map((f) => f.followeeDid));
  }

  const lastFollowingResult = results[results.length - 1];
  const nextCursor =
    results.length === limit && lastFollowingResult
      ? lastFollowingResult.follow.createdAt.toISOString()
      : undefined;

  return c.json({
    subject: {
      did: targetUser.did,
      handle: targetUser.handle,
      displayName: targetUser.displayName,
      avatar: targetUser.avatar,
    },
    following: results.map((r) => ({
      did: r.user.did,
      handle: r.user.handle,
      displayName: r.user.displayName,
      avatar: r.user.avatar,
      bio: r.user.bio,
      followedAt: r.follow.createdAt.toISOString(),
      viewer: viewerDid
        ? {
            following: viewerFollows.has(r.user.did),
          }
        : undefined,
    })),
    cursor: nextCursor,
  });
});

// =============================================================================
// List Endpoints
// =============================================================================

/**
 * Create a list
 * POST /xrpc/io.exprsn.graph.createList
 */
graphRouter.post('/io.exprsn.graph.createList', authMiddleware, async (c) => {
  const { name, description, avatar, purpose } = await c.req.json();
  const userDid = c.get('did');

  if (!name) {
    throw new HTTPException(400, { message: 'List name is required' });
  }

  if (!purpose) {
    throw new HTTPException(400, { message: 'List purpose is required' });
  }

  const validPurposes = ['curatelist', 'modlist', 'referencelist'];
  if (!validPurposes.includes(purpose)) {
    throw new HTTPException(400, { message: `Invalid purpose. Must be one of: ${validPurposes.join(', ')}` });
  }

  const listId = nanoid();
  const listUri = `at://${userDid}/io.exprsn.graph.list/${listId}`;

  await db.insert(lists).values({
    uri: listUri,
    cid: nanoid(),
    authorDid: userDid,
    name,
    description: description || null,
    avatar: avatar || null,
    purpose,
    createdAt: new Date(),
  });

  return c.json({ uri: listUri });
});

/**
 * Update a list
 * POST /xrpc/io.exprsn.graph.updateList
 */
graphRouter.post('/io.exprsn.graph.updateList', authMiddleware, async (c) => {
  const { uri, name, description, avatar } = await c.req.json();
  const userDid = c.get('did');

  if (!uri) {
    throw new HTTPException(400, { message: 'List URI is required' });
  }

  const list = await db.query.lists.findFirst({
    where: eq(lists.uri, uri),
  });

  if (!list) {
    throw new HTTPException(404, { message: 'List not found' });
  }

  if (list.authorDid !== userDid) {
    throw new HTTPException(403, { message: 'Not authorized to update this list' });
  }

  await db
    .update(lists)
    .set({
      name: name || list.name,
      description: description !== undefined ? description : list.description,
      avatar: avatar !== undefined ? avatar : list.avatar,
      cid: nanoid(), // Update CID on changes
    })
    .where(eq(lists.uri, uri));

  return c.json({ success: true });
});

/**
 * Delete a list
 * POST /xrpc/io.exprsn.graph.deleteList
 */
graphRouter.post('/io.exprsn.graph.deleteList', authMiddleware, async (c) => {
  const { uri } = await c.req.json();
  const userDid = c.get('did');

  if (!uri) {
    throw new HTTPException(400, { message: 'List URI is required' });
  }

  const list = await db.query.lists.findFirst({
    where: eq(lists.uri, uri),
  });

  if (!list) {
    throw new HTTPException(404, { message: 'List not found' });
  }

  if (list.authorDid !== userDid) {
    throw new HTTPException(403, { message: 'Not authorized to delete this list' });
  }

  // Delete list (cascade will delete items)
  await db.delete(lists).where(eq(lists.uri, uri));

  return c.json({ success: true });
});

/**
 * Get user's lists
 * GET /xrpc/io.exprsn.graph.getLists
 */
graphRouter.get('/io.exprsn.graph.getLists', optionalAuthMiddleware, async (c) => {
  const did = c.req.query('did');
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 100);
  const cursor = c.req.query('cursor');

  if (!did) {
    throw new HTTPException(400, { message: 'User DID is required' });
  }

  // Verify user exists
  const user = await db.query.users.findFirst({
    where: eq(users.did, did),
  });

  if (!user) {
    throw new HTTPException(404, { message: 'User not found' });
  }

  const listConditions = [eq(lists.authorDid, did)];
  if (cursor) {
    const cursorDate = new Date(cursor);
    listConditions.push(sql`${lists.createdAt} < ${cursorDate}`);
  }

  const results = await db
    .select()
    .from(lists)
    .where(and(...listConditions))
    .orderBy(desc(lists.createdAt))
    .limit(limit);

  const lastListResult = results[results.length - 1];
  const nextCursor =
    results.length === limit && lastListResult ? lastListResult.createdAt.toISOString() : undefined;

  return c.json({
    lists: results.map((list) => ({
      uri: list.uri,
      cid: list.cid,
      name: list.name,
      description: list.description,
      avatar: list.avatar,
      purpose: list.purpose,
      memberCount: list.memberCount,
      createdAt: list.createdAt.toISOString(),
      creator: {
        did: user.did,
        handle: user.handle,
        displayName: user.displayName,
        avatar: user.avatar,
      },
    })),
    cursor: nextCursor,
  });
});

/**
 * Get a single list with members
 * GET /xrpc/io.exprsn.graph.getList
 */
graphRouter.get('/io.exprsn.graph.getList', optionalAuthMiddleware, async (c) => {
  const uri = c.req.query('uri');
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 100);
  const cursor = c.req.query('cursor');

  if (!uri) {
    throw new HTTPException(400, { message: 'List URI is required' });
  }

  const list = await db.query.lists.findFirst({
    where: eq(lists.uri, uri),
  });

  if (!list) {
    throw new HTTPException(404, { message: 'List not found' });
  }

  // Get list creator
  const creator = await db.query.users.findFirst({
    where: eq(users.did, list.authorDid),
  });

  // Get list items with users
  const itemConditions = [eq(listItems.listUri, uri)];
  if (cursor) {
    const cursorDate = new Date(cursor);
    itemConditions.push(sql`${listItems.createdAt} < ${cursorDate}`);
  }

  const members = await db
    .select({
      item: listItems,
      user: users,
    })
    .from(listItems)
    .innerJoin(users, eq(listItems.subjectDid, users.did))
    .where(and(...itemConditions))
    .orderBy(desc(listItems.createdAt))
    .limit(limit);

  const lastMember = members[members.length - 1];
  const nextCursor =
    members.length === limit && lastMember
      ? lastMember.item.createdAt.toISOString()
      : undefined;

  return c.json({
    list: {
      uri: list.uri,
      cid: list.cid,
      name: list.name,
      description: list.description,
      avatar: list.avatar,
      purpose: list.purpose,
      memberCount: list.memberCount,
      createdAt: list.createdAt.toISOString(),
      creator: creator
        ? {
            did: creator.did,
            handle: creator.handle,
            displayName: creator.displayName,
            avatar: creator.avatar,
          }
        : undefined,
    },
    items: members.map((m) => ({
      uri: m.item.uri,
      subject: {
        did: m.user.did,
        handle: m.user.handle,
        displayName: m.user.displayName,
        avatar: m.user.avatar,
        bio: m.user.bio,
      },
      addedAt: m.item.createdAt.toISOString(),
    })),
    cursor: nextCursor,
  });
});

/**
 * Add user to list
 * POST /xrpc/io.exprsn.graph.addListItem
 */
graphRouter.post('/io.exprsn.graph.addListItem', authMiddleware, async (c) => {
  const { listUri, subjectDid } = await c.req.json();
  const userDid = c.get('did');

  if (!listUri || !subjectDid) {
    throw new HTTPException(400, { message: 'List URI and subject DID are required' });
  }

  // Verify list exists and user owns it
  const list = await db.query.lists.findFirst({
    where: eq(lists.uri, listUri),
  });

  if (!list) {
    throw new HTTPException(404, { message: 'List not found' });
  }

  if (list.authorDid !== userDid) {
    throw new HTTPException(403, { message: 'Not authorized to modify this list' });
  }

  // Verify subject user exists
  const subjectUser = await db.query.users.findFirst({
    where: eq(users.did, subjectDid),
  });

  if (!subjectUser) {
    throw new HTTPException(404, { message: 'User not found' });
  }

  // Check if already in list
  const existing = await db.query.listItems.findFirst({
    where: and(eq(listItems.listUri, listUri), eq(listItems.subjectDid, subjectDid)),
  });

  if (existing) {
    throw new HTTPException(400, { message: 'User already in list' });
  }

  const itemId = nanoid();
  const itemUri = `at://${userDid}/io.exprsn.graph.listItem/${itemId}`;

  await db.insert(listItems).values({
    uri: itemUri,
    cid: nanoid(),
    listUri,
    subjectDid,
    createdAt: new Date(),
  });

  // Update member count
  await db
    .update(lists)
    .set({ memberCount: sql`${lists.memberCount} + 1` })
    .where(eq(lists.uri, listUri));

  return c.json({ uri: itemUri });
});

/**
 * Remove user from list
 * POST /xrpc/io.exprsn.graph.removeListItem
 */
graphRouter.post('/io.exprsn.graph.removeListItem', authMiddleware, async (c) => {
  const { listUri, subjectDid } = await c.req.json();
  const userDid = c.get('did');

  if (!listUri || !subjectDid) {
    throw new HTTPException(400, { message: 'List URI and subject DID are required' });
  }

  // Verify list exists and user owns it
  const list = await db.query.lists.findFirst({
    where: eq(lists.uri, listUri),
  });

  if (!list) {
    throw new HTTPException(404, { message: 'List not found' });
  }

  if (list.authorDid !== userDid) {
    throw new HTTPException(403, { message: 'Not authorized to modify this list' });
  }

  const existing = await db.query.listItems.findFirst({
    where: and(eq(listItems.listUri, listUri), eq(listItems.subjectDid, subjectDid)),
  });

  if (!existing) {
    throw new HTTPException(404, { message: 'User not in list' });
  }

  await db.delete(listItems).where(eq(listItems.uri, existing.uri));

  // Update member count
  await db
    .update(lists)
    .set({ memberCount: sql`GREATEST(${lists.memberCount} - 1, 0)` })
    .where(eq(lists.uri, listUri));

  return c.json({ success: true });
});
