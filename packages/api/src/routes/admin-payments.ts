/**
 * Admin Payment Configuration Routes
 * Manage payment providers and configurations
 */

import { Hono } from 'hono';
import { eq, and, desc, sql, count } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { db } from '../db/index.js';
import {
  paymentConfigs,
  paymentTransactions,
  paymentCustomers,
  adminAuditLog,
} from '../db/schema.js';
import {
  adminAuthMiddleware,
  requirePermission,
  ADMIN_PERMISSIONS,
} from '../auth/middleware.js';
import { PaymentGatewayFactory } from '../services/payments/PaymentGatewayFactory.js';
import type { PaymentProvider } from '@exprsn/shared/types';

export const adminPaymentsRouter = new Hono();

// Apply admin auth to all routes
adminPaymentsRouter.use('*', adminAuthMiddleware);

// ============================================
// Helper Functions
// ============================================

async function logAudit(
  adminId: string,
  action: string,
  targetType: string | null,
  targetId: string | null,
  details: Record<string, unknown>,
  c: { req: { header: (name: string) => string | undefined } }
) {
  await db.insert(adminAuditLog).values({
    id: nanoid(),
    adminId,
    action,
    targetType,
    targetId,
    details,
    ipAddress: c.req.header('x-forwarded-for') || c.req.header('x-real-ip'),
    userAgent: c.req.header('user-agent'),
  });
}

function sanitizeCredentials(credentials: Record<string, unknown>) {
  // Remove sensitive data from credentials for audit logs
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(credentials)) {
    if (typeof value === 'string' && value.length > 8) {
      sanitized[key] = `${value.substring(0, 4)}...${value.substring(value.length - 4)}`;
    } else {
      sanitized[key] = '[REDACTED]';
    }
  }
  return sanitized;
}

// ============================================
// GLOBAL PAYMENT CONFIGURATION
// ============================================

/**
 * Get global payment configuration (platform-wide)
 */
adminPaymentsRouter.get(
  '/io.exprsn.admin.payments.config.get',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_VIEW),
  async (c) => {
    // Get all platform-level payment configs (no organizationId)
    const configs = await db
      .select()
      .from(paymentConfigs)
      .where(sql`${paymentConfigs.organizationId} IS NULL`)
      .orderBy(desc(paymentConfigs.createdAt));

    return c.json({
      configs: configs.map((config) => ({
        id: config.id,
        provider: config.provider,
        providerAccountId: config.providerAccountId,
        testMode: config.testMode,
        isActive: config.isActive,
        createdAt: config.createdAt.toISOString(),
        updatedAt: config.updatedAt.toISOString(),
        // Don't expose credentials
        hasCredentials: !!config.credentials,
      })),
    });
  }
);

/**
 * Get payment statistics
 */
adminPaymentsRouter.get(
  '/io.exprsn.admin.payments.stats.get',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_VIEW),
  async (c) => {
    const timeframe = c.req.query('timeframe') || '30d';

    // Calculate date range
    const now = new Date();
    let startDate: Date;
    switch (timeframe) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    // Get transaction stats
    const [stats] = await db
      .select({
        totalCount: count(),
        totalVolume: sql<number>`COALESCE(SUM(${paymentTransactions.amount}), 0)`,
        completedCount: sql<number>`COUNT(*) FILTER (WHERE ${paymentTransactions.status} = 'completed')`,
        completedVolume: sql<number>`COALESCE(SUM(${paymentTransactions.amount}) FILTER (WHERE ${paymentTransactions.status} = 'completed'), 0)`,
        pendingCount: sql<number>`COUNT(*) FILTER (WHERE ${paymentTransactions.status} = 'pending')`,
        failedCount: sql<number>`COUNT(*) FILTER (WHERE ${paymentTransactions.status} = 'failed')`,
        refundedAmount: sql<number>`COALESCE(SUM(${paymentTransactions.refundedAmount}), 0)`,
      })
      .from(paymentTransactions)
      .where(sql`${paymentTransactions.createdAt} >= ${startDate}`);

    // Get breakdown by provider
    const providerBreakdown = await db
      .select({
        provider: paymentConfigs.provider,
        count: count(),
        volume: sql<number>`COALESCE(SUM(${paymentTransactions.amount}), 0)`,
      })
      .from(paymentTransactions)
      .leftJoin(paymentConfigs, eq(paymentTransactions.configId, paymentConfigs.id))
      .where(sql`${paymentTransactions.createdAt} >= ${startDate}`)
      .groupBy(paymentConfigs.provider);

    // Get active configs count
    const [activeConfigsResult] = await db
      .select({ count: count() })
      .from(paymentConfigs)
      .where(eq(paymentConfigs.isActive, true));

    return c.json({
      timeframe,
      totalTransactions: stats?.totalCount || 0,
      totalVolume: Number(stats?.totalVolume) || 0,
      completedTransactions: Number(stats?.completedCount) || 0,
      completedVolume: Number(stats?.completedVolume) || 0,
      pendingTransactions: Number(stats?.pendingCount) || 0,
      failedTransactions: Number(stats?.failedCount) || 0,
      refundedAmount: Number(stats?.refundedAmount) || 0,
      activeConfigs: activeConfigsResult?.count || 0,
      providerBreakdown: providerBreakdown.map((p) => ({
        provider: p.provider,
        count: p.count,
        volume: Number(p.volume),
      })),
    });
  }
);

