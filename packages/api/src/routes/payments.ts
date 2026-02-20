import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import {
  paymentConfigs,
  paymentCustomers,
  paymentTransactions,
  paymentMethods,
  creatorEarnings,
  users,
  organizations,
  organizationMembers,
} from '../db/schema.js';
import { eq, and, desc, sql } from 'drizzle-orm';
import { authMiddleware } from '../auth/middleware.js';
import { PaymentGatewayFactory } from '../services/payments/index.js';
import type { PaymentProvider } from '@exprsn/shared/types';

type AuthContext = {
  Variables: {
    did: string;
  };
};

export const paymentRoutes = new Hono<AuthContext>();

// Helper to check organization payment permission
async function checkOrgPaymentPermission(
  userDid: string,
  organizationId: string
): Promise<boolean> {
  const result = await db
    .select()
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, organizationId),
        eq(organizationMembers.userDid, userDid)
      )
    )
    .limit(1);

  const member = result[0];
  if (!member) return false;

  // Owner or admin can manage payments
  return member.role === 'owner' || member.role === 'admin';
}

// Helper to decrypt credentials (placeholder - implement with proper encryption)
function decryptCredentials(encrypted: unknown): Record<string, string> {
  // In production, use proper encryption (e.g., node-forge with a key from env)
  // For now, assuming credentials are stored as JSON
  return encrypted as Record<string, string>;
}

// Helper to encrypt credentials (placeholder - implement with proper encryption)
function encryptCredentials(credentials: Record<string, string>): Record<string, string> {
  // In production, use proper encryption
  return credentials;
}

// ============================================
// Payment Configuration
// ============================================

// Create payment configuration
paymentRoutes.post('/io.exprsn.payments.createConfig', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const body = await c.req.json<{
    provider: PaymentProvider;
    credentials: Record<string, string>;
    organizationId?: string;
    testMode?: boolean;
  }>();

  if (!body.provider || !body.credentials) {
    throw new HTTPException(400, { message: 'Provider and credentials required' });
  }

  // Validate provider
  if (!PaymentGatewayFactory.isProviderSupported(body.provider)) {
    throw new HTTPException(400, {
      message: `Unsupported provider. Supported: ${PaymentGatewayFactory.getSupportedProviders().join(', ')}`,
    });
  }

  // Validate credentials
  const validation = PaymentGatewayFactory.validateCredentials(body.provider, body.credentials);
  if (!validation.valid) {
    throw new HTTPException(400, {
      message: `Missing required credentials: ${validation.missing.join(', ')}`,
    });
  }

  // Check organization permission if org config
  if (body.organizationId) {
    const hasPermission = await checkOrgPaymentPermission(userDid, body.organizationId);
    if (!hasPermission) {
      throw new HTTPException(403, { message: 'Permission denied' });
    }
  }

  // Check for existing config
  const existingQuery = body.organizationId
    ? and(
        eq(paymentConfigs.organizationId, body.organizationId),
        eq(paymentConfigs.provider, body.provider)
      )
    : and(
        eq(paymentConfigs.userDid, userDid),
        eq(paymentConfigs.provider, body.provider),
        sql`${paymentConfigs.organizationId} IS NULL`
      );

  const existing = await db
    .select()
    .from(paymentConfigs)
    .where(existingQuery)
    .limit(1);

  if (existing[0]) {
    throw new HTTPException(409, {
      message: 'Payment configuration for this provider already exists',
    });
  }

  // Test the gateway connection
  const testMode = body.testMode !== false;
  try {
    const gateway = PaymentGatewayFactory.create(body.provider, body.credentials, testMode);
    const health = await gateway.healthCheck();
    if (!health.healthy) {
      throw new HTTPException(400, {
        message: `Failed to connect to ${body.provider}: ${health.message}`,
      });
    }
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    throw new HTTPException(400, {
      message: `Invalid credentials for ${body.provider}`,
    });
  }

  const configId = nanoid();
  const now = new Date();

  await db.insert(paymentConfigs).values({
    id: configId,
    organizationId: body.organizationId || null,
    userDid: body.organizationId ? null : userDid,
    provider: body.provider,
    credentials: encryptCredentials(body.credentials),
    testMode,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });

  return c.json({
    id: configId,
    provider: body.provider,
    testMode,
    isActive: true,
  });
});

