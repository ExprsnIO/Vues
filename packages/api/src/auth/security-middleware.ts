/**
 * Security Middleware
 * Provides enhanced rate limiting for auth endpoints, brute force protection,
 * input sanitization, and upload quotas.
 */

import { Context, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { redis, CacheKeys } from '../cache/redis.js';
import { db } from '../db/index.js';
import { organizationMembers, organizationBilling } from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';

// ==================== TRUSTED PROXY CONFIGURATION ====================

/**
 * Configuration for trusted proxy handling
 * SECURITY: Only trust proxy headers when behind a known reverse proxy
 */
interface TrustedProxyConfig {
  enabled: boolean;
  trustedIPs: string[]; // IPs/CIDRs of trusted proxies (e.g., ['127.0.0.1', '10.0.0.0/8'])
}

// Cache the trusted proxy configuration
let trustedProxyConfig: TrustedProxyConfig | null = null;

function getTrustedProxyConfig(): TrustedProxyConfig {
  if (trustedProxyConfig !== null) {
    return trustedProxyConfig;
  }

  const trustProxy = process.env.TRUST_PROXY;
  const trustedIPs = process.env.TRUSTED_PROXY_IPS;

  // Explicit configuration via environment
  if (trustProxy === 'true' || trustProxy === '1') {
    trustedProxyConfig = {
      enabled: true,
      trustedIPs: trustedIPs ? trustedIPs.split(',').map(ip => ip.trim()) : [],
    };
  } else if (trustProxy === 'false' || trustProxy === '0') {
    trustedProxyConfig = { enabled: false, trustedIPs: [] };
  } else {
    // Auto-detect: trust proxy only in production with common cloud provider indicators
    const isCloudEnvironment = !!(
      process.env.KUBERNETES_SERVICE_HOST || // Kubernetes
      process.env.FLY_APP_NAME ||             // Fly.io
      process.env.RAILWAY_ENVIRONMENT ||      // Railway
      process.env.RENDER_SERVICE_ID ||        // Render
      process.env.HEROKU_APP_ID ||            // Heroku
      process.env.VERCEL                      // Vercel
    );

    trustedProxyConfig = {
      enabled: isCloudEnvironment,
      trustedIPs: [],
    };

    if (isCloudEnvironment && process.env.NODE_ENV === 'production') {
      console.log('[Security] Auto-detected cloud environment, trusting proxy headers');
    }
  }

  return trustedProxyConfig;
}

/**
 * Check if an IP matches any trusted proxy IP/CIDR
 */
function isIPTrusted(ip: string, trustedIPs: string[]): boolean {
  if (trustedIPs.length === 0) {
    // No specific IPs configured = trust all (when proxy trust is enabled)
    return true;
  }

  // Simple IP matching (exact match)
  // For production, consider using a proper CIDR matching library
  return trustedIPs.some(trusted => {
    if (trusted.includes('/')) {
      // CIDR notation - simplified check for common cases
      const [network, bits] = trusted.split('/');
      if (!network || !bits) return false;

      // For now, just match the network prefix for common /8, /16, /24
      const bitsNum = parseInt(bits, 10);
      if (bitsNum === 8) return ip.startsWith(network.split('.')[0] + '.');
      if (bitsNum === 16) return ip.startsWith(network.split('.').slice(0, 2).join('.') + '.');
      if (bitsNum === 24) return ip.startsWith(network.split('.').slice(0, 3).join('.') + '.');
      return false;
    }
    return ip === trusted;
  });
}

// ==================== IP-BASED RATE LIMITING ====================

/**
 * Get client IP address from request
 * SECURITY: Only trusts proxy headers when explicitly configured or in known cloud environments
 */
function getClientIP(c: Context): string {
  const proxyConfig = getTrustedProxyConfig();

  // Only trust proxy headers if configured to do so
  if (proxyConfig.enabled) {
    const forwarded = c.req.header('x-forwarded-for');
    if (forwarded) {
      // x-forwarded-for can contain multiple IPs: client, proxy1, proxy2, ...
      // Take the leftmost (client) IP
      const clientIP = forwarded.split(',')[0]?.trim();
      if (clientIP && clientIP !== 'unknown') {
        return clientIP;
      }
    }

    const realIp = c.req.header('x-real-ip');
    if (realIp) {
      return realIp;
    }

    // CF-Connecting-IP for Cloudflare
    const cfIP = c.req.header('cf-connecting-ip');
    if (cfIP) {
      return cfIP;
    }
  } else if (process.env.NODE_ENV === 'development') {
    // In development, still read headers but log a warning once
    const forwarded = c.req.header('x-forwarded-for');
    if (forwarded) {
      console.warn(
        '[Security] Proxy headers present but TRUST_PROXY not enabled. ' +
        'Set TRUST_PROXY=true if behind a reverse proxy.'
      );
    }
  }

  // Fallback - in serverless/edge environments this may return 'unknown'
  // but rate limiting will still work (all unknown IPs share limits)
  return 'unknown';
}

/**
 * Rate limit configuration for different endpoint types
 */
export const AUTH_RATE_LIMITS = {
  // Login: 5 attempts per 15 minutes per IP
  login: {
    maxAttempts: 5,
    windowSeconds: 15 * 60,
    blockDurationSeconds: 30 * 60, // 30 min block after exceeding
    keyPrefix: 'rl:auth:login',
  },
  // Signup: 3 accounts per hour per IP
  signup: {
    maxAttempts: 3,
    windowSeconds: 60 * 60,
    blockDurationSeconds: 60 * 60, // 1 hour block
    keyPrefix: 'rl:auth:signup',
  },
  // Token refresh: 30 per minute per user (generous for auto-refresh)
  refresh: {
    maxAttempts: 30,
    windowSeconds: 60,
    blockDurationSeconds: 5 * 60,
    keyPrefix: 'rl:auth:refresh',
  },
  // Password reset: 3 per hour per IP/email
  passwordReset: {
    maxAttempts: 3,
    windowSeconds: 60 * 60,
    blockDurationSeconds: 60 * 60,
    keyPrefix: 'rl:auth:reset',
  },
} as const;

/**
 * Check if an IP/identifier is blocked
 */
async function isBlocked(key: string): Promise<boolean> {
  try {
    const blocked = await redis.get(`${key}:blocked`);
    return blocked === '1';
  } catch {
    return false; // If Redis unavailable, allow through
  }
}

/**
 * Block an IP/identifier
 */
async function block(key: string, durationSeconds: number): Promise<void> {
  try {
    await redis.setex(`${key}:blocked`, durationSeconds, '1');
  } catch (error) {
    console.warn('Failed to block IP (Redis unavailable):', error);
  }
}

/**
 * IP-based rate limiter for auth endpoints
 */
export function authRateLimiter(limitType: keyof typeof AUTH_RATE_LIMITS) {
  return async (c: Context, next: Next) => {
    const config = AUTH_RATE_LIMITS[limitType];
    const ip = getClientIP(c);
    const key = `${config.keyPrefix}:${ip}`;

    try {
      // Check if blocked
      if (await isBlocked(key)) {
        const ttl = await redis.ttl(`${key}:blocked`);
        throw new HTTPException(429, {
          message: `Too many attempts. Please try again in ${Math.ceil(Math.max(ttl, 60) / 60)} minutes.`,
        });
      }

      // Increment attempt counter
      const attempts = await redis.incr(`${key}:count`);
      if (attempts === 1) {
        await redis.expire(`${key}:count`, config.windowSeconds);
      }

      // Check if limit exceeded
      if (attempts > config.maxAttempts) {
        // Block the IP
        await block(key, config.blockDurationSeconds);

        // Log security event
        console.warn(`[SECURITY] Rate limit exceeded for ${limitType}: IP=${ip}, attempts=${attempts}`);

        throw new HTTPException(429, {
          message: `Rate limit exceeded. You've been temporarily blocked for ${Math.ceil(config.blockDurationSeconds / 60)} minutes.`,
        });
      }

      // Add rate limit headers
      c.header('X-RateLimit-Limit', config.maxAttempts.toString());
      c.header('X-RateLimit-Remaining', Math.max(0, config.maxAttempts - attempts).toString());
      c.header('X-RateLimit-Reset', (Date.now() + config.windowSeconds * 1000).toString());
    } catch (error) {
      // Re-throw HTTP exceptions (rate limits)
      if (error instanceof HTTPException) {
        throw error;
      }
      // For Redis errors, log and continue (allow request through)
      console.warn(`Rate limiting error for ${limitType}:`, error);
    }

    await next();
  };
}

// ==================== FAILED AUTH TRACKING ====================

/**
 * Track failed authentication attempts for progressive delays
 */
export async function trackFailedAuth(ip: string, identifier: string): Promise<void> {
  try {
    const key = `auth:failed:${ip}:${identifier}`;
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, 24 * 60 * 60); // 24 hour tracking window
    }

    // If too many failures, auto-block
    if (count >= 10) {
      await block(`${AUTH_RATE_LIMITS.login.keyPrefix}:${ip}`, 60 * 60); // 1 hour block
      console.warn(`[SECURITY] Auto-blocked IP after ${count} failed auth attempts: IP=${ip}`);
    }
  } catch (error) {
    console.warn('Failed to track auth failure (Redis unavailable):', error);
  }
}

