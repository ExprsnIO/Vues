/**
 * Mention Service
 * Handles @mentions parsing, autocomplete, and notifications
 */

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { eq, and, ilike, desc, sql } from 'drizzle-orm';
import * as schema from '../../db/schema.js';
import { nanoid } from 'nanoid';

/**
 * Parsed mention from text
 */
export interface ParsedMention {
  handle: string;
  start: number;
  end: number;
}

/**
 * Resolved mention with user info
 */
export interface ResolvedMention {
  handle: string;
  did: string;
  displayName?: string;
  avatar?: string;
  start: number;
  end: number;
}

/**
 * Autocomplete suggestion
 */
export interface MentionSuggestion {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  followerCount: number;
  isFollowing: boolean;
}

/**
 * Mention Service configuration
 */
export interface MentionServiceConfig {
  db: PostgresJsDatabase<typeof schema>;
}

/**
 * Mention Service
 *
 * Handles:
 * - Parsing @mentions from text
 * - Autocomplete suggestions
 * - Resolving mentions to users
 * - Creating mention notifications
 */
export class MentionService {
  private db: PostgresJsDatabase<typeof schema>;

  // Regex for parsing mentions
  // Matches @handle or @did:plc:xxx
  private mentionRegex = /@([a-zA-Z0-9._-]+(?:\.[a-zA-Z0-9._-]+)*|did:[a-z]+:[a-zA-Z0-9._-]+)/g;

  constructor(config: MentionServiceConfig) {
    this.db = config.db;
  }

  /**
   * Parse mentions from text
   */
  parseMentions(text: string): ParsedMention[] {
    const mentions: ParsedMention[] = [];
    let match;

    // Reset regex lastIndex
    this.mentionRegex.lastIndex = 0;

    while ((match = this.mentionRegex.exec(text)) !== null) {
      mentions.push({
        handle: match[1]!,
        start: match.index,
        end: match.index + match[0].length,
      });
    }

    return mentions;
  }

  /**
   * Resolve mentions to user DIDs
   */
  async resolveMentions(mentions: ParsedMention[]): Promise<ResolvedMention[]> {
    if (mentions.length === 0) {
      return [];
    }

    const resolved: ResolvedMention[] = [];

    for (const mention of mentions) {
      let user;

      // Check if it's a DID directly
      if (mention.handle.startsWith('did:')) {
        user = await this.db.query.users.findFirst({
          where: eq(schema.users.did, mention.handle),
        });
      } else {
        // Look up by handle
        user = await this.db.query.users.findFirst({
          where: eq(schema.users.handle, mention.handle),
        });
      }

      if (user) {
        resolved.push({
          handle: user.handle,
          did: user.did,
          displayName: user.displayName || undefined,
          avatar: user.avatar || undefined,
          start: mention.start,
          end: mention.end,
        });
      }
    }

    return resolved;
  }

  /**
   * Get autocomplete suggestions for a partial handle
   */
  async getAutocompleteSuggestions(
    query: string,
    viewerDid: string,
    options: {
      limit?: number;
      prioritizeFollowing?: boolean;
    } = {}
  ): Promise<MentionSuggestion[]> {
    const { limit = 10, prioritizeFollowing = true } = options;

    if (query.length < 1) {
      return [];
    }

    // Clean query
    const cleanQuery = query.replace(/^@/, '').toLowerCase();

    // Get users matching the query
    const users = await this.db
      .select({
        did: schema.users.did,
        handle: schema.users.handle,
        displayName: schema.users.displayName,
        avatar: schema.users.avatar,
        followerCount: schema.users.followerCount,
      })
      .from(schema.users)
      .where(
        sql`LOWER(${schema.users.handle}) LIKE ${`${cleanQuery}%`} OR LOWER(${schema.users.displayName}) LIKE ${`%${cleanQuery}%`}`
      )
      .orderBy(desc(schema.users.followerCount))
      .limit(limit * 2); // Get extra to allow filtering

    if (users.length === 0) {
      return [];
    }

    // Get following status for viewer
    const followingDids = await this.db
      .select({ did: schema.follows.followeeDid })
      .from(schema.follows)
      .where(
        and(
          eq(schema.follows.followerDid, viewerDid),
          sql`${schema.follows.followeeDid} IN (${sql.join(users.map(u => sql`${u.did}`), sql`, `)})`
        )
      );

    const followingSet = new Set(followingDids.map((f) => f.did));

    // Build suggestions
    let suggestions: MentionSuggestion[] = users.map((user) => ({
      did: user.did,
      handle: user.handle,
      displayName: user.displayName || undefined,
      avatar: user.avatar || undefined,
      followerCount: user.followerCount,
      isFollowing: followingSet.has(user.did),
    }));

    // Prioritize following users
    if (prioritizeFollowing) {
      suggestions.sort((a, b) => {
        if (a.isFollowing && !b.isFollowing) return -1;
        if (!a.isFollowing && b.isFollowing) return 1;
        return b.followerCount - a.followerCount;
      });
    }

    return suggestions.slice(0, limit);
  }