// Get payment configurations
paymentRoutes.get('/io.exprsn.payments.getConfigs', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const organizationId = c.req.query('organizationId');

  let query;
  if (organizationId) {
    const hasPermission = await checkOrgPaymentPermission(userDid, organizationId);
    if (!hasPermission) {
      throw new HTTPException(403, { message: 'Permission denied' });
    }
    query = eq(paymentConfigs.organizationId, organizationId);
  } else {
    query = and(
      eq(paymentConfigs.userDid, userDid),
      sql`${paymentConfigs.organizationId} IS NULL`
    );
  }

  const configs = await db
    .select({
      id: paymentConfigs.id,
      provider: paymentConfigs.provider,
      testMode: paymentConfigs.testMode,
      isActive: paymentConfigs.isActive,
      createdAt: paymentConfigs.createdAt,
    })
    .from(paymentConfigs)
    .where(query)
    .orderBy(desc(paymentConfigs.createdAt));

  return c.json({ configs });
});

// Update payment configuration
paymentRoutes.post('/io.exprsn.payments.updateConfig', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const body = await c.req.json<{
    configId: string;
    credentials?: Record<string, string>;
    testMode?: boolean;
    isActive?: boolean;
  }>();

  if (!body.configId) {
    throw new HTTPException(400, { message: 'Config ID required' });
  }

  // Get existing config
  const existing = await db
    .select()
    .from(paymentConfigs)
    .where(eq(paymentConfigs.id, body.configId))
    .limit(1);

  const config = existing[0];
  if (!config) {
    throw new HTTPException(404, { message: 'Configuration not found' });
  }

  // Check permission
  if (config.organizationId) {
    const hasPermission = await checkOrgPaymentPermission(userDid, config.organizationId);
    if (!hasPermission) {
      throw new HTTPException(403, { message: 'Permission denied' });
    }
  } else if (config.userDid !== userDid) {
    throw new HTTPException(403, { message: 'Permission denied' });
  }

  const updates: Partial<typeof paymentConfigs.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (body.credentials !== undefined) {
    // Validate credentials
    const validation = PaymentGatewayFactory.validateCredentials(
      config.provider as PaymentProvider,
      body.credentials
    );
    if (!validation.valid) {
      throw new HTTPException(400, {
        message: `Missing required credentials: ${validation.missing.join(', ')}`,
      });
    }
    updates.credentials = encryptCredentials(body.credentials);
    PaymentGatewayFactory.clearCache(body.configId);
  }

  if (body.testMode !== undefined) {
    updates.testMode = body.testMode;
    PaymentGatewayFactory.clearCache(body.configId);
  }

  if (body.isActive !== undefined) {
    updates.isActive = body.isActive;
  }

  await db
    .update(paymentConfigs)
    .set(updates)
    .where(eq(paymentConfigs.id, body.configId));

  return c.json({ success: true });
});

// Delete payment configuration
paymentRoutes.post('/io.exprsn.payments.deleteConfig', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const body = await c.req.json<{ configId: string }>();
  if (!body.configId) {
    throw new HTTPException(400, { message: 'Config ID required' });
  }

  const existing = await db
    .select()
    .from(paymentConfigs)
    .where(eq(paymentConfigs.id, body.configId))
    .limit(1);

  const config = existing[0];
  if (!config) {
    throw new HTTPException(404, { message: 'Configuration not found' });
  }

  // Check permission
  if (config.organizationId) {
    const hasPermission = await checkOrgPaymentPermission(userDid, config.organizationId);
    if (!hasPermission) {
      throw new HTTPException(403, { message: 'Permission denied' });
    }
  } else if (config.userDid !== userDid) {
    throw new HTTPException(403, { message: 'Permission denied' });
  }

  // Clear cache and delete
  PaymentGatewayFactory.clearCache(body.configId);
  await db.delete(paymentConfigs).where(eq(paymentConfigs.id, body.configId));

  return c.json({ success: true });
});

// ============================================
// Payment Processing
// ============================================