// ============================================
// PAYMENT PROVIDER MANAGEMENT
// ============================================

const createProviderSchema = z.object({
  provider: z.enum(['stripe', 'paypal', 'authorizenet']),
  organizationId: z.string().optional(),
  credentials: z.record(z.string()),
  testMode: z.boolean().default(true),
  providerAccountId: z.string().optional(),
});

/**
 * List configured payment providers
 */
adminPaymentsRouter.get(
  '/io.exprsn.admin.payments.providers.list',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_VIEW),
  async (c) => {
    const organizationId = c.req.query('organizationId');
    const includeInactive = c.req.query('includeInactive') === 'true';

    let query = db.select().from(paymentConfigs);

    const conditions = [];
    if (organizationId) {
      conditions.push(eq(paymentConfigs.organizationId, organizationId));
    } else {
      conditions.push(sql`${paymentConfigs.organizationId} IS NULL`);
    }

    if (!includeInactive) {
      conditions.push(eq(paymentConfigs.isActive, true));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    const configs = await query.orderBy(desc(paymentConfigs.createdAt));

    return c.json({
      providers: configs.map((config) => ({
        id: config.id,
        provider: config.provider,
        providerAccountId: config.providerAccountId,
        organizationId: config.organizationId,
        testMode: config.testMode,
        isActive: config.isActive,
        createdAt: config.createdAt.toISOString(),
        updatedAt: config.updatedAt.toISOString(),
        hasCredentials: !!config.credentials,
      })),
    });
  }
);

/**
 * Create a new payment provider configuration
 */
