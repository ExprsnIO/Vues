/**
 * OAuth Agent Service
 * Handles automated OAuth token management, refresh, and cleanup
 */

import { db } from '../../db/index.js';
import { sessions, authConfig } from '../../db/schema.js';
import { eq, lt, and, sql } from 'drizzle-orm';
import { redis } from '../../cache/redis.js';
import { nanoid } from 'nanoid';

// OAuth scope definitions
export const OAUTH_SCOPES = {
  // AT Protocol scopes
  ATPROTO: 'atproto',
  // OpenID Connect scopes
  OPENID: 'openid',
  PROFILE: 'profile',
  EMAIL: 'email',
  // Exprsn-specific scopes
  READ: 'read',
  WRITE: 'write',
  ADMIN: 'admin',
  // Granular scopes
  VIDEOS_READ: 'videos:read',
  VIDEOS_WRITE: 'videos:write',
  COMMENTS_READ: 'comments:read',
  COMMENTS_WRITE: 'comments:write',
  MESSAGES_READ: 'messages:read',
  MESSAGES_WRITE: 'messages:write',
  PROFILE_READ: 'profile:read',
  PROFILE_WRITE: 'profile:write',
  FOLLOWS_READ: 'follows:read',
  FOLLOWS_WRITE: 'follows:write',
  NOTIFICATIONS_READ: 'notifications:read',
  LIVE_STREAM: 'live:stream',
  PAYMENTS_READ: 'payments:read',
  PAYMENTS_WRITE: 'payments:write',
} as const;

// Scope hierarchy - parent scopes include child scopes
export const SCOPE_HIERARCHY: Record<string, string[]> = {
  'atproto': ['read', 'write', 'profile'],
  'read': [
    'videos:read', 'comments:read', 'messages:read',
    'profile:read', 'follows:read', 'notifications:read', 'payments:read'
  ],
  'write': [
    'videos:write', 'comments:write', 'messages:write',
    'profile:write', 'follows:write', 'payments:write', 'live:stream'
  ],
  'admin': ['read', 'write'],
};

export interface TokenInfo {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
  scopes: string[];
  did: string;
}

export interface RefreshResult {
  success: boolean;
  newAccessToken?: string;
  newRefreshToken?: string;
  expiresAt?: Date;
  error?: string;
}

export class OAuthAgentService {
  private cleanupInterval: NodeJS.Timeout | null = null;
  private refreshCheckInterval: NodeJS.Timeout | null = null;

  /**
   * Initialize the OAuth agent service
   */
  async initialize(): Promise<void> {
    console.log('Initializing OAuth agent service...');

    // Start cleanup interval (every hour)
    this.cleanupInterval = setInterval(async () => {
      await this.cleanupExpiredSessions();
    }, 60 * 60 * 1000);

    // Start proactive refresh check (every 5 minutes)
    this.refreshCheckInterval = setInterval(async () => {
      await this.checkAndRefreshExpiringTokens();
    }, 5 * 60 * 1000);

    // Run initial cleanup
    await this.cleanupExpiredSessions();

    console.log('OAuth agent service initialized');
  }

  /**
   * Stop the OAuth agent service
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    if (this.refreshCheckInterval) {
      clearInterval(this.refreshCheckInterval);
      this.refreshCheckInterval = null;
    }
    console.log('OAuth agent service stopped');
  }

  /**
   * Expand scopes based on hierarchy
   */
  expandScopes(scopes: string[]): string[] {
    const expanded = new Set<string>(scopes);

    const expand = (scope: string) => {
      expanded.add(scope);
      const children = SCOPE_HIERARCHY[scope];
      if (children) {
        for (const child of children) {
          if (!expanded.has(child)) {
            expand(child);
          }
        }
      }
    };

    for (const scope of scopes) {
      expand(scope);
    }

    return Array.from(expanded);
  }

  /**
   * Check if a token has a required scope
   */
  hasScope(tokenScopes: string[], requiredScope: string): boolean {
    const expanded = this.expandScopes(tokenScopes);
    return expanded.includes(requiredScope);
  }

  /**
   * Check if a token has all required scopes
   */
  hasAllScopes(tokenScopes: string[], requiredScopes: string[]): boolean {
    const expanded = this.expandScopes(tokenScopes);
    return requiredScopes.every((scope) => expanded.includes(scope));
  }

  /**
   * Check if a token has any of the required scopes
   */
  hasAnyScope(tokenScopes: string[], requiredScopes: string[]): boolean {
    const expanded = this.expandScopes(tokenScopes);
    return requiredScopes.some((scope) => expanded.includes(scope));
  }

  /**
   * Clean up expired sessions from the database
   */
  async cleanupExpiredSessions(): Promise<{ deleted: number }> {
    console.log('Running expired session cleanup...');

    const result = await db
      .delete(sessions)
      .where(lt(sessions.expiresAt, new Date()))
      .returning({ id: sessions.id });

    const deletedCount = result.length;
    console.log(`Cleaned up ${deletedCount} expired sessions`);

    return { deleted: deletedCount };
  }