/**
 * Clear failed auth tracking on successful auth
 */
export async function clearFailedAuth(ip: string, identifier: string): Promise<void> {
  try {
    const key = `auth:failed:${ip}:${identifier}`;
    await redis.del(key);
  } catch (error) {
    console.warn('Failed to clear auth tracking (Redis unavailable):', error);
  }
}

/**
 * Get progressive delay based on failed attempts
 */
export async function getAuthDelay(ip: string, identifier: string): Promise<number> {
  try {
    const key = `auth:failed:${ip}:${identifier}`;
    const count = parseInt(await redis.get(key) || '0', 10);

    // Progressive delay: 0, 0, 1s, 2s, 4s, 8s, etc.
    if (count < 2) return 0;
    return Math.min(1000 * Math.pow(2, count - 2), 30000); // Max 30s delay
  } catch {
    return 0; // If Redis unavailable, no delay
  }
}

// ==================== UPLOAD RATE LIMITING ====================

/**
 * Upload quota configuration
 */
export const UPLOAD_QUOTAS = {
  // Anonymous (not used, but for reference)
  anonymous: {
    dailyUploads: 0,
    hourlyUploads: 0,
    maxFileSizeMB: 0,
  },
  // Regular users
  user: {
    dailyUploads: 10,
    hourlyUploads: 3,
    maxFileSizeMB: 500,
  },
  // Verified creators
  creator: {
    dailyUploads: 50,
    hourlyUploads: 10,
    maxFileSizeMB: 2000,
  },
  // Pro/paid users
  pro: {
    dailyUploads: 100,
    hourlyUploads: 20,
    maxFileSizeMB: 5000,
  },
} as const;

