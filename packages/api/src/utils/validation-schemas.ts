/**
 * Shared Zod validation schemas for API input validation
 * Provides reusable, type-safe input validation for critical endpoints
 */

import { z } from 'zod';

// =============================================================================
// Common Patterns
// =============================================================================

// DID format validation
export const didSchema = z.string().refine(
  (val) => /^did:(plc|web|exprn|key):[a-zA-Z0-9._:-]+$/.test(val),
  { message: 'Invalid DID format' }
);

// Handle validation
export const handleSchema = z.string()
  .min(3, 'Handle must be at least 3 characters')
  .max(20, 'Handle must be at most 20 characters')
  .regex(/^[a-z0-9_]+$/, 'Handle can only contain lowercase letters, numbers, and underscores')
  .refine((val) => !val.startsWith('_') && !val.endsWith('_'), {
    message: 'Handle cannot start or end with underscore'
  })
  .refine((val) => !['admin', 'api', 'app', 'auth', 'root', 'system', 'exprsn', 'support', 'help'].includes(val), {
    message: 'This handle is reserved'
  });

// Email validation
export const emailSchema = z.string()
  .email('Invalid email format')
  .max(255, 'Email must be at most 255 characters')
  .toLowerCase()
  .trim();

// Password validation
export const passwordSchema = z.string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .refine((val) => /[a-z]/.test(val) && /[A-Z]/.test(val), {
    message: 'Password must contain both uppercase and lowercase letters'
  })
  .refine((val) => /[0-9]/.test(val), {
    message: 'Password must contain at least one number'
  });

// Display name validation
export const displayNameSchema = z.string()
  .min(1, 'Display name is required')
  .max(50, 'Display name must be at most 50 characters')
  .trim();

// URL validation
export const urlSchema = z.string()
  .url('Invalid URL format')
  .max(2048, 'URL must be at most 2048 characters');

// Amount (cents) validation for payments
export const amountSchema = z.number()
  .int('Amount must be an integer')
  .min(1, 'Amount must be positive')
  .max(999999999, 'Amount exceeds maximum'); // ~$10M limit

// Currency validation
export const currencySchema = z.enum(['usd', 'eur', 'gbp', 'cad', 'aud', 'jpy']);

// Pagination
export const paginationSchema = z.object({
  limit: z.number().int().min(1).max(100).optional().default(20),
  cursor: z.string().optional(),
});

// =============================================================================
// Authentication Schemas
// =============================================================================

export const createAccountSchema = z.object({
  handle: handleSchema,
  email: emailSchema,
  password: passwordSchema,
  displayName: displayNameSchema.optional(),
  accountType: z.enum(['personal', 'creator', 'business', 'organization']).optional(),
  organizationType: z.enum(['team', 'enterprise', 'nonprofit', 'business', 'company', 'network', 'label', 'brand', 'channel']).optional(),
  organizationName: z.string().min(2).max(100).optional(),
  didMethod: z.enum(['plc', 'web', 'exprn']).optional(),
});

export const createSessionSchema = z.object({
  identifier: z.string().min(1, 'Identifier is required').trim(),
  password: z.string().min(1, 'Password is required'),
});

export const revokeSessionSchema = z.object({
  sessionId: z.string().min(1, 'Session ID is required'),
});

// =============================================================================
// Payment Schemas
// =============================================================================

export const createPaymentConfigSchema = z.object({
  provider: z.enum(['stripe', 'paypal', 'authorizenet'], {
    errorMap: () => ({ message: 'Invalid payment provider' })
  }),
  credentials: z.record(z.string()).refine(
    (creds) => Object.keys(creds).length > 0,
    { message: 'Credentials are required' }
  ),
  organizationId: z.string().optional(),
  testMode: z.boolean().optional(),
});

export const updatePaymentConfigSchema = z.object({
  configId: z.string().min(1, 'Config ID is required'),
  credentials: z.record(z.string()).optional(),
  testMode: z.boolean().optional(),
  isActive: z.boolean().optional(),
}).refine(
  (data) => data.credentials !== undefined || data.testMode !== undefined || data.isActive !== undefined,
  { message: 'At least one field must be provided for update' }
);

export const deletePaymentConfigSchema = z.object({
  configId: z.string().min(1, 'Config ID is required'),
});

export const chargeSchema = z.object({
  configId: z.string().min(1, 'Config ID is required'),
  amount: amountSchema,
  currency: currencySchema.optional(),
  recipientDid: didSchema.optional(),
  description: z.string().max(500).optional(),
  paymentMethodId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  capture: z.boolean().optional(),
});

export const refundSchema = z.object({
  transactionId: z.string().min(1, 'Transaction ID is required'),
  amount: amountSchema.optional(),
  reason: z.string().max(500).optional(),
});

export const tipSchema = z.object({
  recipientDid: didSchema,
  amount: amountSchema.min(100, 'Minimum tip is $1.00 (100 cents)'),
  message: z.string().max(500).optional(),
  paymentMethodId: z.string().optional(),
});

