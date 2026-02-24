/**
 * Watch Party Service
 * Handles synchronized video watching with friends
 */

import { nanoid } from 'nanoid';
import { db } from '../../db/index.js';
import {
  watchParties,
  watchPartyParticipants,
  watchPartyQueue,
  watchPartyMessages,
  users,
  videos,
} from '../../db/schema.js';
import { eq, and, desc, asc, sql, inArray } from 'drizzle-orm';

export type PartyStatus = 'active' | 'ended';
export type ParticipantRole = 'host' | 'cohost' | 'viewer';
export type MessageType = 'text' | 'emoji' | 'system' | 'reaction';

export interface WatchParty {
  id: string;
  hostDid: string;
  name: string;
  inviteCode: string;
  status: PartyStatus;
  maxParticipants: number;
  currentVideoUri: string | null;
  currentPosition: number;
  isPlaying: boolean;
  chatEnabled: boolean;
  createdAt: Date;
}

export interface PartyParticipant {
  id: string;
  partyId: string;
  userDid: string;
  role: ParticipantRole;
  isPresent: boolean;
  joinedAt: Date;
  user?: {
    handle: string;
    displayName?: string;
    avatar?: string;
  };
}

export interface PartyQueueItem {
  id: string;
  partyId: string;
  videoUri: string;
  addedBy: string;
  position: number;
  addedAt: Date;
  video?: {
    thumbnail?: string;
    duration?: number;
    caption?: string;
    author?: {
      handle: string;
      displayName?: string;
    };
  };
}

export interface PartyMessage {
  id: string;
  partyId: string;
  senderDid: string;
  text: string;
  messageType: MessageType;
  createdAt: Date;
  sender?: {
    handle: string;
    displayName?: string;
    avatar?: string;
  };
}

export interface CreatePartyOptions {
  name: string;
  maxParticipants?: number;
  chatEnabled?: boolean;
  initialVideoUri?: string;
}

export interface PartyState {
  party: WatchParty;
  participants: PartyParticipant[];
  queue: PartyQueueItem[];
  recentMessages: PartyMessage[];
}

export interface PlaybackState {
  videoUri: string | null;
  position: number;
  isPlaying: boolean;
  updatedAt: number;
}