/**
 * Get user's subscription tier based on organization memberships
 * Returns the highest tier the user has access to
 */
async function getUserSubscriptionTier(userDid: string): Promise<keyof typeof UPLOAD_QUOTAS> {
  try {
    // Check user's organization memberships and their billing tiers
    const memberships = await db
      .select({
        subscriptionTier: organizationBilling.subscriptionTier,
      })
      .from(organizationMembers)
      .innerJoin(
        organizationBilling,
        eq(organizationMembers.organizationId, organizationBilling.organizationId)
      )
      .where(
        and(
          eq(organizationMembers.userDid, userDid),
          eq(organizationMembers.status, 'active')
        )
      );

    // Map organization tiers to upload quota tiers
    const tierPriority: Record<string, keyof typeof UPLOAD_QUOTAS> = {
      enterprise: 'pro',
      pro: 'pro',
      starter: 'creator',
      free: 'user',
    };

    // Find the highest tier
    let highestTier: keyof typeof UPLOAD_QUOTAS = 'user';
    const tierOrder: (keyof typeof UPLOAD_QUOTAS)[] = ['user', 'creator', 'pro'];

    for (const membership of memberships) {
      const mappedTier = tierPriority[membership.subscriptionTier] || 'user';
      if (tierOrder.indexOf(mappedTier) > tierOrder.indexOf(highestTier)) {
        highestTier = mappedTier;
      }
    }

    return highestTier;
  } catch (error) {
    console.warn('[Security] Failed to check subscription tier:', error);
    return 'user';
  }
}

