import { Hono } from 'hono';
import { authMiddleware } from '../auth/middleware.js';
import { watchPartyService } from '../services/watchParty/index.js';
import { db } from '../db/index.js';
import { videos, users } from '../db/schema.js';
import { eq } from 'drizzle-orm';

const app = new Hono();

// All routes require authentication
app.use('*', authMiddleware);

/**
 * Create a new watch party
 */
app.post('/io.exprsn.party.create', async (c) => {
  const userDid = c.get('userDid') as string;
  const body = await c.req.json();

  const { name, maxParticipants, chatEnabled, initialVideoUri } = body;

  if (!name) {
    return c.json({ error: 'InvalidRequest', message: 'Name is required' }, 400);
  }

  try {
    const party = await watchPartyService.createParty(userDid, {
      name,
      maxParticipants,
      chatEnabled,
      initialVideoUri,
    });

    return c.json({ party });
  } catch (error) {
    console.error('Error creating party:', error);
    return c.json({ error: 'InternalError', message: 'Failed to create party' }, 500);
  }
});

/**
 * Get party by ID or invite code
 */
app.get('/io.exprsn.party.get', async (c) => {
  const id = c.req.query('id');
  const inviteCode = c.req.query('inviteCode');

  if (!id && !inviteCode) {
    return c.json({ error: 'InvalidRequest', message: 'Either id or inviteCode required' }, 400);
  }

  try {
    let party = null;

    if (id) {
      party = await watchPartyService.getParty(id);
    } else if (inviteCode) {
      party = await watchPartyService.getPartyByInviteCode(inviteCode);
    }

    if (!party) {
      return c.json({ error: 'NotFound', message: 'Party not found' }, 404);
    }

    const state = await watchPartyService.getPartyState(party.id);

    return c.json(state);
  } catch (error) {
    console.error('Error getting party:', error);
    return c.json({ error: 'InternalError', message: 'Failed to get party' }, 500);
  }
});

/**
 * Join a party via invite code
 */
app.post('/io.exprsn.party.join', async (c) => {
  const userDid = c.get('userDid') as string;
  const body = await c.req.json();
  const { inviteCode } = body;

  if (!inviteCode) {
    return c.json({ error: 'InvalidRequest', message: 'Invite code required' }, 400);
  }

  try {
    const result = await watchPartyService.joinParty(userDid, inviteCode);

    if (!result) {
      return c.json({ error: 'NotFound', message: 'Party not found or inactive' }, 404);
    }

    const state = await watchPartyService.getPartyState(result.party.id);

    return c.json({ ...state, joined: true });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'Party is full') {
      return c.json({ error: 'PartyFull', message: 'Party is at maximum capacity' }, 400);
    }
    console.error('Error joining party:', error);
    return c.json({ error: 'InternalError', message: 'Failed to join party' }, 500);
  }
});

/**
 * Leave a party
 */
app.post('/io.exprsn.party.leave', async (c) => {
  const userDid = c.get('userDid') as string;
  const body = await c.req.json();
  const { partyId } = body;

  if (!partyId) {
    return c.json({ error: 'InvalidRequest', message: 'Party ID required' }, 400);
  }

  try {
    await watchPartyService.leaveParty(userDid, partyId);
    return c.json({ success: true });
  } catch (error) {
    console.error('Error leaving party:', error);
    return c.json({ error: 'InternalError', message: 'Failed to leave party' }, 500);
  }
});

/**
 * End a party (host only)
 */
app.post('/io.exprsn.party.end', async (c) => {
  const userDid = c.get('userDid') as string;
  const body = await c.req.json();
  const { partyId } = body;

  if (!partyId) {
    return c.json({ error: 'InvalidRequest', message: 'Party ID required' }, 400);
  }

  try {
    const success = await watchPartyService.endParty(userDid, partyId);

    if (!success) {
      return c.json({ error: 'Forbidden', message: 'Only host can end the party' }, 403);
    }

    return c.json({ success: true });
  } catch (error) {
    console.error('Error ending party:', error);
    return c.json({ error: 'InternalError', message: 'Failed to end party' }, 500);
  }
});

/**
 * Add video to queue
 */
