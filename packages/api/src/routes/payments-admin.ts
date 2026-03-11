import { Hono } from 'hono';
import { eq, desc, and, sql, count, sum } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import { paymentConfigs, paymentTransactions, payoutRequests, users, creatorEarnings } from '../db/schema.js';
import { adminAuthMiddleware, requirePermission, ADMIN_PERMISSIONS } from '../auth/middleware.js';
import { PaymentGatewayFactory } from '../services/payments/PaymentGatewayFactory.js';
import type { PaymentProvider } from '@exprsn/shared/types';
import { encryptCredentials, decryptCredentials, isEncrypted } from '../utils/encryption.js';

export const paymentsAdminRouter = new Hono();

// Apply admin auth to all routes
paymentsAdminRouter.use('*', adminAuthMiddleware);

// Helper to safely decrypt credentials - handle both encrypted and unencrypted data
function safeDecryptCredentials(encrypted: unknown): Record<string, string> {
  if (!encrypted || typeof encrypted !== 'object') {
    return {};
  }

  const creds = encrypted as Record<string, string>;

  // Check if already encrypted
  if (!isEncrypted(creds)) {
    return creds;
  }

  try {
    return decryptCredentials(creds);
  } catch (error) {
    console.error('Failed to decrypt credentials:', error);
    throw new Error('Failed to decrypt payment credentials');
  }
}

// ============================================
// Dashboard & Stats
// ============================================

/**
 * Get payment statistics
 */
paymentsAdminRouter.get(
  '/io.exprsn.admin.payments.getStats',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_VIEW),
  async (c) => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Get total volume (completed transactions in last 30 days)
    const [volumeResult] = await db
      .select({ total: sum(paymentTransactions.amount) })
      .from(paymentTransactions)
      .where(
        and(
          eq(paymentTransactions.status, 'completed'),
          sql`${paymentTransactions.createdAt} >= ${thirtyDaysAgo}`
        )
      );

    // Get transaction count
    const [countResult] = await db
      .select({ count: count() })
      .from(paymentTransactions)
      .where(sql`${paymentTransactions.createdAt} >= ${thirtyDaysAgo}`);

    // Get pending payouts
    const [pendingPayoutsResult] = await db
      .select({ total: sum(payoutRequests.amount), count: count() })
      .from(payoutRequests)
      .where(eq(payoutRequests.status, 'pending'));

    // Get active payment configs
    const [activeConfigsResult] = await db
      .select({ count: count() })
      .from(paymentConfigs)
      .where(eq(paymentConfigs.isActive, true));

    return c.json({
      totalVolume: Number(volumeResult?.total || 0),
      transactionCount: countResult?.count || 0,
      pendingPayouts: {
        total: Number(pendingPayoutsResult?.total || 0),
        count: pendingPayoutsResult?.count || 0,
      },
      activeConfigs: activeConfigsResult?.count || 0,
    });
  }
);

// ============================================
// Transactions
// ============================================

/**
 * List transactions
 */
paymentsAdminRouter.get(
  '/io.exprsn.admin.payments.listTransactions',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_VIEW),
  async (c) => {
    const status = c.req.query('status');
    const configId = c.req.query('configId');
    const limit = parseInt(c.req.query('limit') || '50', 10);
    const offset = parseInt(c.req.query('offset') || '0', 10);

    let query = db
      .select({
        transaction: paymentTransactions,
        config: {
          provider: paymentConfigs.provider,
        },
      })
      .from(paymentTransactions)
      .leftJoin(paymentConfigs, eq(paymentTransactions.configId, paymentConfigs.id));

    const conditions = [];
    if (status) conditions.push(eq(paymentTransactions.status, status));
    if (configId) conditions.push(eq(paymentTransactions.configId, configId));

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    const results = await query
      .orderBy(desc(paymentTransactions.createdAt))
      .limit(limit)
      .offset(offset);

    return c.json({
      transactions: results.map(({ transaction, config }) => ({
        id: transaction.id,
        configId: transaction.configId,
        provider: config?.provider,
        type: transaction.type,
        status: transaction.status,
        amount: transaction.amount,
        currency: transaction.currency,
        fromDid: transaction.fromDid,
        toDid: transaction.toDid,
        description: transaction.description,
        providerTransactionId: transaction.providerTransactionId,
        metadata: transaction.metadata,
        errorMessage: transaction.errorMessage,
        refundedAmount: transaction.refundedAmount,
        createdAt: transaction.createdAt.toISOString(),
        updatedAt: transaction.updatedAt.toISOString(),
      })),
    });
  }
);