  /**
   * Check for tokens expiring soon and proactively refresh them
   */
  async checkAndRefreshExpiringTokens(): Promise<{ refreshed: number; failed: number }> {
    // Get auth config for refresh token settings
    const [config] = await db
      .select()
      .from(authConfig)
      .where(eq(authConfig.id, 'default'))
      .limit(1);

    const accessTokenExpiryMinutes = config?.accessTokenExpiryMinutes || 60;

    // Find sessions expiring in the next 10 minutes
    const expiryThreshold = new Date(Date.now() + 10 * 60 * 1000);

    const expiringSessions = await db
      .select()
      .from(sessions)
      .where(
        and(
          lt(sessions.expiresAt, expiryThreshold),
          sql`${sessions.expiresAt} > NOW()`,
          sql`${sessions.refreshJwt} IS NOT NULL`
        )
      )
      .limit(100);

    let refreshed = 0;
    let failed = 0;

    for (const session of expiringSessions) {
      try {
        const result = await this.refreshSession(session.id, accessTokenExpiryMinutes);
        if (result.success) {
          refreshed++;
        } else {
          failed++;
        }
      } catch (error) {
        console.error(`Failed to refresh session ${session.id}:`, error);
        failed++;
      }
    }

    if (refreshed > 0 || failed > 0) {
      console.log(`Token refresh check: ${refreshed} refreshed, ${failed} failed`);
    }

    return { refreshed, failed };
  }

  /**
   * Refresh a specific session
   */
  async refreshSession(sessionId: string, accessTokenExpiryMinutes: number = 60): Promise<RefreshResult> {
    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);

    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    if (!session.refreshJwt) {
      return { success: false, error: 'No refresh token available' };
    }

    // Generate new tokens
    const newAccessToken = `exp_${nanoid(32)}`;
    const newRefreshToken = `ref_${nanoid(48)}`;
    const newExpiresAt = new Date(Date.now() + accessTokenExpiryMinutes * 60 * 1000);

    await db
      .update(sessions)
      .set({
        accessJwt: newAccessToken,
        refreshJwt: newRefreshToken,
        expiresAt: newExpiresAt,
      })
      .where(eq(sessions.id, sessionId));

    // Invalidate old tokens in Redis cache
    await redis.del(`session:${session.accessJwt}`);

    return {
      success: true,
      newAccessToken,
      newRefreshToken,
      expiresAt: newExpiresAt,
    };
  }

  /**
   * Validate token type is enabled
   */
  async isTokenTypeEnabled(tokenType: 'local' | 'oauth' | 'apiKey' | 'service'): Promise<boolean> {
    const [config] = await db
      .select()
      .from(authConfig)
      .where(eq(authConfig.id, 'default'))
      .limit(1);

    if (!config) return true; // Default to enabled

    switch (tokenType) {
      case 'local':
        return config.localTokensEnabled;
      case 'oauth':
        return config.oauthTokensEnabled;
      case 'apiKey':
        return config.apiKeysEnabled;
      case 'service':
        return config.serviceTokensEnabled;
      default:
        return true;
    }
  }

  /**
   * Get allowed OAuth scopes
   */
  async getAllowedScopes(): Promise<string[]> {
    const [config] = await db
      .select()
      .from(authConfig)
      .where(eq(authConfig.id, 'default'))
      .limit(1);

    return config?.allowedOauthScopes || ['atproto', 'openid', 'profile', 'read', 'write'];
  }

  /**
   * Get default OAuth scopes
   */
  async getDefaultScopes(): Promise<string[]> {
    const [config] = await db
      .select()
      .from(authConfig)
      .where(eq(authConfig.id, 'default'))
      .limit(1);

    return config?.defaultOauthScopes || ['atproto'];
  }

  /**
   * Validate requested scopes against allowed scopes
   */
  async validateScopes(requestedScopes: string[]): Promise<{
    valid: boolean;
    allowedScopes: string[];
    deniedScopes: string[];
  }> {
    const allowedScopes = await this.getAllowedScopes();
    const allowed: string[] = [];
    const denied: string[] = [];

    for (const scope of requestedScopes) {
      if (allowedScopes.includes(scope)) {
        allowed.push(scope);
      } else {
        denied.push(scope);
      }
    }

    return {
      valid: denied.length === 0,
      allowedScopes: allowed,
      deniedScopes: denied,
    };
  }

  /**
   * Get rate limit for a user/organization based on config
   */
  async getRateLimit(options: {
    did?: string;
    isAdmin?: boolean;
    organizationId?: string;
  }): Promise<{ requestsPerMinute: number; burstLimit: number }> {
    const [config] = await db
      .select()
      .from(authConfig)
      .where(eq(authConfig.id, 'default'))
      .limit(1);

    // Check organization-specific limits if applicable
    if (options.organizationId) {
      const { organizations } = await import('../../db/schema.js');
      const [org] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.id, options.organizationId))
        .limit(1);

      if (org?.rateLimitPerMinute) {
        return {
          requestsPerMinute: org.rateLimitPerMinute,
          burstLimit: org.burstLimit || config?.userBurstLimit || 20,
        };
      }
    }

    // Use admin or user limits
    if (options.isAdmin) {
      return {
        requestsPerMinute: config?.adminRateLimitPerMinute || 120,
        burstLimit: config?.adminBurstLimit || 50,
      };
    }

    if (options.did) {
      return {
        requestsPerMinute: config?.userRateLimitPerMinute || 60,
        burstLimit: config?.userBurstLimit || 20,
      };
    }

    // Anonymous
    return {
      requestsPerMinute: config?.anonymousRateLimitPerMinute || 30,
      burstLimit: 10,
    };
  }
}

// Export singleton instance
export const oauthAgent = new OAuthAgentService();