// Process a charge
paymentRoutes.post('/io.exprsn.payments.charge', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const body = await c.req.json<{
    configId: string;
    amount: number;
    currency?: string;
    recipientDid?: string;
    description?: string;
    paymentMethodId?: string;
    metadata?: Record<string, unknown>;
    capture?: boolean;
  }>();

  if (!body.configId || !body.amount) {
    throw new HTTPException(400, { message: 'Config ID and amount required' });
  }

  if (body.amount <= 0) {
    throw new HTTPException(400, { message: 'Amount must be positive' });
  }

  // Get config
  const configResult = await db
    .select()
    .from(paymentConfigs)
    .where(eq(paymentConfigs.id, body.configId))
    .limit(1);

  const config = configResult[0];
  if (!config) {
    throw new HTTPException(404, { message: 'Payment configuration not found' });
  }

  if (!config.isActive) {
    throw new HTTPException(400, { message: 'Payment configuration is inactive' });
  }

  // Get or create payment customer
  let customerId: string | undefined;
  const customerResult = await db
    .select()
    .from(paymentCustomers)
    .where(
      and(
        eq(paymentCustomers.userDid, userDid),
        eq(paymentCustomers.configId, body.configId)
      )
    )
    .limit(1);

  if (customerResult[0]) {
    customerId = customerResult[0].providerCustomerId || undefined;
  }

  // Get gateway
  const credentials = decryptCredentials(config.credentials);
  const gateway = PaymentGatewayFactory.getOrCreate(
    body.configId,
    config.provider as PaymentProvider,
    credentials,
    config.testMode ?? true
  );

  // Process payment
  const currencyLower = body.currency?.toLowerCase() || 'usd';
  const validCurrencies = ['usd', 'eur', 'gbp', 'cad', 'aud', 'jpy'] as const;
  const currency = validCurrencies.includes(currencyLower as typeof validCurrencies[number])
    ? (currencyLower as typeof validCurrencies[number])
    : 'usd';

  const result = await gateway.processPayment({
    amount: body.amount,
    currency,
    customerId,
    paymentMethodId: body.paymentMethodId,
    description: body.description,
    metadata: body.metadata,
    capture: body.capture,
  });

  // Record transaction
  const transactionId = nanoid();
  await db.insert(paymentTransactions).values({
    id: transactionId,
    configId: body.configId,
    providerTransactionId: result.transactionId,
    type: 'charge',
    status: result.status,
    amount: body.amount,
    currency: body.currency?.toLowerCase() || 'usd',
    fromDid: userDid,
    toDid: body.recipientDid || null,
    metadata: {
      description: body.description,
      ...body.metadata,
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
    },
    createdAt: new Date(),
  });

  // If successful and has recipient, update creator earnings
  if (result.success && body.recipientDid) {
    const platformFee = Math.floor(body.amount * 0.1); // 10% platform fee
    const creatorAmount = body.amount - platformFee;

    await db
      .insert(creatorEarnings)
      .values({
        userDid: body.recipientDid,
        totalEarnings: creatorAmount,
        pendingBalance: creatorAmount,
        availableBalance: 0,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: creatorEarnings.userDid,
        set: {
          totalEarnings: sql`${creatorEarnings.totalEarnings} + ${creatorAmount}`,
          pendingBalance: sql`${creatorEarnings.pendingBalance} + ${creatorAmount}`,
          updatedAt: new Date(),
        },
      });
  }

  return c.json({
    success: result.success,
    transactionId,
    providerTransactionId: result.transactionId,
    status: result.status,
    amount: result.amount,
    currency: result.currency,
    requiresAction: result.requiresAction,
    clientSecret: result.clientSecret,
    errorMessage: result.errorMessage,
  });
});

// Process a refund
paymentRoutes.post('/io.exprsn.payments.refund', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const body = await c.req.json<{
    transactionId: string;
    amount?: number;
    reason?: string;
  }>();

  if (!body.transactionId) {
    throw new HTTPException(400, { message: 'Transaction ID required' });
  }

  // Get original transaction
  const txResult = await db
    .select({
      tx: paymentTransactions,
      config: paymentConfigs,
    })
    .from(paymentTransactions)
    .innerJoin(paymentConfigs, eq(paymentConfigs.id, paymentTransactions.configId))
    .where(eq(paymentTransactions.id, body.transactionId))
    .limit(1);

  const txData = txResult[0];
  if (!txData) {
    throw new HTTPException(404, { message: 'Transaction not found' });
  }

  // Check permission (must be config owner or org admin)
  const config = txData.config;
  if (config.organizationId) {
    const hasPermission = await checkOrgPaymentPermission(userDid, config.organizationId);
    if (!hasPermission) {
      throw new HTTPException(403, { message: 'Permission denied' });
    }
  } else if (config.userDid !== userDid) {
    throw new HTTPException(403, { message: 'Permission denied' });
  }

  if (txData.tx.status !== 'completed') {
    throw new HTTPException(400, { message: 'Can only refund completed transactions' });
  }

  // Get gateway
  const credentials = decryptCredentials(config.credentials);
  const gateway = PaymentGatewayFactory.getOrCreate(
    config.id,
    config.provider as PaymentProvider,
    credentials,
    config.testMode ?? true
  );

  // Process refund
  const result = await gateway.processRefund({
    transactionId: txData.tx.providerTransactionId || '',
    amount: body.amount,
    reason: body.reason,
  });

  // Record refund transaction
  const refundTxId = nanoid();
  await db.insert(paymentTransactions).values({
    id: refundTxId,
    configId: config.id,
    providerTransactionId: result.refundId,
    type: 'refund',
    status: result.status === 'succeeded' ? 'completed' : result.status === 'pending' ? 'pending' : 'failed',
    amount: result.amount,
    currency: txData.tx.currency,
    fromDid: txData.tx.toDid,
    toDid: txData.tx.fromDid,
    metadata: {
      originalTransactionId: body.transactionId,
      reason: body.reason,
      errorMessage: result.errorMessage,
    },
    createdAt: new Date(),
  });

  // Update original transaction status
  if (result.success) {
    const isPartial = body.amount && body.amount < txData.tx.amount;
    await db
      .update(paymentTransactions)
      .set({ status: isPartial ? 'completed' : 'refunded' })
      .where(eq(paymentTransactions.id, body.transactionId));

    // Deduct from creator earnings if applicable
    if (txData.tx.toDid) {
      await db
        .update(creatorEarnings)
        .set({
          totalEarnings: sql`${creatorEarnings.totalEarnings} - ${result.amount}`,
          pendingBalance: sql`GREATEST(0, ${creatorEarnings.pendingBalance} - ${result.amount})`,
          updatedAt: new Date(),
        })
        .where(eq(creatorEarnings.userDid, txData.tx.toDid));
    }
  }

  return c.json({
    success: result.success,
    refundId: refundTxId,
    providerRefundId: result.refundId,
    amount: result.amount,
    status: result.status,
    errorMessage: result.errorMessage,
  });
});