/**
 * Get transaction details
 */
paymentsAdminRouter.get(
  '/io.exprsn.admin.payments.getTransaction',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_VIEW),
  async (c) => {
    const id = c.req.query('id');

    if (!id) {
      return c.json({ error: 'InvalidRequest', message: 'Missing id' }, 400);
    }

    const [result] = await db
      .select({
        transaction: paymentTransactions,
        config: {
          provider: paymentConfigs.provider,
        },
      })
      .from(paymentTransactions)
      .leftJoin(paymentConfigs, eq(paymentTransactions.configId, paymentConfigs.id))
      .where(eq(paymentTransactions.id, id))
      .limit(1);

    if (!result) {
      return c.json({ error: 'NotFound', message: 'Transaction not found' }, 404);
    }

    const { transaction, config } = result;

    return c.json({
      id: transaction.id,
      configId: transaction.configId,
      provider: config?.provider,
      type: transaction.type,
      status: transaction.status,
      amount: transaction.amount,
      currency: transaction.currency,
      fromDid: transaction.fromDid,
      toDid: transaction.toDid,
      description: transaction.description,
      providerTransactionId: transaction.providerTransactionId,
      metadata: transaction.metadata,
      errorMessage: transaction.errorMessage,
      refundedAmount: transaction.refundedAmount,
      createdAt: transaction.createdAt.toISOString(),
      updatedAt: transaction.updatedAt.toISOString(),
    });
  }
);

/**
 * Refund a transaction
 */