/**
 * Get upload quota for a user
 */
export async function getUploadQuota(userDid: string): Promise<{
  dailyUploads: number;
  hourlyUploads: number;
  maxFileSizeMB: number;
  dailyUsed: number;
  hourlyUsed: number;
}> {
  // Check user subscription tier from database
  const tier = await getUserSubscriptionTier(userDid);
  const quotas = UPLOAD_QUOTAS[tier];

  try {
    // Get current usage
    const dailyKey = `upload:daily:${userDid}:${new Date().toISOString().slice(0, 10)}`;
    const hourlyKey = `upload:hourly:${userDid}:${new Date().toISOString().slice(0, 13)}`;

    const dailyUsed = parseInt(await redis.get(dailyKey) || '0', 10);
    const hourlyUsed = parseInt(await redis.get(hourlyKey) || '0', 10);

    return {
      ...quotas,
      dailyUsed,
      hourlyUsed,
    };
  } catch {
    // If Redis unavailable, return quotas with 0 usage (allow upload)
    return {
      ...quotas,
      dailyUsed: 0,
      hourlyUsed: 0,
    };
  }
}

/**
 * Upload rate limiter middleware
 */
export function uploadRateLimiter() {
  return async (c: Context, next: Next) => {
    const userDid = c.get('did');
    if (!userDid) {
      throw new HTTPException(401, { message: 'Authentication required for uploads' });
    }

    try {
      const quota = await getUploadQuota(userDid);

      // Check daily limit
      if (quota.dailyUsed >= quota.dailyUploads) {
        throw new HTTPException(429, {
          message: `Daily upload limit reached (${quota.dailyUploads}). Resets at midnight UTC.`,
        });
      }

      // Check hourly limit
      if (quota.hourlyUsed >= quota.hourlyUploads) {
        throw new HTTPException(429, {
          message: `Hourly upload limit reached (${quota.hourlyUploads}). Please wait before uploading more.`,
        });
      }

      // Store quota info for the route handler
      c.set('uploadQuota' as any, quota);
    } catch (error) {
      // Re-throw HTTP exceptions (rate limits)
      if (error instanceof HTTPException) {
        throw error;
      }
      // For other errors (Redis unavailable, etc.), log and continue
      console.warn('Upload rate limiter error:', error);
    }

    await next();
  };
}

/**
 * Record an upload (call after successful upload initiation)
 */
export async function recordUpload(userDid: string): Promise<void> {
  try {
    const dailyKey = `upload:daily:${userDid}:${new Date().toISOString().slice(0, 10)}`;
    const hourlyKey = `upload:hourly:${userDid}:${new Date().toISOString().slice(0, 13)}`;

    await redis.incr(dailyKey);
    await redis.expire(dailyKey, 24 * 60 * 60);

    await redis.incr(hourlyKey);
    await redis.expire(hourlyKey, 60 * 60);
  } catch (error) {
    // Log but don't fail the upload if Redis is unavailable
    console.warn('Failed to record upload for rate limiting:', error);
  }
}

// ==================== INPUT SANITIZATION ====================

/**
 * HTML entities for escaping
 */
const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
  '`': '&#x60;',
  '=': '&#x3D;',
};

/**
 * Escape HTML special characters
 */