// Send a tip
paymentRoutes.post('/io.exprsn.payments.tip', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const body = await c.req.json<{
    recipientDid: string;
    amount: number;
    message?: string;
    paymentMethodId?: string;
  }>();

  if (!body.recipientDid || !body.amount) {
    throw new HTTPException(400, { message: 'Recipient and amount required' });
  }

  if (body.amount < 100) {
    throw new HTTPException(400, { message: 'Minimum tip is $1.00 (100 cents)' });
  }

  if (body.recipientDid === userDid) {
    throw new HTTPException(400, { message: 'Cannot tip yourself' });
  }

  // Get recipient's active payment config
  const recipientConfigResult = await db
    .select()
    .from(paymentConfigs)
    .where(
      and(
        eq(paymentConfigs.userDid, body.recipientDid),
        eq(paymentConfigs.isActive, true),
        sql`${paymentConfigs.organizationId} IS NULL`
      )
    )
    .limit(1);

  const recipientConfig = recipientConfigResult[0];
  if (!recipientConfig) {
    throw new HTTPException(400, { message: 'Recipient has no active payment configuration' });
  }

  // Get gateway
  const credentials = decryptCredentials(recipientConfig.credentials);
  const gateway = PaymentGatewayFactory.getOrCreate(
    recipientConfig.id,
    recipientConfig.provider as PaymentProvider,
    credentials,
    recipientConfig.testMode ?? true
  );

  // Process tip payment
  const result = await gateway.processPayment({
    amount: body.amount,
    currency: 'usd',
    paymentMethodId: body.paymentMethodId,
    description: `Tip from ${userDid}`,
    metadata: {
      type: 'tip',
      message: body.message,
      senderDid: userDid,
    },
  });

  // Record transaction
  const transactionId = nanoid();
  await db.insert(paymentTransactions).values({
    id: transactionId,
    configId: recipientConfig.id,
    providerTransactionId: result.transactionId,
    type: 'tip',
    status: result.status,
    amount: body.amount,
    currency: 'usd',
    fromDid: userDid,
    toDid: body.recipientDid,
    metadata: {
      message: body.message,
      errorMessage: result.errorMessage,
    },
    createdAt: new Date(),
  });

  // Update creator earnings if successful
  if (result.success) {
    const platformFee = Math.floor(body.amount * 0.05); // 5% platform fee for tips
    const creatorAmount = body.amount - platformFee;

    await db
      .insert(creatorEarnings)
      .values({
        userDid: body.recipientDid,
        totalEarnings: creatorAmount,
        pendingBalance: creatorAmount,
        availableBalance: 0,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: creatorEarnings.userDid,
        set: {
          totalEarnings: sql`${creatorEarnings.totalEarnings} + ${creatorAmount}`,
          pendingBalance: sql`${creatorEarnings.pendingBalance} + ${creatorAmount}`,
          updatedAt: new Date(),
        },
      });
  }

  return c.json({
    success: result.success,
    transactionId,
    status: result.status,
    amount: body.amount,
    requiresAction: result.requiresAction,
    clientSecret: result.clientSecret,
    errorMessage: result.errorMessage,
  });
});