paymentsAdminRouter.post(
  '/io.exprsn.admin.payments.refund',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_EDIT),
  async (c) => {
    const adminUser = c.get('adminUser');
    const { id, reason, amount } = await c.req.json<{ id: string; reason?: string; amount?: number }>();

    if (!id) {
      return c.json({ error: 'InvalidRequest', message: 'Missing id' }, 400);
    }

    // Get transaction with its payment config
    const [transaction] = await db
      .select()
      .from(paymentTransactions)
      .where(eq(paymentTransactions.id, id))
      .limit(1);

    if (!transaction) {
      return c.json({ error: 'NotFound', message: 'Transaction not found' }, 404);
    }

    if (transaction.status !== 'completed') {
      return c.json({ error: 'InvalidState', message: 'Can only refund completed transactions' }, 400);
    }

    // Check if already fully refunded
    const alreadyRefunded = transaction.refundedAmount || 0;
    const maxRefundable = transaction.amount - alreadyRefunded;

    if (maxRefundable <= 0) {
      return c.json({ error: 'InvalidState', message: 'Transaction already fully refunded' }, 400);
    }

    const refundAmount = Math.min(amount || transaction.amount, maxRefundable);
    const isFullRefund = (alreadyRefunded + refundAmount) >= transaction.amount;

    // Get payment config for gateway
    const [config] = await db
      .select()
      .from(paymentConfigs)
      .where(eq(paymentConfigs.id, transaction.configId))
      .limit(1);

    if (!config) {
      return c.json({ error: 'ConfigError', message: 'Payment configuration not found' }, 500);
    }

    // Process refund through payment gateway
    let providerRefundId: string | undefined;

    if (transaction.providerTransactionId) {
      try {
        const credentials = safeDecryptCredentials(config.credentials);
        const gateway = PaymentGatewayFactory.getOrCreate(
          config.id,
          config.provider as PaymentProvider,
          credentials,
          config.testMode
        );

        const refundResult = await gateway.processRefund({
          transactionId: transaction.providerTransactionId,
          amount: refundAmount,
          reason: reason,
        });

        if (!refundResult.success) {
          return c.json({
            error: 'RefundFailed',
            message: refundResult.errorMessage || 'Payment provider refund failed'
          }, 500);
        }

        providerRefundId = refundResult.refundId;
      } catch (error) {
        console.error('Payment gateway refund error:', error);
        return c.json({
          error: 'GatewayError',
          message: error instanceof Error ? error.message : 'Payment gateway error'
        }, 500);
      }
    }

    // Update transaction status
    await db
      .update(paymentTransactions)
      .set({
        status: isFullRefund ? 'refunded' : 'completed',
        refundedAmount: alreadyRefunded + refundAmount,
        metadata: {
          ...((transaction.metadata as Record<string, unknown>) || {}),
          refundReason: reason,
          refundedAt: new Date().toISOString(),
          refundedBy: adminUser?.id,
          providerRefundId,
        },
        updatedAt: new Date(),
      })
      .where(eq(paymentTransactions.id, id));

    // Create refund transaction record
    const refundTxId = nanoid();
    await db.insert(paymentTransactions).values({
      id: refundTxId,
      configId: transaction.configId,
      customerId: transaction.customerId,
      providerTransactionId: providerRefundId,
      type: 'refund',
      status: 'completed',
      amount: -refundAmount, // Negative to indicate refund
      currency: transaction.currency,
      fromDid: transaction.toDid, // Reverse the direction
      toDid: transaction.fromDid,
      description: `Refund for transaction ${transaction.id}${reason ? `: ${reason}` : ''}`,
      metadata: {
        originalTransactionId: transaction.id,
        reason,
        refundedBy: adminUser?.id,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Deduct from creator earnings if applicable
    if (transaction.toDid) {
      const [earnings] = await db
        .select()
        .from(creatorEarnings)
        .where(eq(creatorEarnings.userDid, transaction.toDid))
        .limit(1);

      if (earnings) {
        await db
          .update(creatorEarnings)
          .set({
            totalEarnings: Math.max(0, earnings.totalEarnings - refundAmount),
            availableBalance: Math.max(0, earnings.availableBalance - refundAmount),
          })
          .where(eq(creatorEarnings.userDid, transaction.toDid));
      }
    }

    return c.json({
      success: true,
      refundTransactionId: refundTxId,
      refundAmount,
      isFullRefund,
      providerRefundId,
    });
  }
);

// ============================================
// Payouts
// ============================================

/**
 * List payout requests
 */
paymentsAdminRouter.get(
  '/io.exprsn.admin.payments.listPayouts',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_VIEW),
  async (c) => {
    const status = c.req.query('status');
    const limit = parseInt(c.req.query('limit') || '50', 10);

    let query = db
      .select({
        payout: payoutRequests,
        user: {
          handle: users.handle,
          displayName: users.displayName,
        },
      })
      .from(payoutRequests)
      .leftJoin(users, eq(payoutRequests.userDid, users.did));

    if (status) {
      query = query.where(eq(payoutRequests.status, status)) as typeof query;
    }

    const results = await query.orderBy(desc(payoutRequests.createdAt)).limit(limit);

    return c.json({
      payouts: results.map(({ payout, user }) => ({
        id: payout.id,
        userDid: payout.userDid,
        user: user
          ? {
              handle: user.handle,
              displayName: user.displayName,
            }
          : null,
        amount: payout.amount,
        currency: payout.currency,
        status: payout.status,
        payoutMethod: payout.payoutMethod,
        processedBy: payout.processedBy,
        processedAt: payout.processedAt?.toISOString(),
        createdAt: payout.createdAt.toISOString(),
      })),
    });
  }
);

/**
 * Process payout request
 */
paymentsAdminRouter.post(
  '/io.exprsn.admin.payments.processPayout',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_EDIT),
  async (c) => {
    const adminDid = c.get('did');
    const { id, action } = await c.req.json<{ id: string; action: 'approve' | 'reject' }>();

    if (!id || !action) {
      return c.json({ error: 'InvalidRequest', message: 'Missing id or action' }, 400);
    }

    const [payout] = await db
      .select()
      .from(payoutRequests)
      .where(eq(payoutRequests.id, id))
      .limit(1);

    if (!payout) {
      return c.json({ error: 'NotFound', message: 'Payout request not found' }, 404);
    }

    if (payout.status !== 'pending') {
      return c.json({ error: 'InvalidState', message: 'Payout already processed' }, 400);
    }

    const newStatus = action === 'approve' ? 'processing' : 'rejected';

    await db
      .update(payoutRequests)
      .set({
        status: newStatus,
        processedBy: adminDid,
        processedAt: new Date(),
      })
      .where(eq(payoutRequests.id, id));

    return c.json({ success: true, status: newStatus });
  }
);