export const capturePaymentSchema = z.object({
  transactionId: z.string().min(1, 'Transaction ID is required'),
  amount: amountSchema.optional(),
});

export const voidPaymentSchema = z.object({
  transactionId: z.string().min(1, 'Transaction ID is required'),
});

export const attachPaymentMethodSchema = z.object({
  configId: z.string().min(1, 'Config ID is required'),
  token: z.string().min(1, 'Token is required'),
  setAsDefault: z.boolean().optional(),
});

export const removePaymentMethodSchema = z.object({
  paymentMethodId: z.string().min(1, 'Payment method ID is required'),
});

export const createSubscriptionTierSchema = z.object({
  name: z.string().min(1).max(50, 'Name must be at most 50 characters'),
  description: z.string().max(500).optional(),
  price: amountSchema.min(100, 'Minimum price is $1.00 per month'),
  benefits: z.object({
    earlyAccess: z.boolean().optional(),
    exclusiveContent: z.boolean().optional(),
    behindTheScenes: z.boolean().optional(),
    directMessaging: z.boolean().optional(),
    customEmojis: z.boolean().optional(),
    badgeColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  }).optional(),
  maxSubscribers: z.number().int().min(1).optional(),
});

export const subscribeSchema = z.object({
  tierId: z.string().min(1, 'Tier ID is required'),
  paymentMethodId: z.string().optional(),
});

export const cancelSubscriptionSchema = z.object({
  subscriptionId: z.string().min(1, 'Subscription ID is required'),
});

// =============================================================================
// Organization Schemas
// =============================================================================

export const createOrganizationSchema = z.object({
  name: z.string()
    .min(2, 'Organization name must be at least 2 characters')
    .max(100, 'Organization name must be at most 100 characters')
    .trim(),
  type: z.enum(['team', 'enterprise', 'nonprofit', 'business', 'company', 'network', 'label', 'brand', 'channel']),
  description: z.string().max(500, 'Description must be at most 500 characters').optional(),
  website: urlSchema.optional(),
});

export const updateOrganizationSchema = z.object({
  id: z.string().min(1, 'Organization ID is required'),
  name: z.string().min(2).max(100).trim().optional(),
  description: z.string().max(500).optional(),
  website: urlSchema.optional(),
  avatar: urlSchema.optional(),
}).refine(
  (data) => data.name !== undefined || data.description !== undefined || data.website !== undefined || data.avatar !== undefined,
  { message: 'At least one field must be provided for update' }
);

export const inviteMemberSchema = z.object({
  organizationId: z.string().min(1, 'Organization ID is required'),
  email: emailSchema,
  role: z.enum(['owner', 'admin', 'editor', 'moderator', 'creator', 'viewer']),
  customPermissions: z.array(z.string()).optional(),
});

export const updateMemberRoleSchema = z.object({
  organizationId: z.string().min(1, 'Organization ID is required'),
  memberDid: didSchema,
  role: z.enum(['admin', 'editor', 'moderator', 'creator', 'viewer']),
});

export const removeMemberSchema = z.object({
  organizationId: z.string().min(1, 'Organization ID is required'),
  memberDid: didSchema,
});

export const respondToInviteSchema = z.object({
  inviteId: z.string().min(1, 'Invite ID is required'),
  accept: z.boolean(),
});

// =============================================================================
// Settings Schemas
// =============================================================================