// Capture an authorized payment
paymentRoutes.post('/io.exprsn.payments.capture', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const body = await c.req.json<{
    transactionId: string;
    amount?: number;
  }>();

  if (!body.transactionId) {
    throw new HTTPException(400, { message: 'Transaction ID required' });
  }

  // Get transaction
  const txResult = await db
    .select({
      tx: paymentTransactions,
      config: paymentConfigs,
    })
    .from(paymentTransactions)
    .innerJoin(paymentConfigs, eq(paymentConfigs.id, paymentTransactions.configId))
    .where(eq(paymentTransactions.id, body.transactionId))
    .limit(1);

  const txData = txResult[0];
  if (!txData) {
    throw new HTTPException(404, { message: 'Transaction not found' });
  }

  // Check permission
  const config = txData.config;
  if (config.organizationId) {
    const hasPermission = await checkOrgPaymentPermission(userDid, config.organizationId);
    if (!hasPermission) {
      throw new HTTPException(403, { message: 'Permission denied' });
    }
  } else if (config.userDid !== userDid) {
    throw new HTTPException(403, { message: 'Permission denied' });
  }

  if (txData.tx.status !== 'processing') {
    throw new HTTPException(400, { message: 'Transaction is not in authorized state' });
  }

  // Get gateway
  const credentials = decryptCredentials(config.credentials);
  const gateway = PaymentGatewayFactory.getOrCreate(
    config.id,
    config.provider as PaymentProvider,
    credentials,
    config.testMode ?? true
  );

  // Capture payment
  const result = await gateway.capturePayment(
    txData.tx.providerTransactionId || '',
    body.amount ? { amount: body.amount } : undefined
  );

  // Update transaction
  await db
    .update(paymentTransactions)
    .set({ status: result.status })
    .where(eq(paymentTransactions.id, body.transactionId));

  return c.json({
    success: result.success,
    status: result.status,
    amount: result.amount,
    errorMessage: result.errorMessage,
  });
});

// Void an authorized payment
paymentRoutes.post('/io.exprsn.payments.void', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const body = await c.req.json<{ transactionId: string }>();

  if (!body.transactionId) {
    throw new HTTPException(400, { message: 'Transaction ID required' });
  }

  // Get transaction
  const txResult = await db
    .select({
      tx: paymentTransactions,
      config: paymentConfigs,
    })
    .from(paymentTransactions)
    .innerJoin(paymentConfigs, eq(paymentConfigs.id, paymentTransactions.configId))
    .where(eq(paymentTransactions.id, body.transactionId))
    .limit(1);

  const txData = txResult[0];
  if (!txData) {
    throw new HTTPException(404, { message: 'Transaction not found' });
  }

  // Check permission
  const config = txData.config;
  if (config.organizationId) {
    const hasPermission = await checkOrgPaymentPermission(userDid, config.organizationId);
    if (!hasPermission) {
      throw new HTTPException(403, { message: 'Permission denied' });
    }
  } else if (config.userDid !== userDid) {
    throw new HTTPException(403, { message: 'Permission denied' });
  }

  if (txData.tx.status !== 'processing' && txData.tx.status !== 'pending') {
    throw new HTTPException(400, { message: 'Can only void pending or authorized transactions' });
  }

  // Get gateway
  const credentials = decryptCredentials(config.credentials);
  const gateway = PaymentGatewayFactory.getOrCreate(
    config.id,
    config.provider as PaymentProvider,
    credentials,
    config.testMode ?? true
  );

  // Void payment
  const result = await gateway.voidPayment(txData.tx.providerTransactionId || '');

  // Update transaction
  if (result.success) {
    await db
      .update(paymentTransactions)
      .set({ status: 'cancelled' })
      .where(eq(paymentTransactions.id, body.transactionId));
  }

  return c.json({
    success: result.success,
    errorMessage: result.errorMessage,
  });
});

// ============================================
// Transaction History
// ============================================