// ============================================
// Payment Configs
// ============================================

/**
 * List payment configurations
 */
paymentsAdminRouter.get(
  '/io.exprsn.admin.payments.listConfigs',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_VIEW),
  async (c) => {
    const configs = await db.select().from(paymentConfigs).orderBy(paymentConfigs.provider);

    return c.json({
      configs: configs.map((config) => ({
        id: config.id,
        provider: config.provider,
        organizationId: config.organizationId,
        userDid: config.userDid,
        providerAccountId: config.providerAccountId,
        testMode: config.testMode,
        isActive: config.isActive,
        // Don't expose credentials
        hasCredentials: !!config.credentials,
        createdAt: config.createdAt.toISOString(),
        updatedAt: config.updatedAt.toISOString(),
      })),
    });
  }
);

/**
 * Create/update payment configuration
 */
paymentsAdminRouter.post(
  '/io.exprsn.admin.payments.saveConfig',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_EDIT),
  async (c) => {
    const body = await c.req.json<{
      id?: string;
      provider: string;
      organizationId?: string;
      userDid?: string;
      providerAccountId?: string;
      credentials?: Record<string, string>;
      testMode?: boolean;
      isActive?: boolean;
    }>();

    if (!body.provider) {
      return c.json({ error: 'InvalidRequest', message: 'Missing provider' }, 400);
    }

    const now = new Date();

    if (body.id) {
      // Update existing
      const updates: Record<string, unknown> = { updatedAt: now };
      if (body.providerAccountId !== undefined) updates.providerAccountId = body.providerAccountId;
      if (body.credentials !== undefined) updates.credentials = encryptCredentials(body.credentials);
      if (body.testMode !== undefined) updates.testMode = body.testMode;
      if (body.isActive !== undefined) updates.isActive = body.isActive;

      await db.update(paymentConfigs).set(updates).where(eq(paymentConfigs.id, body.id));

      return c.json({ id: body.id });
    } else {
      // Create new
      const id = nanoid();
      await db.insert(paymentConfigs).values({
        id,
        provider: body.provider,
        organizationId: body.organizationId,
        userDid: body.userDid,
        providerAccountId: body.providerAccountId,
        credentials: body.credentials ? encryptCredentials(body.credentials) : undefined,
        testMode: body.testMode ?? true,
        isActive: body.isActive ?? false,
        createdAt: now,
        updatedAt: now,
      });

      return c.json({ id }, 201);
    }
  }
);

/**
 * Toggle payment config active status
 */
paymentsAdminRouter.post(
  '/io.exprsn.admin.payments.toggleConfig',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_EDIT),
  async (c) => {
    const { id, isActive } = await c.req.json<{ id: string; isActive: boolean }>();

    if (!id) {
      return c.json({ error: 'InvalidRequest', message: 'Missing id' }, 400);
    }

    await db
      .update(paymentConfigs)
      .set({ isActive, updatedAt: new Date() })
      .where(eq(paymentConfigs.id, id));

    return c.json({ success: true });
  }
);

/**
 * Delete payment configuration
 */
paymentsAdminRouter.post(
  '/io.exprsn.admin.payments.deleteConfig',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_EDIT),
  async (c) => {
    const { id } = await c.req.json<{ id: string }>();

    if (!id) {
      return c.json({ error: 'InvalidRequest', message: 'Missing id' }, 400);
    }

    await db.delete(paymentConfigs).where(eq(paymentConfigs.id, id));

    return c.json({ success: true });
  }
);

export default paymentsAdminRouter;