  /**
   * Process mentions in a video/comment and create notifications
   */
  async processMentions(
    text: string,
    sourceUri: string,
    sourceType: 'video' | 'comment',
    authorDid: string
  ): Promise<ResolvedMention[]> {
    // Parse and resolve mentions
    const parsed = this.parseMentions(text);
    const resolved = await this.resolveMentions(parsed);

    // Create notifications for each mentioned user
    for (const mention of resolved) {
      // Don't notify yourself
      if (mention.did === authorDid) {
        continue;
      }

      // Create notification
      await this.db.insert(schema.notifications).values({
        id: nanoid(),
        userDid: mention.did,
        reason: 'mention',
        actorDid: authorDid,
        subjectUri: sourceUri,
        subjectType: sourceType,
        isRead: false,
        createdAt: new Date(),
      }).onConflictDoNothing();
    }

    return resolved;
  }

  /**
   * Get recent mentions for a user
   */
  async getRecentMentions(
    userDid: string,
    options: {
      limit?: number;
      cursor?: string;
    } = {}
  ): Promise<{
    mentions: Array<{
      uri: string;
      type: string;
      authorDid: string;
      authorHandle?: string;
      text?: string;
      createdAt: Date;
    }>;
    cursor?: string;
  }> {
    const { limit = 20 } = options;

    // Get mention notifications
    const notifications = await this.db
      .select()
      .from(schema.notifications)
      .where(
        and(
          eq(schema.notifications.userDid, userDid),
          eq(schema.notifications.reason, 'mention')
        )
      )
      .orderBy(desc(schema.notifications.createdAt))
      .limit(limit + 1);

    const hasMore = notifications.length > limit;
    const items = hasMore ? notifications.slice(0, limit) : notifications;

    // Get author info
    const authorDids = [...new Set(items.map((n) => n.actorDid))];
    const authors = await this.db.query.users.findMany({
      where: sql`${schema.users.did} IN (${sql.join(authorDids.map(d => sql`${d}`), sql`, `)})`,
    });
    const authorMap = new Map(authors.map((a) => [a.did, a]));

    return {
      mentions: items.map((n) => {
        const author = authorMap.get(n.actorDid);
        return {
          uri: n.subjectUri!,
          type: n.subjectType!,
          authorDid: n.actorDid,
          authorHandle: author?.handle,
          createdAt: n.createdAt,
        };
      }),
      cursor: hasMore && items.length > 0
        ? items[items.length - 1]!.createdAt.toISOString()
        : undefined,
    };
  }

  /**
   * Extract facets for AT Protocol rich text
   */
  extractMentionFacets(
    text: string,
    resolvedMentions: ResolvedMention[]
  ): Array<{
    index: { byteStart: number; byteEnd: number };
    features: Array<{ $type: string; did: string }>;
  }> {
    // Convert to bytes for proper indexing
    const encoder = new TextEncoder();
    const bytes = encoder.encode(text);

    return resolvedMentions.map((mention) => {
      // Find byte positions
      const beforeMention = text.substring(0, mention.start);
      const mentionText = text.substring(mention.start, mention.end);

      const byteStart = encoder.encode(beforeMention).length;
      const byteEnd = byteStart + encoder.encode(mentionText).length;

      return {
        index: { byteStart, byteEnd },
        features: [
          {
            $type: 'app.bsky.richtext.facet#mention',
            did: mention.did,
          },
        ],
      };
    });
  }
}

/**
 * Create MentionService instance
 */
export function createMentionService(
  db: PostgresJsDatabase<typeof schema>
): MentionService {
  return new MentionService({ db });
}