// List transactions
paymentRoutes.get('/io.exprsn.payments.listTransactions', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const configId = c.req.query('configId');
  const organizationId = c.req.query('organizationId');
  const type = c.req.query('type');
  const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);
  const cursor = c.req.query('cursor');

  // Build query conditions
  const conditions = [];

  if (configId) {
    // Verify access to this config
    const configResult = await db
      .select()
      .from(paymentConfigs)
      .where(eq(paymentConfigs.id, configId))
      .limit(1);

    const config = configResult[0];
    if (!config) {
      throw new HTTPException(404, { message: 'Configuration not found' });
    }

    if (config.organizationId) {
      const hasPermission = await checkOrgPaymentPermission(userDid, config.organizationId);
      if (!hasPermission) {
        throw new HTTPException(403, { message: 'Permission denied' });
      }
    } else if (config.userDid !== userDid) {
      throw new HTTPException(403, { message: 'Permission denied' });
    }

    conditions.push(eq(paymentTransactions.configId, configId));
  } else if (organizationId) {
    const hasPermission = await checkOrgPaymentPermission(userDid, organizationId);
    if (!hasPermission) {
      throw new HTTPException(403, { message: 'Permission denied' });
    }

    // Get all configs for this org
    const orgConfigs = await db
      .select({ id: paymentConfigs.id })
      .from(paymentConfigs)
      .where(eq(paymentConfigs.organizationId, organizationId));

    if (orgConfigs.length > 0) {
      conditions.push(
        sql`${paymentTransactions.configId} IN (${sql.join(
          orgConfigs.map((c) => sql`${c.id}`),
          sql`, `
        )})`
      );
    }
  } else {
    // User's personal transactions
    conditions.push(
      sql`(${paymentTransactions.fromDid} = ${userDid} OR ${paymentTransactions.toDid} = ${userDid})`
    );
  }

  if (type) {
    conditions.push(eq(paymentTransactions.type, type));
  }

  if (cursor) {
    conditions.push(sql`${paymentTransactions.createdAt} < ${new Date(cursor)}`);
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const transactions = await db
    .select({
      tx: paymentTransactions,
      fromUser: {
        did: users.did,
        handle: users.handle,
        displayName: users.displayName,
        avatar: users.avatar,
      },
    })
    .from(paymentTransactions)
    .leftJoin(users, eq(users.did, paymentTransactions.fromDid))
    .where(whereClause)
    .orderBy(desc(paymentTransactions.createdAt))
    .limit(limit + 1);

  const hasMore = transactions.length > limit;
  const results = hasMore ? transactions.slice(0, -1) : transactions;

  return c.json({
    transactions: results.map(({ tx, fromUser }) => ({
      id: tx.id,
      type: tx.type,
      status: tx.status,
      amount: tx.amount,
      currency: tx.currency,
      fromDid: tx.fromDid,
      fromUser,
      toDid: tx.toDid,
      metadata: tx.metadata,
      createdAt: tx.createdAt.toISOString(),
    })),
    cursor: hasMore ? results[results.length - 1]?.tx.createdAt.toISOString() : undefined,
  });
});

// Get transaction details
paymentRoutes.get('/io.exprsn.payments.getTransaction', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const transactionId = c.req.query('id');
  if (!transactionId) {
    throw new HTTPException(400, { message: 'Transaction ID required' });
  }

  const result = await db
    .select({
      tx: paymentTransactions,
      config: paymentConfigs,
    })
    .from(paymentTransactions)
    .innerJoin(paymentConfigs, eq(paymentConfigs.id, paymentTransactions.configId))
    .where(eq(paymentTransactions.id, transactionId))
    .limit(1);

  const data = result[0];
  if (!data) {
    throw new HTTPException(404, { message: 'Transaction not found' });
  }

  // Check permission
  const canView =
    data.tx.fromDid === userDid ||
    data.tx.toDid === userDid ||
    data.config.userDid === userDid ||
    (data.config.organizationId &&
      (await checkOrgPaymentPermission(userDid, data.config.organizationId)));

  if (!canView) {
    throw new HTTPException(403, { message: 'Permission denied' });
  }

  return c.json({
    id: data.tx.id,
    configId: data.tx.configId,
    provider: data.config.provider,
    providerTransactionId: data.tx.providerTransactionId,
    type: data.tx.type,
    status: data.tx.status,
    amount: data.tx.amount,
    currency: data.tx.currency,
    fromDid: data.tx.fromDid,
    toDid: data.tx.toDid,
    metadata: data.tx.metadata,
    createdAt: data.tx.createdAt.toISOString(),
  });
});

// ============================================
// Payment Methods
// ============================================