function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export class WatchPartyService {
  /**
   * Create a new watch party
   */
  async createParty(hostDid: string, options: CreatePartyOptions): Promise<WatchParty> {
    const id = nanoid();
    const inviteCode = generateInviteCode();

    const [party] = await db
      .insert(watchParties)
      .values({
        id,
        hostDid,
        name: options.name,
        inviteCode,
        status: 'active',
        maxParticipants: options.maxParticipants || 20,
        currentVideoUri: options.initialVideoUri || null,
        currentPosition: 0,
        isPlaying: false,
        chatEnabled: options.chatEnabled !== false,
        createdAt: new Date(),
      })
      .returning();

    // Add host as first participant
    await db.insert(watchPartyParticipants).values({
      id: nanoid(),
      partyId: id,
      userDid: hostDid,
      role: 'host',
      isPresent: true,
      joinedAt: new Date(),
    });

    // Add initial video to queue if provided
    if (options.initialVideoUri) {
      await db.insert(watchPartyQueue).values({
        id: nanoid(),
        partyId: id,
        videoUri: options.initialVideoUri,
        addedBy: hostDid,
        position: 0,
        addedAt: new Date(),
      });
    }

    return party;
  }

  /**
   * Get party by ID
   */
  async getParty(partyId: string): Promise<WatchParty | null> {
    const [party] = await db
      .select()
      .from(watchParties)
      .where(eq(watchParties.id, partyId))
      .limit(1);

    return party || null;
  }

  /**
   * Get party by invite code
   */
  async getPartyByInviteCode(inviteCode: string): Promise<WatchParty | null> {
    const [party] = await db
      .select()
      .from(watchParties)
      .where(
        and(
          eq(watchParties.inviteCode, inviteCode.toUpperCase()),
          eq(watchParties.status, 'active')
        )
      )
      .limit(1);

    return party || null;
  }

  /**
   * Join a party
   */
  async joinParty(
    userDid: string,
    inviteCode: string
  ): Promise<{ party: WatchParty; participant: PartyParticipant } | null> {
    const party = await this.getPartyByInviteCode(inviteCode);
    if (!party) return null;

    // Check if already a participant
    const [existing] = await db
      .select()
      .from(watchPartyParticipants)
      .where(
        and(
          eq(watchPartyParticipants.partyId, party.id),
          eq(watchPartyParticipants.userDid, userDid)
        )
      )
      .limit(1);

    if (existing) {
      // Update presence
      await db
        .update(watchPartyParticipants)
        .set({ isPresent: true })
        .where(eq(watchPartyParticipants.id, existing.id));

      return { party, participant: { ...existing, isPresent: true } };
    }

    // Check participant limit
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(watchPartyParticipants)
      .where(eq(watchPartyParticipants.partyId, party.id));

    if (count >= party.maxParticipants) {
      throw new Error('Party is full');
    }

    // Add new participant
    const [participant] = await db
      .insert(watchPartyParticipants)
      .values({
        id: nanoid(),
        partyId: party.id,
        userDid,
        role: 'viewer',
        isPresent: true,
        joinedAt: new Date(),
      })
      .returning();

    return { party, participant };
  }

  /**
   * Leave a party
   */
  async leaveParty(userDid: string, partyId: string): Promise<void> {
    await db
      .update(watchPartyParticipants)
      .set({ isPresent: false })
      .where(
        and(
          eq(watchPartyParticipants.partyId, partyId),
          eq(watchPartyParticipants.userDid, userDid)
        )
      );
  }

  /**
   * End a party (host only)
   */
  async endParty(hostDid: string, partyId: string): Promise<boolean> {
    const party = await this.getParty(partyId);
    if (!party || party.hostDid !== hostDid) return false;

    await db
      .update(watchParties)
      .set({ status: 'ended' })
      .where(eq(watchParties.id, partyId));

    // Mark all participants as not present
    await db
      .update(watchPartyParticipants)
      .set({ isPresent: false })
      .where(eq(watchPartyParticipants.partyId, partyId));

    return true;
  }

  /**
   * Update playback state
   */
  async updatePlayback(
    partyId: string,
    state: { videoUri?: string; position?: number; isPlaying?: boolean }
  ): Promise<void> {
    const updates: Partial<typeof watchParties.$inferInsert> = {};

    if (state.videoUri !== undefined) updates.currentVideoUri = state.videoUri;
    if (state.position !== undefined) updates.currentPosition = state.position;
    if (state.isPlaying !== undefined) updates.isPlaying = state.isPlaying;

    if (Object.keys(updates).length > 0) {
      await db
        .update(watchParties)
        .set(updates)
        .where(eq(watchParties.id, partyId));
    }
  }

  /**
   * Get playback state
   */
  async getPlaybackState(partyId: string): Promise<PlaybackState | null> {
    const party = await this.getParty(partyId);
    if (!party) return null;

    return {
      videoUri: party.currentVideoUri,
      position: party.currentPosition,
      isPlaying: party.isPlaying,
      updatedAt: Date.now(),
    };
  }

  /**
   * Add video to queue
   */
  async addToQueue(partyId: string, videoUri: string, addedBy: string): Promise<PartyQueueItem> {
    // Get max position
    const [{ maxPos }] = await db
      .select({ maxPos: sql<number>`coalesce(max(position), -1)` })
      .from(watchPartyQueue)
      .where(eq(watchPartyQueue.partyId, partyId));

    const [item] = await db
      .insert(watchPartyQueue)
      .values({
        id: nanoid(),
        partyId,
        videoUri,
        addedBy,
        position: (maxPos || 0) + 1,
        addedAt: new Date(),
      })
      .returning();

    return item;
  }

  /**
   * Remove from queue
   */
  async removeFromQueue(partyId: string, queueItemId: string): Promise<void> {
    await db
      .delete(watchPartyQueue)
      .where(
        and(
          eq(watchPartyQueue.partyId, partyId),
          eq(watchPartyQueue.id, queueItemId)
        )
      );
  }

  /**
   * Get queue with video details
   */
  async getQueue(partyId: string): Promise<PartyQueueItem[]> {
    const queueItems = await db
      .select({
        id: watchPartyQueue.id,
        partyId: watchPartyQueue.partyId,
        videoUri: watchPartyQueue.videoUri,
        addedBy: watchPartyQueue.addedBy,
        position: watchPartyQueue.position,
        addedAt: watchPartyQueue.addedAt,
        videoThumbnail: videos.thumbnailUrl,
        videoDuration: videos.duration,
        videoCaption: videos.caption,
        authorHandle: users.handle,
        authorDisplayName: users.displayName,
      })
      .from(watchPartyQueue)
      .leftJoin(videos, eq(videos.uri, watchPartyQueue.videoUri))
      .leftJoin(users, eq(users.did, videos.authorDid))
      .where(eq(watchPartyQueue.partyId, partyId))
      .orderBy(asc(watchPartyQueue.position));

    return queueItems.map((item) => ({
      id: item.id,
      partyId: item.partyId,
      videoUri: item.videoUri,
      addedBy: item.addedBy,
      position: item.position,
      addedAt: item.addedAt,
      video: item.videoThumbnail
        ? {
            thumbnail: item.videoThumbnail || undefined,
            duration: item.videoDuration || undefined,
            caption: item.videoCaption || undefined,
            author: item.authorHandle
              ? {
                  handle: item.authorHandle,
                  displayName: item.authorDisplayName || undefined,
                }
              : undefined,
          }
        : undefined,
    }));
  }

  /**
   * Play next video in queue
   */
  async nextVideo(partyId: string): Promise<PartyQueueItem | null> {
    const queue = await this.getQueue(partyId);
    const party = await this.getParty(partyId);
    if (!party || queue.length === 0) return null;

    // Find the next video after current
    const currentIndex = queue.findIndex((item) => item.videoUri === party.currentVideoUri);
    const nextIndex = currentIndex + 1;

    if (nextIndex >= queue.length) return null;

    const nextItem = queue[nextIndex];
    await this.updatePlayback(partyId, {
      videoUri: nextItem.videoUri,
      position: 0,
      isPlaying: true,
    });

    return nextItem;
  }

  /**
   * Get participants with user details
   */
  async getParticipants(partyId: string): Promise<PartyParticipant[]> {
    const participants = await db
      .select({
        id: watchPartyParticipants.id,
        partyId: watchPartyParticipants.partyId,
        userDid: watchPartyParticipants.userDid,
        role: watchPartyParticipants.role,
        isPresent: watchPartyParticipants.isPresent,
        joinedAt: watchPartyParticipants.joinedAt,
        handle: users.handle,
        displayName: users.displayName,
        avatar: users.avatar,
      })
      .from(watchPartyParticipants)
      .leftJoin(users, eq(users.did, watchPartyParticipants.userDid))
      .where(eq(watchPartyParticipants.partyId, partyId))
      .orderBy(desc(watchPartyParticipants.isPresent));

    return participants.map((p) => ({
      id: p.id,
      partyId: p.partyId,
      userDid: p.userDid,
      role: p.role as ParticipantRole,
      isPresent: p.isPresent,
      joinedAt: p.joinedAt,
      user: p.handle
        ? {
            handle: p.handle,
            displayName: p.displayName || undefined,
            avatar: p.avatar || undefined,
          }
        : undefined,
    }));
  }

  /**
   * Send chat message
   */
  async sendMessage(
    partyId: string,
    senderDid: string,
    text: string,
    messageType: MessageType = 'text'
  ): Promise<PartyMessage> {
    const [message] = await db
      .insert(watchPartyMessages)
      .values({
        id: nanoid(),
        partyId,
        senderDid,
        text,
        messageType,
        createdAt: new Date(),
      })
      .returning();

    return message;
  }

  /**
   * Get recent messages
   */
  async getMessages(partyId: string, limit = 50): Promise<PartyMessage[]> {
    const messages = await db
      .select({
        id: watchPartyMessages.id,
        partyId: watchPartyMessages.partyId,
        senderDid: watchPartyMessages.senderDid,
        text: watchPartyMessages.text,
        messageType: watchPartyMessages.messageType,
        createdAt: watchPartyMessages.createdAt,
        handle: users.handle,
        displayName: users.displayName,
        avatar: users.avatar,
      })
      .from(watchPartyMessages)
      .leftJoin(users, eq(users.did, watchPartyMessages.senderDid))
      .where(eq(watchPartyMessages.partyId, partyId))
      .orderBy(desc(watchPartyMessages.createdAt))
      .limit(limit);

    return messages
      .map((m) => ({
        id: m.id,
        partyId: m.partyId,
        senderDid: m.senderDid,
        text: m.text,
        messageType: m.messageType as MessageType,
        createdAt: m.createdAt,
        sender: m.handle
          ? {
              handle: m.handle,
              displayName: m.displayName || undefined,
              avatar: m.avatar || undefined,
            }
          : undefined,
      }))
      .reverse();
  }

  /**
   * Get full party state
   */
  async getPartyState(partyId: string): Promise<PartyState | null> {
    const party = await this.getParty(partyId);
    if (!party) return null;

    const [participants, queue, recentMessages] = await Promise.all([
      this.getParticipants(partyId),
      this.getQueue(partyId),
      this.getMessages(partyId, 50),
    ]);

    return {
      party,
      participants,
      queue,
      recentMessages,
    };
  }

  /**
   * Promote user to cohost
   */
  async promoteToCohost(partyId: string, userDid: string): Promise<void> {
    await db
      .update(watchPartyParticipants)
      .set({ role: 'cohost' })
      .where(
        and(
          eq(watchPartyParticipants.partyId, partyId),
          eq(watchPartyParticipants.userDid, userDid)
        )
      );
  }

  /**
   * Check if user can control playback (host or cohost)
   */
  async canControlPlayback(partyId: string, userDid: string): Promise<boolean> {
    const [participant] = await db
      .select()
      .from(watchPartyParticipants)
      .where(
        and(
          eq(watchPartyParticipants.partyId, partyId),
          eq(watchPartyParticipants.userDid, userDid)
        )
      )
      .limit(1);

    return participant?.role === 'host' || participant?.role === 'cohost';
  }

  /**
   * Get active parties for a user
   */
  async getUserActiveParties(userDid: string): Promise<WatchParty[]> {
    const partyIds = await db
      .select({ partyId: watchPartyParticipants.partyId })
      .from(watchPartyParticipants)
      .where(
        and(
          eq(watchPartyParticipants.userDid, userDid),
          eq(watchPartyParticipants.isPresent, true)
        )
      );

    if (partyIds.length === 0) return [];

    return db
      .select()
      .from(watchParties)
      .where(
        and(
          inArray(
            watchParties.id,
            partyIds.map((p) => p.partyId)
          ),
          eq(watchParties.status, 'active')
        )
      );
  }
}

// Singleton instance
export const watchPartyService = new WatchPartyService();
