/**
 * Chat Moderation Service
 * Provides auto-moderation rules for live stream chat
 */

import { db } from '../../db/index.js';
import {
  liveStreams,
  streamBannedUsers,
  streamChat,
} from '../../db/schema.js';
import { eq, and, gte, desc, sql } from 'drizzle-orm';
import { redis } from '../../cache/redis.js';
import { nanoid } from 'nanoid';

// Default moderation settings
const DEFAULT_SETTINGS: ChatModerationSettings = {
  enabled: true,
  blockLinks: false,
  linkWhitelist: [],
  blockCaps: true,
  capsThreshold: 70, // % of caps to trigger
  minMessageLength: 3, // chars for caps check
  spamDetection: true,
  spamThreshold: 3, // same message count
  spamWindow: 30, // seconds
  slowMode: false,
  slowModeInterval: 0, // seconds between messages
  minAccountAge: 0, // hours
  blockedWords: [],
  blockedPatterns: [],
  autoTimeoutDuration: 300, // 5 minutes default
  maxEmojis: 0, // 0 = unlimited
  followerOnlyMode: false,
  subscriberOnlyMode: false,
};

// Cache keys
const CACHE_KEYS = {
  settings: (streamId: string) => `chat:mod:settings:${streamId}`,
  userMessageHistory: (streamId: string, userDid: string) => `chat:mod:history:${streamId}:${userDid}`,
  userLastMessage: (streamId: string, userDid: string) => `chat:mod:last:${streamId}:${userDid}`,
  userTimeouts: (streamId: string, userDid: string) => `chat:mod:timeout:${streamId}:${userDid}`,
};

export interface ChatModerationSettings {
  enabled: boolean;

  // Link filtering
  blockLinks: boolean;
  linkWhitelist: string[]; // Allowed domains

  // Caps lock filtering
  blockCaps: boolean;
  capsThreshold: number; // Percentage (0-100)
  minMessageLength: number; // Min length to check caps

  // Spam detection
  spamDetection: boolean;
  spamThreshold: number; // Number of repeated messages
  spamWindow: number; // Seconds to check for spam

  // Slow mode
  slowMode: boolean;
  slowModeInterval: number; // Seconds between messages

  // Account restrictions
  minAccountAge: number; // Minimum account age in hours
  followerOnlyMode: boolean;
  subscriberOnlyMode: boolean;

  // Word filtering
  blockedWords: string[];
  blockedPatterns: string[]; // Regex patterns

  // Auto-moderation actions
  autoTimeoutDuration: number; // Seconds

  // Emoji limiting
  maxEmojis: number; // 0 = unlimited
}

export interface ModerationResult {
  allowed: boolean;
  reason?: string;
  action?: 'warn' | 'delete' | 'timeout' | 'ban';
  duration?: number; // For timeout
  filteredMessage?: string; // Censored version
}

export interface ModerationViolation {
  id: string;
  streamId: string;
  userDid: string;
  messageId?: string;
  originalMessage: string;
  violationType: string;
  action: string;
  createdAt: Date;
}