// Attach payment method
paymentRoutes.post('/io.exprsn.payments.attachPaymentMethod', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const body = await c.req.json<{
    configId: string;
    token: string;
    setAsDefault?: boolean;
  }>();

  if (!body.configId || !body.token) {
    throw new HTTPException(400, { message: 'Config ID and token required' });
  }

  // Get config
  const configResult = await db
    .select()
    .from(paymentConfigs)
    .where(eq(paymentConfigs.id, body.configId))
    .limit(1);

  const config = configResult[0];
  if (!config) {
    throw new HTTPException(404, { message: 'Configuration not found' });
  }

  // Get or create customer
  let customerResult = await db
    .select()
    .from(paymentCustomers)
    .where(
      and(
        eq(paymentCustomers.userDid, userDid),
        eq(paymentCustomers.configId, body.configId)
      )
    )
    .limit(1);

  const credentials = decryptCredentials(config.credentials);
  const gateway = PaymentGatewayFactory.getOrCreate(
    body.configId,
    config.provider as PaymentProvider,
    credentials,
    config.testMode ?? true
  );

  let providerCustomerId = customerResult[0]?.providerCustomerId;

  if (!providerCustomerId) {
    // Get user info for customer creation
    const userResult = await db
      .select()
      .from(users)
      .where(eq(users.did, userDid))
      .limit(1);

    const user = userResult[0];

    // Create customer in provider
    const customerCreateResult = await gateway.createCustomer({
      name: user?.displayName || user?.handle || undefined,
      metadata: { userDid },
    });

    if (!customerCreateResult.success) {
      throw new HTTPException(400, {
        message: customerCreateResult.errorMessage || 'Failed to create customer',
      });
    }

    providerCustomerId = customerCreateResult.customerId;

    // Save customer record
    await db.insert(paymentCustomers).values({
      id: nanoid(),
      userDid,
      configId: body.configId,
      providerCustomerId,
      createdAt: new Date(),
    });
  }

  // Attach payment method
  const result = await gateway.attachPaymentMethod({
    customerId: providerCustomerId!,
    token: body.token,
    setAsDefault: body.setAsDefault,
  });

  if (!result.success) {
    throw new HTTPException(400, {
      message: result.errorMessage || 'Failed to attach payment method',
    });
  }

  // If setting as default, unset other defaults
  if (body.setAsDefault) {
    await db
      .update(paymentMethods)
      .set({ isDefault: false })
      .where(
        and(
          eq(paymentMethods.userDid, userDid),
          eq(paymentMethods.configId, body.configId)
        )
      );
  }

  // Save payment method record
  const methodId = nanoid();
  await db.insert(paymentMethods).values({
    id: methodId,
    userDid,
    configId: body.configId,
    providerPaymentMethodId: result.paymentMethodId,
    type: result.type,
    last4: result.last4,
    brand: result.brand,
    expiryMonth: result.expiryMonth,
    expiryYear: result.expiryYear,
    isDefault: body.setAsDefault ?? false,
    createdAt: new Date(),
  });

  return c.json({
    id: methodId,
    paymentMethodId: result.paymentMethodId,
    type: result.type,
    last4: result.last4,
    brand: result.brand,
    expiryMonth: result.expiryMonth,
    expiryYear: result.expiryYear,
    isDefault: body.setAsDefault ?? false,
  });
});

// List payment methods
paymentRoutes.get('/io.exprsn.payments.listPaymentMethods', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const configId = c.req.query('configId');

  const conditions = [eq(paymentMethods.userDid, userDid)];
  if (configId) {
    conditions.push(eq(paymentMethods.configId, configId));
  }

  const methods = await db
    .select()
    .from(paymentMethods)
    .where(and(...conditions))
    .orderBy(desc(paymentMethods.isDefault), desc(paymentMethods.createdAt));

  return c.json({
    paymentMethods: methods.map((m) => ({
      id: m.id,
      configId: m.configId,
      type: m.type,
      last4: m.last4,
      brand: m.brand,
      expiryMonth: m.expiryMonth,
      expiryYear: m.expiryYear,
      isDefault: m.isDefault,
      createdAt: m.createdAt.toISOString(),
    })),
  });
});

// Remove payment method
paymentRoutes.post('/io.exprsn.payments.removePaymentMethod', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const body = await c.req.json<{ paymentMethodId: string }>();
  if (!body.paymentMethodId) {
    throw new HTTPException(400, { message: 'Payment method ID required' });
  }

  const methodResult = await db
    .select({
      method: paymentMethods,
      config: paymentConfigs,
    })
    .from(paymentMethods)
    .innerJoin(paymentConfigs, eq(paymentConfigs.id, paymentMethods.configId))
    .where(eq(paymentMethods.id, body.paymentMethodId))
    .limit(1);

  const data = methodResult[0];
  if (!data) {
    throw new HTTPException(404, { message: 'Payment method not found' });
  }

  if (data.method.userDid !== userDid) {
    throw new HTTPException(403, { message: 'Permission denied' });
  }

  // Detach from provider
  const credentials = decryptCredentials(data.config.credentials);
  const gateway = PaymentGatewayFactory.getOrCreate(
    data.config.id,
    data.config.provider as PaymentProvider,
    credentials,
    data.config.testMode ?? true
  );

  await gateway.detachPaymentMethod(data.method.providerPaymentMethodId || '');

  // Delete from database
  await db.delete(paymentMethods).where(eq(paymentMethods.id, body.paymentMethodId));

  return c.json({ success: true });
});

// ============================================
// Creator Earnings
// ============================================

// Get creator earnings
paymentRoutes.get('/io.exprsn.payments.getEarnings', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const result = await db
    .select()
    .from(creatorEarnings)
    .where(eq(creatorEarnings.userDid, userDid))
    .limit(1);

  const earnings = result[0];

  return c.json({
    totalEarnings: earnings?.totalEarnings ?? 0,
    pendingBalance: earnings?.pendingBalance ?? 0,
    availableBalance: earnings?.availableBalance ?? 0,
    lastPayout: earnings?.lastPayoutAt?.toISOString() ?? null,
    lastUpdated: earnings?.updatedAt?.toISOString() ?? null,
  });
});