export const updateSettingsSchema = z.object({
  themeId: z.enum(['ocean', 'forest', 'sunset', 'lavender', 'slate']).optional(),
  colorMode: z.enum(['light', 'dark', 'system']).optional(),
  accessibility: z.object({
    reducedMotion: z.boolean().optional(),
    highContrast: z.boolean().optional(),
    largeText: z.boolean().optional(),
    screenReaderOptimized: z.boolean().optional(),
    fontPreference: z.enum(['inter', 'open-dyslexic']).optional(),
  }).optional(),
  playback: z.object({
    autoplay: z.boolean().optional(),
    defaultQuality: z.enum(['auto', 'high', 'medium', 'low']).optional(),
    defaultMuted: z.boolean().optional(),
    loopVideos: z.boolean().optional(),
    dataSaver: z.boolean().optional(),
  }).optional(),
  notifications: z.object({
    likes: z.boolean().optional(),
    comments: z.boolean().optional(),
    follows: z.boolean().optional(),
    mentions: z.boolean().optional(),
    directMessages: z.boolean().optional(),
    emailDigest: z.enum(['never', 'daily', 'weekly']).optional(),
  }).optional(),
  privacy: z.object({
    privateAccount: z.boolean().optional(),
    showActivityStatus: z.boolean().optional(),
    allowDuets: z.boolean().optional(),
    allowStitches: z.boolean().optional(),
    allowComments: z.enum(['everyone', 'following', 'nobody']).optional(),
    allowMessages: z.enum(['everyone', 'following', 'nobody']).optional(),
  }).optional(),
  content: z.object({
    language: z.string().length(2).optional(), // ISO 639-1 language code
    contentWarnings: z.boolean().optional(),
    sensitiveContent: z.boolean().optional(),
  }).optional(),
  layout: z.object({
    commentsPosition: z.enum(['side', 'bottom']).optional(),
  }).optional(),
  editor: z.object({
    defaultPresetId: z.string().nullable().optional(),
    favoritePresetIds: z.array(z.string()).optional(),
    recentPresetIds: z.array(z.string()).optional(),
    customPresets: z.array(z.unknown()).optional(),
    showPresetDescriptions: z.boolean().optional(),
    autoApplyDefault: z.boolean().optional(),
  }).optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one setting must be provided for update' }
);

// =============================================================================
// Video Upload/Create Schemas
// =============================================================================

export const createVideoMetadataSchema = z.object({
  title: z.string()
    .min(1, 'Title is required')
    .max(200, 'Title must be at most 200 characters')
    .trim(),
  description: z.string().max(5000, 'Description must be at most 5000 characters').optional(),
  tags: z.array(z.string().max(50)).max(30, 'Maximum 30 tags allowed').optional(),
  privacy: z.enum(['public', 'unlisted', 'private', 'followers']).optional(),
  allowComments: z.boolean().optional(),
  allowDuets: z.boolean().optional(),
  allowStitches: z.boolean().optional(),
  contentWarning: z.enum(['none', 'sensitive', 'graphic', 'spoiler']).optional(),
  organizationId: z.string().optional(),
  scheduledPublishAt: z.string().datetime().optional(),
});

// =============================================================================
// Moderation Schemas
// =============================================================================

export const submitReportSchema = z.object({
  contentType: z.enum(['video', 'comment', 'user', 'chat']),
  contentUri: z.string().min(1, 'Content URI is required'),
  reason: z.enum([
    'spam',
    'harassment',
    'hate_speech',
    'violence',
    'nudity',
    'misinformation',
    'copyright',
    'impersonation',
    'self_harm',
    'illegal',
    'other'
  ]),
  description: z.string()
    .min(10, 'Description must be at least 10 characters')
    .max(1000, 'Description must be at most 1000 characters')
    .trim(),
  additionalContext: z.record(z.unknown()).optional(),
});

export const submitAppealSchema = z.object({
  sanctionId: z.string().min(1, 'Sanction ID is required'),
  reason: z.string()
    .min(50, 'Appeal reason must be at least 50 characters')
    .max(2000, 'Appeal reason must be at most 2000 characters')
    .trim(),
  additionalInfo: z.string().max(5000).optional(),
});

// =============================================================================
// Admin Action Schemas
// =============================================================================

export const createSanctionSchema = z.object({
  userDid: didSchema,
  sanctionType: z.enum(['warning', 'mute', 'suspend', 'ban']),
  reason: z.string().min(10).max(1000),
  duration: z.number().int().min(1).optional(), // Duration in days, undefined = permanent
  internalNotes: z.string().max(5000).optional(),
});

export const reviewReportSchema = z.object({
  reportId: z.string().min(1, 'Report ID is required'),
  decision: z.enum(['approve', 'reject', 'escalate']),
  actionTaken: z.string().max(500).optional(),
  reviewNotes: z.string().max(2000).optional(),
});

export const reviewAppealSchema = z.object({
  appealId: z.string().min(1, 'Appeal ID is required'),
  decision: z.enum(['approve', 'deny']),
  reviewNotes: z.string().max(2000).optional(),
});

// =============================================================================
// OAuth Schemas
// =============================================================================

export const oauthCallbackSchema = z.object({
  code: z.string().min(1, 'Authorization code is required'),
  state: z.string().min(1, 'State parameter is required'),
  iss: z.string().url().optional(), // Issuer from OAuth provider
});

export const oauthTokenRefreshSchema = z.object({
  refresh_token: z.string().min(1, 'Refresh token is required'),
});

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Validate and parse request body with Zod schema
 * Throws HTTPException with appropriate error messages on validation failure
 */
export async function validateBody<T>(
  req: Request,
  schema: z.ZodSchema<T>
): Promise<T> {
  try {
    const body = await req.json();
    return schema.parse(body);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));

      // Return first error for simplicity
      const firstIssue = issues[0];
      throw new Error(firstIssue?.message || 'Validation failed');
    }
    throw error;
  }
}

/**
 * Validate query parameters with Zod schema
 */
export function validateQuery<T>(
  query: Record<string, string | undefined>,
  schema: z.ZodSchema<T>
): T {
  try {
    return schema.parse(query);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstIssue = error.issues[0];
      throw new Error(firstIssue?.message || 'Query validation failed');
    }
    throw error;
  }
}