export function escapeHtml(str: string): string {
  return str.replace(/[&<>"'`=/]/g, (char) => HTML_ENTITIES[char] || char);
}

/**
 * Strip HTML tags from a string
 */
export function stripHtml(str: string): string {
  return str.replace(/<[^>]*>/g, '');
}

/**
 * Sanitize a string for safe display
 * Removes potentially dangerous content while preserving safe characters
 */
export function sanitizeText(str: string): string {
  // Remove null bytes
  let sanitized = str.replace(/\0/g, '');

  // Remove control characters (except newlines and tabs)
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // Strip HTML tags
  sanitized = stripHtml(sanitized);

  // Trim excessive whitespace
  sanitized = sanitized.replace(/\s+/g, ' ').trim();

  return sanitized;
}

/**
 * Sanitize user input for storage
 * More permissive than display sanitization
 */
export function sanitizeInput(str: string): string {
  // Remove null bytes
  let sanitized = str.replace(/\0/g, '');

  // Remove control characters (except newlines and tabs)
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  return sanitized;
}

/**
 * Validate and sanitize a URL
 */
export function sanitizeUrl(url: string): string | null {
  try {
    const parsed = new URL(url);

    // Only allow http(s) protocols
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return null;
    }

    // Remove javascript: and data: from any part
    if (url.toLowerCase().includes('javascript:') || url.toLowerCase().includes('data:')) {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * Sanitize an object's string properties
 */
export function sanitizeObject<T extends Record<string, unknown>>(
  obj: T,
  fields: (keyof T)[]
): T {
  const sanitized = { ...obj };

  for (const field of fields) {
    const value = sanitized[field];
    if (typeof value === 'string') {
      (sanitized[field] as any) = sanitizeInput(value);
    }
  }

  return sanitized;
}

/**
 * Middleware to sanitize common input fields in request body
 */
export function sanitizeBodyMiddleware(fieldsToSanitize: string[] = []) {
  return async (c: Context, next: Next) => {
    if (['POST', 'PUT', 'PATCH'].includes(c.req.method)) {
      try {
        const body = await c.req.json();

        // Sanitize specified fields or all string fields
        const fields = fieldsToSanitize.length > 0
          ? fieldsToSanitize
          : Object.keys(body).filter((k) => typeof body[k] === 'string');

        const sanitized = sanitizeObject(body, fields);

        // Replace the body getter (Hono's req.json() caches the result)
        (c.req as any)._sanitizedBody = sanitized;
      } catch {
        // Body parsing failed, let the route handler deal with it
      }
    }

    await next();
  };
}

// ==================== SECURITY HEADERS ====================

/**
 * Add additional security headers beyond Hono's secureHeaders
 */
export function additionalSecurityHeaders() {
  return async (c: Context, next: Next) => {
    await next();

    // Prevent clickjacking
    c.header('X-Frame-Options', 'DENY');

    // Prevent MIME sniffing
    c.header('X-Content-Type-Options', 'nosniff');

    // XSS protection (for older browsers)
    c.header('X-XSS-Protection', '1; mode=block');

    // Referrer policy
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Content Security Policy for API responses
    c.header(
      'Content-Security-Policy',
      "default-src 'none'; frame-ancestors 'none'"
    );
  };
}

// ==================== SUSPICIOUS ACTIVITY DETECTION ====================

/**
 * Patterns that may indicate malicious input
 */
const SUSPICIOUS_PATTERNS = [
  // SQL injection
  /(\bor\b|\band\b)\s*[\d'"].*(=|like)/i,
  /;\s*(drop|delete|insert|update|select)\s/i,
  /union\s+(all\s+)?select/i,

  // XSS attempts
  /<script[\s>]/i,
  /javascript:/i,
  /on\w+\s*=/i,

  // Path traversal
  /\.\.\//,
  /\.\.\\/,

  // Command injection
  /[;&|`$]/,
];

/**
 * Check if input looks suspicious (for logging/monitoring)
 */
export function isSuspiciousInput(input: string): boolean {
  return SUSPICIOUS_PATTERNS.some((pattern) => pattern.test(input));
}

/**
 * Log suspicious activity
 */
export function logSuspiciousActivity(
  ip: string,
  endpoint: string,
  reason: string,
  input?: string
): void {
  console.warn(`[SECURITY] Suspicious activity detected:`, {
    ip,
    endpoint,
    reason,
    input: input?.slice(0, 100), // Truncate for logging
    timestamp: new Date().toISOString(),
  });
}