// ============================================
// Webhooks
// ============================================

// Webhook handler for Stripe
paymentRoutes.post('/io.exprsn.payments.webhook/stripe', async (c) => {
  const signature = c.req.header('stripe-signature');
  if (!signature) {
    throw new HTTPException(400, { message: 'Missing signature' });
  }

  const body = await c.req.text();

  // Find configs using Stripe
  const configs = await db
    .select()
    .from(paymentConfigs)
    .where(eq(paymentConfigs.provider, 'stripe'));

  for (const config of configs) {
    const credentials = decryptCredentials(config.credentials);
    if (!credentials.webhookSecret) continue;

    try {
      const gateway = PaymentGatewayFactory.getOrCreate(
        config.id,
        'stripe',
        credentials,
        config.testMode ?? true
      );

      if (gateway.verifyWebhookSignature(body, signature)) {
        const event = gateway.parseWebhookEvent(body, signature);
        await processWebhookEvent(config.id, event);
        return c.json({ received: true });
      }
    } catch {
      continue;
    }
  }

  throw new HTTPException(400, { message: 'Invalid signature' });
});

// Webhook handler for PayPal
paymentRoutes.post('/io.exprsn.payments.webhook/paypal', async (c) => {
  const body = await c.req.text();
  const signature = c.req.header('paypal-transmission-sig');

  if (!signature) {
    throw new HTTPException(400, { message: 'Missing signature' });
  }

  const configs = await db
    .select()
    .from(paymentConfigs)
    .where(eq(paymentConfigs.provider, 'paypal'));

  for (const config of configs) {
    const credentials = decryptCredentials(config.credentials);
    if (!credentials.webhookId) continue;

    try {
      const gateway = PaymentGatewayFactory.getOrCreate(
        config.id,
        'paypal',
        credentials,
        config.testMode ?? true
      );

      if (gateway.verifyWebhookSignature(body, signature)) {
        const event = gateway.parseWebhookEvent(body);
        await processWebhookEvent(config.id, event);
        return c.json({ received: true });
      }
    } catch {
      continue;
    }
  }

  throw new HTTPException(400, { message: 'Invalid signature' });
});

// Webhook handler for Authorize.Net
paymentRoutes.post('/io.exprsn.payments.webhook/authorizenet', async (c) => {
  const body = await c.req.text();
  const signature = c.req.header('x-anet-signature');

  if (!signature) {
    throw new HTTPException(400, { message: 'Missing signature' });
  }

  const configs = await db
    .select()
    .from(paymentConfigs)
    .where(eq(paymentConfigs.provider, 'authorizenet'));

  for (const config of configs) {
    const credentials = decryptCredentials(config.credentials);
    if (!credentials.signatureKey) continue;

    try {
      const gateway = PaymentGatewayFactory.getOrCreate(
        config.id,
        'authorizenet',
        credentials,
        config.testMode ?? true
      );

      if (gateway.verifyWebhookSignature(body, signature)) {
        const event = gateway.parseWebhookEvent(body);
        await processWebhookEvent(config.id, event);
        return c.json({ received: true });
      }
    } catch {
      continue;
    }
  }

  throw new HTTPException(400, { message: 'Invalid signature' });
});

// Process webhook event
async function processWebhookEvent(
  configId: string,
  event: { id: string; type: string; data: Record<string, unknown> }
) {
  // Map event types to transaction updates
  const eventTypeMap: Record<string, string> = {
    // Stripe
    'payment_intent.succeeded': 'completed',
    'payment_intent.payment_failed': 'failed',
    'charge.refunded': 'refunded',
    // PayPal
    'PAYMENT.CAPTURE.COMPLETED': 'completed',
    'PAYMENT.CAPTURE.DENIED': 'failed',
    'PAYMENT.CAPTURE.REFUNDED': 'refunded',
    // Authorize.Net
    'net.authorize.payment.authcapture.created': 'completed',
    'net.authorize.payment.refund.created': 'refunded',
  };

  const newStatus = eventTypeMap[event.type];
  if (!newStatus) return;

  // Extract provider transaction ID from event data
  const providerTxId =
    (event.data.id as string) ||
    (event.data.object as { id?: string })?.id ||
    (event.data.resource as { id?: string })?.id;

  if (!providerTxId) return;

  // Update transaction status
  await db
    .update(paymentTransactions)
    .set({ status: newStatus as 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'refunded' })
    .where(
      and(
        eq(paymentTransactions.configId, configId),
        eq(paymentTransactions.providerTransactionId, providerTxId)
      )
    );
}

export default paymentRoutes;