adminPaymentsRouter.post(
  '/io.exprsn.admin.payments.providers.create',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_EDIT),
  zValidator('json', createProviderSchema),
  async (c) => {
    const adminUser = c.get('adminUser');
    const data = c.req.valid('json');

    // Validate credentials for the provider
    const validation = PaymentGatewayFactory.validateCredentials(
      data.provider as PaymentProvider,
      data.credentials
    );

    if (!validation.valid) {
      return c.json(
        {
          error: 'InvalidCredentials',
          message: `Missing required credentials: ${validation.missing.join(', ')}`,
        },
        400
      );
    }

    // Check for existing config with same provider and org
    const existing = await db
      .select()
      .from(paymentConfigs)
      .where(
        and(
          eq(paymentConfigs.provider, data.provider),
          data.organizationId
            ? eq(paymentConfigs.organizationId, data.organizationId)
            : sql`${paymentConfigs.organizationId} IS NULL`
        )
      )
      .limit(1);

    if (existing.length > 0) {
      return c.json(
        {
          error: 'AlreadyExists',
          message: `A ${data.provider} configuration already exists for this scope`,
        },
        400
      );
    }

    const id = nanoid();

    await db.insert(paymentConfigs).values({
      id,
      organizationId: data.organizationId || null,
      userDid: null, // Admin configs are not user-specific
      provider: data.provider,
      providerAccountId: data.providerAccountId || null,
      credentials: data.credentials,
      testMode: data.testMode,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await logAudit(
      adminUser.id,
      'payment_provider_created',
      'payment_config',
      id,
      {
        provider: data.provider,
        organizationId: data.organizationId,
        testMode: data.testMode,
        credentials: sanitizeCredentials(data.credentials),
      },
      c
    );

    const [config] = await db.select().from(paymentConfigs).where(eq(paymentConfigs.id, id)).limit(1);

    return c.json({
      success: true,
      provider: {
        id: config.id,
        provider: config.provider,
        providerAccountId: config.providerAccountId,
        organizationId: config.organizationId,
        testMode: config.testMode,
        isActive: config.isActive,
        createdAt: config.createdAt.toISOString(),
        updatedAt: config.updatedAt.toISOString(),
      },
    });
  }
);

/**
 * Update payment provider configuration
 */
const updateProviderSchema = z.object({
  credentials: z.record(z.string()).optional(),
  testMode: z.boolean().optional(),
  isActive: z.boolean().optional(),
  providerAccountId: z.string().optional(),
});

adminPaymentsRouter.put(
  '/io.exprsn.admin.payments.providers.update',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_EDIT),
  zValidator('json', updateProviderSchema.extend({ id: z.string() })),
  async (c) => {
    const adminUser = c.get('adminUser');
    const { id, ...data } = c.req.valid('json');

    const [existing] = await db.select().from(paymentConfigs).where(eq(paymentConfigs.id, id)).limit(1);

    if (!existing) {
      return c.json({ error: 'NotFound', message: 'Payment configuration not found' }, 404);
    }

    // Validate credentials if provided
    if (data.credentials) {
      const validation = PaymentGatewayFactory.validateCredentials(
        existing.provider as PaymentProvider,
        data.credentials
      );

      if (!validation.valid) {
        return c.json(
          {
            error: 'InvalidCredentials',
            message: `Missing required credentials: ${validation.missing.join(', ')}`,
          },
          400
        );
      }
    }

    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (data.credentials) updates.credentials = data.credentials;
    if (data.testMode !== undefined) updates.testMode = data.testMode;
    if (data.isActive !== undefined) updates.isActive = data.isActive;
    if (data.providerAccountId !== undefined) updates.providerAccountId = data.providerAccountId;

    await db.update(paymentConfigs).set(updates).where(eq(paymentConfigs.id, id));

    // Clear gateway cache when credentials change
    if (data.credentials) {
      PaymentGatewayFactory.clearCache(id);
    }

    await logAudit(
      adminUser.id,
      'payment_provider_updated',
      'payment_config',
      id,
      {
        changes: {
          ...data,
          credentials: data.credentials ? sanitizeCredentials(data.credentials) : undefined,
        },
      },
      c
    );

    const [config] = await db.select().from(paymentConfigs).where(eq(paymentConfigs.id, id)).limit(1);

    return c.json({
      success: true,
      provider: {
        id: config.id,
        provider: config.provider,
        providerAccountId: config.providerAccountId,
        organizationId: config.organizationId,
        testMode: config.testMode,
        isActive: config.isActive,
        createdAt: config.createdAt.toISOString(),
        updatedAt: config.updatedAt.toISOString(),
      },
    });
  }
);

/**
 * Delete payment provider configuration
 */
adminPaymentsRouter.delete(
  '/io.exprsn.admin.payments.providers.delete',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_EDIT),
  async (c) => {
    const adminUser = c.get('adminUser');
    const id = c.req.query('id');

    if (!id) {
      return c.json({ error: 'InvalidRequest', message: 'Missing id parameter' }, 400);
    }

    const [existing] = await db.select().from(paymentConfigs).where(eq(paymentConfigs.id, id)).limit(1);

    if (!existing) {
      return c.json({ error: 'NotFound', message: 'Payment configuration not found' }, 404);
    }

    // Check if there are any recent transactions using this config
    const [recentTxns] = await db
      .select({ count: count() })
      .from(paymentTransactions)
      .where(
        and(
          eq(paymentTransactions.configId, id),
          sql`${paymentTransactions.createdAt} > NOW() - INTERVAL '30 days'`
        )
      );

    if ((recentTxns?.count || 0) > 0) {
      return c.json(
        {
          error: 'ConfigInUse',
          message: 'Cannot delete payment configuration with recent transactions. Deactivate instead.',
        },
        400
      );
    }

    await db.delete(paymentConfigs).where(eq(paymentConfigs.id, id));

    // Clear gateway cache
    PaymentGatewayFactory.clearCache(id);

    await logAudit(
      adminUser.id,
      'payment_provider_deleted',
      'payment_config',
      id,
      {
        provider: existing.provider,
        organizationId: existing.organizationId,
      },
      c
    );

    return c.json({ success: true });
  }
);