app.post('/io.exprsn.party.addToQueue', async (c) => {
  const userDid = c.get('userDid') as string;
  const body = await c.req.json();
  const { partyId, videoUri } = body;

  if (!partyId || !videoUri) {
    return c.json({ error: 'InvalidRequest', message: 'Party ID and video URI required' }, 400);
  }

  try {
    // Verify video exists
    const [video] = await db.select().from(videos).where(eq(videos.uri, videoUri)).limit(1);

    if (!video) {
      return c.json({ error: 'NotFound', message: 'Video not found' }, 404);
    }

    const queueItem = await watchPartyService.addToQueue(partyId, videoUri, userDid);

    return c.json({ queueItem });
  } catch (error) {
    console.error('Error adding to queue:', error);
    return c.json({ error: 'InternalError', message: 'Failed to add to queue' }, 500);
  }
});

/**
 * Remove video from queue
 */
app.post('/io.exprsn.party.removeFromQueue', async (c) => {
  const userDid = c.get('userDid') as string;
  const body = await c.req.json();
  const { partyId, queueItemId } = body;

  if (!partyId || !queueItemId) {
    return c.json({ error: 'InvalidRequest', message: 'Party ID and queue item ID required' }, 400);
  }

  try {
    // Check if user can control (host/cohost)
    const canControl = await watchPartyService.canControlPlayback(partyId, userDid);
    if (!canControl) {
      return c.json({ error: 'Forbidden', message: 'Only host or cohost can remove from queue' }, 403);
    }

    await watchPartyService.removeFromQueue(partyId, queueItemId);

    return c.json({ success: true });
  } catch (error) {
    console.error('Error removing from queue:', error);
    return c.json({ error: 'InternalError', message: 'Failed to remove from queue' }, 500);
  }
});

/**
 * Get queue
 */
app.get('/io.exprsn.party.getQueue', async (c) => {
  const partyId = c.req.query('partyId');

  if (!partyId) {
    return c.json({ error: 'InvalidRequest', message: 'Party ID required' }, 400);
  }

  try {
    const queue = await watchPartyService.getQueue(partyId);
    return c.json({ queue });
  } catch (error) {
    console.error('Error getting queue:', error);
    return c.json({ error: 'InternalError', message: 'Failed to get queue' }, 500);
  }
});

/**
 * Get chat messages
 */
app.get('/io.exprsn.party.getMessages', async (c) => {
  const partyId = c.req.query('partyId');
  const limit = parseInt(c.req.query('limit') || '50', 10);

  if (!partyId) {
    return c.json({ error: 'InvalidRequest', message: 'Party ID required' }, 400);
  }

  try {
    const messages = await watchPartyService.getMessages(partyId, limit);
    return c.json({ messages });
  } catch (error) {
    console.error('Error getting messages:', error);
    return c.json({ error: 'InternalError', message: 'Failed to get messages' }, 500);
  }
});

/**
 * Get participants
 */
app.get('/io.exprsn.party.getParticipants', async (c) => {
  const partyId = c.req.query('partyId');

  if (!partyId) {
    return c.json({ error: 'InvalidRequest', message: 'Party ID required' }, 400);
  }

  try {
    const participants = await watchPartyService.getParticipants(partyId);
    return c.json({ participants });
  } catch (error) {
    console.error('Error getting participants:', error);
    return c.json({ error: 'InternalError', message: 'Failed to get participants' }, 500);
  }
});

/**
 * Promote user to cohost (host only)
 */
app.post('/io.exprsn.party.promoteToCohost', async (c) => {
  const userDid = c.get('userDid') as string;
  const body = await c.req.json();
  const { partyId, targetUserDid } = body;

  if (!partyId || !targetUserDid) {
    return c.json({ error: 'InvalidRequest', message: 'Party ID and target user required' }, 400);
  }

  try {
    const party = await watchPartyService.getParty(partyId);
    if (!party || party.hostDid !== userDid) {
      return c.json({ error: 'Forbidden', message: 'Only host can promote users' }, 403);
    }

    await watchPartyService.promoteToCohost(partyId, targetUserDid);

    return c.json({ success: true });
  } catch (error) {
    console.error('Error promoting to cohost:', error);
    return c.json({ error: 'InternalError', message: 'Failed to promote user' }, 500);
  }
});

/**
 * Get user's active parties
 */
app.get('/io.exprsn.party.getUserParties', async (c) => {
  const userDid = c.get('userDid') as string;

  try {
    const parties = await watchPartyService.getUserActiveParties(userDid);
    return c.json({ parties });
  } catch (error) {
    console.error('Error getting user parties:', error);
    return c.json({ error: 'InternalError', message: 'Failed to get user parties' }, 500);
  }
});

export { app as watchPartyRouter };