export class ChatModerationService {
  /**
   * Get moderation settings for a stream
   */
  async getSettings(streamId: string): Promise<ChatModerationSettings> {
    // Check cache first
    const cacheKey = CACHE_KEYS.settings(streamId);
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(cached) };
      }
    } catch {
      // Cache miss
    }

    // Get from database
    const [stream] = await db
      .select({ chatSettings: liveStreams.chatSettings })
      .from(liveStreams)
      .where(eq(liveStreams.id, streamId))
      .limit(1);

    if (!stream) {
      return DEFAULT_SETTINGS;
    }

    const settings = {
      ...DEFAULT_SETTINGS,
      ...(stream.chatSettings as Partial<ChatModerationSettings> || {}),
    };

    // Cache for 5 minutes
    try {
      await redis.setex(cacheKey, 300, JSON.stringify(settings));
    } catch {
      // Cache write failed
    }

    return settings;
  }

  /**
   * Update moderation settings for a stream
   */
  async updateSettings(
    streamId: string,
    updates: Partial<ChatModerationSettings>
  ): Promise<ChatModerationSettings> {
    const current = await this.getSettings(streamId);
    const newSettings = { ...current, ...updates };

    await db
      .update(liveStreams)
      .set({ chatSettings: newSettings })
      .where(eq(liveStreams.id, streamId));

    // Invalidate cache
    const cacheKey = CACHE_KEYS.settings(streamId);
    try {
      await redis.del(cacheKey);
    } catch {
      // Cache delete failed
    }

    return newSettings;
  }

  /**
   * Check if a message passes moderation
   */
  async moderateMessage(
    streamId: string,
    userDid: string,
    message: string,
    userInfo?: {
      accountCreatedAt?: Date;
      isFollower?: boolean;
      isSubscriber?: boolean;
      isModerator?: boolean;
    }
  ): Promise<ModerationResult> {
    const settings = await this.getSettings(streamId);

    // Skip moderation for moderators
    if (userInfo?.isModerator) {
      return { allowed: true };
    }

    // Check if moderation is enabled
    if (!settings.enabled) {
      return { allowed: true };
    }

    // Check if user is timed out
    const timeoutCheck = await this.checkUserTimeout(streamId, userDid);
    if (!timeoutCheck.allowed) {
      return timeoutCheck;
    }

    // Check follower-only mode
    if (settings.followerOnlyMode && !userInfo?.isFollower && !userInfo?.isSubscriber) {
      return {
        allowed: false,
        reason: 'This chat is in follower-only mode. Follow the streamer to chat.',
        action: 'warn',
      };
    }

    // Check subscriber-only mode
    if (settings.subscriberOnlyMode && !userInfo?.isSubscriber) {
      return {
        allowed: false,
        reason: 'This chat is in subscriber-only mode.',
        action: 'warn',
      };
    }

    // Check minimum account age
    if (settings.minAccountAge > 0 && userInfo?.accountCreatedAt) {
      const ageHours = (Date.now() - userInfo.accountCreatedAt.getTime()) / (1000 * 60 * 60);
      if (ageHours < settings.minAccountAge) {
        return {
          allowed: false,
          reason: `Your account must be at least ${settings.minAccountAge} hours old to chat.`,
          action: 'warn',
        };
      }
    }

    // Check slow mode
    if (settings.slowMode && settings.slowModeInterval > 0) {
      const slowModeCheck = await this.checkSlowMode(streamId, userDid, settings.slowModeInterval);
      if (!slowModeCheck.allowed) {
        return slowModeCheck;
      }
    }

    // Check blocked words
    const wordCheck = this.checkBlockedWords(message, settings.blockedWords);
    if (!wordCheck.allowed) {
      return {
        ...wordCheck,
        action: 'delete',
      };
    }

    // Check blocked patterns
    const patternCheck = this.checkBlockedPatterns(message, settings.blockedPatterns);
    if (!patternCheck.allowed) {
      return {
        ...patternCheck,
        action: 'delete',
      };
    }

    // Check links
    if (settings.blockLinks) {
      const linkCheck = this.checkLinks(message, settings.linkWhitelist);
      if (!linkCheck.allowed) {
        return {
          ...linkCheck,
          action: 'delete',
        };
      }
    }

    // Check caps
    if (settings.blockCaps && message.length >= settings.minMessageLength) {
      const capsCheck = this.checkCaps(message, settings.capsThreshold);
      if (!capsCheck.allowed) {
        return {
          ...capsCheck,
          action: 'warn',
          filteredMessage: message.toLowerCase(),
        };
      }
    }

    // Check spam
    if (settings.spamDetection) {
      const spamCheck = await this.checkSpam(
        streamId,
        userDid,
        message,
        settings.spamThreshold,
        settings.spamWindow
      );
      if (!spamCheck.allowed) {
        // Auto-timeout for spam
        await this.timeoutUser(streamId, userDid, settings.autoTimeoutDuration, 'Spam detected');
        return {
          ...spamCheck,
          action: 'timeout',
          duration: settings.autoTimeoutDuration,
        };
      }
    }

    // Check emoji limit
    if (settings.maxEmojis > 0) {
      const emojiCheck = this.checkEmojiLimit(message, settings.maxEmojis);
      if (!emojiCheck.allowed) {
        return {
          ...emojiCheck,
          action: 'delete',
        };
      }
    }

    // Record message for spam detection
    await this.recordMessage(streamId, userDid, message);

    return { allowed: true };
  }

  /**
   * Timeout a user in chat
   */
  async timeoutUser(
    streamId: string,
    userDid: string,
    durationSeconds: number,
    reason?: string
  ): Promise<void> {
    const expiresAt = new Date(Date.now() + durationSeconds * 1000);

    // Store timeout in database
    await db.insert(streamBannedUsers).values({
      id: nanoid(),
      streamId,
      userDid,
      bannedBy: 'system',
      reason: reason || 'Auto-moderation timeout',
      expiresAt,
      createdAt: new Date(),
    }).onConflictDoUpdate({
      target: [streamBannedUsers.streamId, streamBannedUsers.userDid],
      set: {
        expiresAt,
        reason: reason || 'Auto-moderation timeout',
      },
    });

    // Also cache for quick lookup
    const cacheKey = CACHE_KEYS.userTimeouts(streamId, userDid);
    try {
      await redis.setex(cacheKey, durationSeconds, expiresAt.toISOString());
    } catch {
      // Cache write failed
    }
  }

  /**
   * Check if user is timed out
   */
  private async checkUserTimeout(streamId: string, userDid: string): Promise<ModerationResult> {
    // Check cache first
    const cacheKey = CACHE_KEYS.userTimeouts(streamId, userDid);
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        const expiresAt = new Date(cached);
        if (expiresAt > new Date()) {
          const remaining = Math.ceil((expiresAt.getTime() - Date.now()) / 1000);
          return {
            allowed: false,
            reason: `You are timed out. ${remaining} seconds remaining.`,
            action: 'warn',
          };
        }
      }
    } catch {
      // Cache check failed, continue with DB check
    }

    // Check database
    const [ban] = await db
      .select()
      .from(streamBannedUsers)
      .where(
        and(
          eq(streamBannedUsers.streamId, streamId),
          eq(streamBannedUsers.userDid, userDid),
          gte(streamBannedUsers.expiresAt, new Date())
        )
      )
      .limit(1);

    if (ban && ban.expiresAt && ban.expiresAt > new Date()) {
      const remaining = Math.ceil((ban.expiresAt.getTime() - Date.now()) / 1000);
      return {
        allowed: false,
        reason: `You are timed out. ${remaining} seconds remaining.`,
        action: 'warn',
      };
    }

    return { allowed: true };
  }

  /**
   * Check slow mode
   */
  private async checkSlowMode(
    streamId: string,
    userDid: string,
    intervalSeconds: number
  ): Promise<ModerationResult> {
    const cacheKey = CACHE_KEYS.userLastMessage(streamId, userDid);

    try {
      const lastMessageTime = await redis.get(cacheKey);
      if (lastMessageTime) {
        const elapsed = (Date.now() - parseInt(lastMessageTime, 10)) / 1000;
        if (elapsed < intervalSeconds) {
          const remaining = Math.ceil(intervalSeconds - elapsed);
          return {
            allowed: false,
            reason: `Slow mode enabled. Wait ${remaining} seconds.`,
            action: 'warn',
          };
        }
      }
    } catch {
      // Cache check failed, allow message
    }

    // Update last message time
    try {
      await redis.setex(cacheKey, intervalSeconds, Date.now().toString());
    } catch {
      // Cache write failed
    }

    return { allowed: true };
  }

  /**
   * Check blocked words
   */
  private checkBlockedWords(message: string, blockedWords: string[]): ModerationResult {
    if (blockedWords.length === 0) {
      return { allowed: true };
    }

    const lowerMessage = message.toLowerCase();
    for (const word of blockedWords) {
      const lowerWord = word.toLowerCase();
      // Check for whole word match
      const regex = new RegExp(`\\b${this.escapeRegex(lowerWord)}\\b`, 'i');
      if (regex.test(lowerMessage)) {
        return {
          allowed: false,
          reason: 'Your message contains a blocked word.',
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Check blocked patterns (regex)
   */
  private checkBlockedPatterns(message: string, patterns: string[]): ModerationResult {
    if (patterns.length === 0) {
      return { allowed: true };
    }

    for (const pattern of patterns) {
      try {
        const regex = new RegExp(pattern, 'i');
        if (regex.test(message)) {
          return {
            allowed: false,
            reason: 'Your message matches a blocked pattern.',
          };
        }
      } catch {
        // Invalid regex, skip
      }
    }

    return { allowed: true };
  }

  /**
   * Check for links
   */
  private checkLinks(message: string, whitelist: string[]): ModerationResult {
    // URL regex pattern
    const urlPattern = /https?:\/\/[^\s]+|www\.[^\s]+/gi;
    const urls = message.match(urlPattern);

    if (!urls || urls.length === 0) {
      return { allowed: true };
    }

    // Check if all URLs are whitelisted
    for (const url of urls) {
      const isWhitelisted = whitelist.some(domain => {
        try {
          const urlObj = new URL(url.startsWith('www.') ? `https://${url}` : url);
          return urlObj.hostname.endsWith(domain) || urlObj.hostname === domain;
        } catch {
          return false;
        }
      });

      if (!isWhitelisted) {
        return {
          allowed: false,
          reason: 'Links are not allowed in this chat.',
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Check caps percentage
   */
  private checkCaps(message: string, threshold: number): ModerationResult {
    // Remove non-letter characters for caps calculation
    const letters = message.replace(/[^a-zA-Z]/g, '');
    if (letters.length === 0) {
      return { allowed: true };
    }

    const upperCase = letters.replace(/[^A-Z]/g, '').length;
    const capsPercentage = (upperCase / letters.length) * 100;

    if (capsPercentage > threshold) {
      return {
        allowed: false,
        reason: `Too many capital letters (${Math.round(capsPercentage)}%). Please don't shout.`,
      };
    }

    return { allowed: true };
  }

  /**
   * Check for spam (repeated messages)
   */
  private async checkSpam(
    streamId: string,
    userDid: string,
    message: string,
    threshold: number,
    windowSeconds: number
  ): Promise<ModerationResult> {
    const cacheKey = CACHE_KEYS.userMessageHistory(streamId, userDid);
    const normalizedMessage = message.toLowerCase().trim();

    try {
      const historyJson = await redis.get(cacheKey);
      const history: Array<{ message: string; timestamp: number }> = historyJson
        ? JSON.parse(historyJson)
        : [];

      // Filter to recent messages within window
      const cutoff = Date.now() - windowSeconds * 1000;
      const recentMessages = history.filter(h => h.timestamp > cutoff);

      // Count matching messages
      const matchCount = recentMessages.filter(
        h => h.message.toLowerCase().trim() === normalizedMessage
      ).length;

      if (matchCount >= threshold) {
        return {
          allowed: false,
          reason: 'Please don\'t spam the same message.',
        };
      }
    } catch {
      // History check failed, allow message
    }

    return { allowed: true };
  }

  /**
   * Record a message for spam detection
   */
  private async recordMessage(streamId: string, userDid: string, message: string): Promise<void> {
    const cacheKey = CACHE_KEYS.userMessageHistory(streamId, userDid);

    try {
      const historyJson = await redis.get(cacheKey);
      const history: Array<{ message: string; timestamp: number }> = historyJson
        ? JSON.parse(historyJson)
        : [];

      // Add new message
      history.push({ message, timestamp: Date.now() });

      // Keep only last 20 messages
      const trimmed = history.slice(-20);

      // Store with 5-minute TTL
      await redis.setex(cacheKey, 300, JSON.stringify(trimmed));
    } catch {
      // Recording failed
    }
  }

  /**
   * Check emoji limit
   */
  private checkEmojiLimit(message: string, maxEmojis: number): ModerationResult {
    // Match Unicode emojis
    const emojiPattern = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;
    const emojis = message.match(emojiPattern);
    const emojiCount = emojis ? emojis.length : 0;

    if (emojiCount > maxEmojis) {
      return {
        allowed: false,
        reason: `Too many emojis (max ${maxEmojis}).`,
      };
    }

    return { allowed: true };
  }

  /**
   * Escape special regex characters
   */
  private escapeRegex(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Clear user timeout
   */
  async clearTimeout(streamId: string, userDid: string): Promise<void> {
    await db
      .delete(streamBannedUsers)
      .where(
        and(
          eq(streamBannedUsers.streamId, streamId),
          eq(streamBannedUsers.userDid, userDid)
        )
      );

    const cacheKey = CACHE_KEYS.userTimeouts(streamId, userDid);
    try {
      await redis.del(cacheKey);
    } catch {
      // Cache delete failed
    }
  }

  /**
   * Get suggested blocked words (common profanity/slurs)
   */
  getSuggestedBlockedWords(): string[] {
    // Return a basic list - in production, this would be more comprehensive
    return [
      // Keep this list minimal for the example
      'spam',
      'scam',
      'hack',
    ];
  }
}

// Singleton instance
let chatModerationService: ChatModerationService | null = null;

export function getChatModerationService(): ChatModerationService {
  if (!chatModerationService) {
    chatModerationService = new ChatModerationService();
  }
  return chatModerationService;
}