/**
 * Test payment provider connection
 */
adminPaymentsRouter.post(
  '/io.exprsn.admin.payments.providers.test',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_EDIT),
  async (c) => {
    const { id } = await c.req.json<{ id: string }>();

    if (!id) {
      return c.json({ error: 'InvalidRequest', message: 'Missing id' }, 400);
    }

    const [config] = await db.select().from(paymentConfigs).where(eq(paymentConfigs.id, id)).limit(1);

    if (!config) {
      return c.json({ error: 'NotFound', message: 'Payment configuration not found' }, 404);
    }

    if (!config.credentials) {
      return c.json({ error: 'InvalidConfig', message: 'No credentials configured' }, 400);
    }

    try {
      const gateway = PaymentGatewayFactory.create(
        config.provider as PaymentProvider,
        config.credentials as Record<string, string>,
        config.testMode
      );

      const healthCheck = await gateway.healthCheck();

      return c.json({
        success: healthCheck.healthy,
        provider: config.provider,
        testMode: config.testMode,
        message: healthCheck.message || (healthCheck.healthy ? 'Connection successful' : 'Connection failed'),
      });
    } catch (error) {
      console.error('Payment provider test failed:', error);
      return c.json(
        {
          success: false,
          error: 'ConnectionFailed',
          message: error instanceof Error ? error.message : 'Failed to connect to payment provider',
        },
        500
      );
    }
  }
);

/**
 * Get provider metadata (required/optional fields)
 */
adminPaymentsRouter.get(
  '/io.exprsn.admin.payments.providers.metadata',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_VIEW),
  async (c) => {
    const provider = c.req.query('provider') as PaymentProvider | undefined;

    if (provider && !PaymentGatewayFactory.isProviderSupported(provider)) {
      return c.json({ error: 'InvalidProvider', message: 'Unsupported payment provider' }, 400);
    }

    const supportedProviders = PaymentGatewayFactory.getSupportedProviders();

    if (provider) {
      return c.json({
        provider,
        requiredCredentials: PaymentGatewayFactory.getRequiredCredentials(provider),
        optionalCredentials: PaymentGatewayFactory.getOptionalCredentials(provider),
      });
    }

    return c.json({
      supportedProviders,
      providers: supportedProviders.map((p) => ({
        provider: p,
        requiredCredentials: PaymentGatewayFactory.getRequiredCredentials(p),
        optionalCredentials: PaymentGatewayFactory.getOptionalCredentials(p),
      })),
    });
  }
);

// ============================================
// DOMAIN-SCOPED PAYMENT CONFIGURATION
// ============================================

/**
 * Get domain payment configuration
 */
adminPaymentsRouter.get(
  '/io.exprsn.admin.payments.domain.config.get',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_VIEW),
  async (c) => {
    const domainId = c.req.query('domainId');

    if (!domainId) {
      return c.json({ error: 'InvalidRequest', message: 'Missing domainId' }, 400);
    }

    // Get payment configs for this domain
    const configs = await db
      .select()
      .from(paymentConfigs)
      .where(eq(paymentConfigs.organizationId, domainId))
      .orderBy(desc(paymentConfigs.createdAt));

    // Get recent transactions
    const transactions = await db
      .select()
      .from(paymentTransactions)
      .where(sql`${paymentTransactions.configId} IN (SELECT id FROM ${paymentConfigs} WHERE organization_id = ${domainId})`)
      .orderBy(desc(paymentTransactions.createdAt))
      .limit(20);

    return c.json({
      configs: configs.map((config) => ({
        id: config.id,
        provider: config.provider,
        providerAccountId: config.providerAccountId,
        testMode: config.testMode,
        isActive: config.isActive,
        createdAt: config.createdAt.toISOString(),
        updatedAt: config.updatedAt.toISOString(),
        hasCredentials: !!config.credentials,
      })),
      recentTransactions: transactions.map((txn) => ({
        id: txn.id,
        type: txn.type,
        status: txn.status,
        amount: txn.amount,
        currency: txn.currency,
        createdAt: txn.createdAt.toISOString(),
      })),
    });
  }
);

export default adminPaymentsRouter;
