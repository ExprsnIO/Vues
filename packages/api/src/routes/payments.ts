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
  creatorSubscriptionTiers,
  creatorSubscriptions,
  users,
  organizations,
  organizationMembers,
} from '../db/schema.js';
import { eq, and, or, desc, sql, gte, inArray, lt } from 'drizzle-orm';
import { authMiddleware } from '../auth/middleware.js';
import { PaymentGatewayFactory } from '../services/payments/index.js';
import { applyPaymentResult, reverseCreatorEarnings } from '../services/payments/settlement.js';
import { paymentSplit } from '../services/payments/accounting.js';
import { webhookPaymentReference, paypalRefundAmount } from '../services/payments/webhooks.js';
import type { BasePaymentGateway, PaymentResult, WebhookEvent } from '../services/payments/BasePaymentGateway.js';
import type { PaymentProvider } from '@exprsn/shared/types';
import { encryptCredentials, decryptCredentials } from '../utils/encryption.js';
import { zValidator, getValidatedData } from '../utils/zod-validator.js';
import {
  createPaymentConfigSchema,
  updatePaymentConfigSchema,
  deletePaymentConfigSchema,
  chargeSchema,
  refundSchema,
  tipSchema,
  capturePaymentSchema,
  voidPaymentSchema,
  attachPaymentMethodSchema,
  removePaymentMethodSchema,
  createSubscriptionTierSchema,
  subscribeSchema,
  cancelSubscriptionSchema,
} from '../utils/validation-schemas.js';

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

// Helper to decrypt credentials - safely handle both encrypted and unencrypted data
function safeDecryptCredentials(encrypted: unknown): Record<string, string> {
  if (!encrypted || typeof encrypted !== 'object') {
    return {};
  }

  const creds = encrypted as Record<string, string>;

  try {
    // Try to decrypt - if it fails, assume it's already unencrypted (for backward compatibility)
    return decryptCredentials(creds);
  } catch (error) {
    console.warn('Failed to decrypt credentials, using as-is:', error);
    return creds;
  }
}

// ============================================
// Payment Configuration
// ============================================

// Create payment configuration
paymentRoutes.post('/io.exprsn.payments.createConfig', authMiddleware, zValidator('json', createPaymentConfigSchema), async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const body = getValidatedData<typeof createPaymentConfigSchema._output>(c);

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
paymentRoutes.post('/io.exprsn.payments.updateConfig', authMiddleware, zValidator('json', updatePaymentConfigSchema), async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const body = getValidatedData<typeof updatePaymentConfigSchema._output>(c);

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
paymentRoutes.post('/io.exprsn.payments.deleteConfig', authMiddleware, zValidator('json', deletePaymentConfigSchema), async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const body = getValidatedData<typeof deletePaymentConfigSchema._output>(c);

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
paymentRoutes.post('/io.exprsn.payments.charge', authMiddleware, zValidator('json', chargeSchema), async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const body = getValidatedData<typeof chargeSchema._output>(c);

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
  const credentials = safeDecryptCredentials(config.credentials);
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
    currency,
    fromDid: userDid,
    toDid: body.recipientDid || null,
    metadata: {
      description: body.description,
      ...body.metadata,
      subscriptionId: null,
      providerCaptureId: null,
      ...paymentSplit(body.amount, 1000),
      earningsCredited: false,
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
    },
    createdAt: new Date(),
  });

  await applyPaymentResult(transactionId, result);

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
paymentRoutes.post('/io.exprsn.payments.refund', authMiddleware, zValidator('json', refundSchema), async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const body = getValidatedData<typeof refundSchema._output>(c);

  // Serialize refunds on the original payment, including the provider call, so
  // concurrent requests cannot both refund the same remaining balance.
  const response = await db.transaction(async (tx) => {
    const [txData] = await tx.select({ tx: paymentTransactions, config: paymentConfigs })
      .from(paymentTransactions)
      .innerJoin(paymentConfigs, eq(paymentConfigs.id, paymentTransactions.configId))
      .where(eq(paymentTransactions.id, body.transactionId)).for('update');
    if (!txData) throw new HTTPException(404, { message: 'Transaction not found' });
    const config = txData.config;
    if (config.organizationId) {
      if (!await checkOrgPaymentPermission(userDid, config.organizationId)) {
        throw new HTTPException(403, { message: 'Permission denied' });
      }
    } else if (config.userDid !== userDid) {
      throw new HTTPException(403, { message: 'Permission denied' });
    }
    if (txData.tx.status !== 'completed' || txData.tx.type === 'refund') {
      throw new HTTPException(400, { message: 'Can only refund completed payments' });
    }
    const remaining = txData.tx.amount - (txData.tx.refundedAmount || 0);
    const requested = body.amount ?? remaining;
    if (requested <= 0 || requested > remaining) {
      throw new HTTPException(400, { message: 'Refund exceeds the remaining payment amount' });
    }
    const gateway = PaymentGatewayFactory.getOrCreate(
      config.id, config.provider as PaymentProvider, safeDecryptCredentials(config.credentials), config.testMode ?? true
    );
    const result = await gateway.processRefund({
      transactionId: txData.tx.providerTransactionId || '', amount: requested, reason: body.reason,
    });
    if (result.success && result.status === 'succeeded' && result.amount !== requested) {
      throw new Error('Provider refund amount does not match the requested refund');
    }
    const refundTxId = nanoid();
    await tx.insert(paymentTransactions).values({
      id: refundTxId, configId: config.id, providerTransactionId: result.refundId,
      type: 'refund', status: result.status === 'succeeded' ? 'completed' : result.status,
      amount: result.amount, currency: txData.tx.currency, fromDid: txData.tx.toDid, toDid: txData.tx.fromDid,
      metadata: { originalTransactionId: body.transactionId, reason: body.reason, errorMessage: result.errorMessage },
    });
    if (result.success && result.status === 'succeeded') {
      await reverseCreatorEarnings(tx, txData.tx, (txData.tx.refundedAmount || 0) + result.amount);
    }
    return {
      success: result.success, refundId: refundTxId, providerRefundId: result.refundId,
      amount: result.amount, status: result.status, errorMessage: result.errorMessage,
    };
  });
  return c.json(response);
});

// Send a tip
paymentRoutes.post('/io.exprsn.payments.tip', authMiddleware, zValidator('json', tipSchema), async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const body = getValidatedData<typeof tipSchema._output>(c);

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
  const credentials = safeDecryptCredentials(recipientConfig.credentials);
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
      ...paymentSplit(body.amount, 500),
      earningsCredited: false,
      errorMessage: result.errorMessage,
    },
    createdAt: new Date(),
  });

  await applyPaymentResult(transactionId, result);

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
paymentRoutes.post('/io.exprsn.payments.capture', authMiddleware, zValidator('json', capturePaymentSchema), async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const body = getValidatedData<typeof capturePaymentSchema._output>(c);

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

  if (txData.tx.status !== 'processing' && !(config.provider === 'paypal' && txData.tx.status === 'pending')) {
    throw new HTTPException(400, { message: 'Transaction is not in authorized state' });
  }

  // Get gateway
  const credentials = safeDecryptCredentials(config.credentials);
  const gateway = PaymentGatewayFactory.getOrCreate(
    config.id,
    config.provider as PaymentProvider,
    credentials,
    config.testMode ?? true
  );

  // Capture payment
  const result = await gateway.capturePayment(
    txData.tx.providerTransactionId || '',
    { amount: body.amount ?? txData.tx.amount }
  );

  await applyPaymentResult(body.transactionId, result);

  return c.json({
    success: result.success,
    status: result.status,
    amount: result.amount,
    errorMessage: result.errorMessage,
  });
});

// Void an authorized payment
paymentRoutes.post('/io.exprsn.payments.void', authMiddleware, zValidator('json', voidPaymentSchema), async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const body = getValidatedData<typeof voidPaymentSchema._output>(c);

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
  const credentials = safeDecryptCredentials(config.credentials);
  const gateway = PaymentGatewayFactory.getOrCreate(
    config.id,
    config.provider as PaymentProvider,
    credentials,
    config.testMode ?? true
  );

  // Void payment
  const result = await gateway.voidPayment(txData.tx.providerTransactionId || '');

  if (result.success) {
    await applyPaymentResult(body.transactionId, {
      success: false, status: 'cancelled', transactionId: txData.tx.providerTransactionId || '',
      amount: txData.tx.amount, currency: txData.tx.currency as 'usd',
    });
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
    conditions.push(lt(paymentTransactions.createdAt, new Date(cursor)));
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
paymentRoutes.post('/io.exprsn.payments.attachPaymentMethod', authMiddleware, zValidator('json', attachPaymentMethodSchema), async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const body = getValidatedData<typeof attachPaymentMethodSchema._output>(c);

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

  const credentials = safeDecryptCredentials(config.credentials);
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
paymentRoutes.post('/io.exprsn.payments.removePaymentMethod', authMiddleware, zValidator('json', removePaymentMethodSchema), async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const body = getValidatedData<typeof removePaymentMethodSchema._output>(c);

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
  const credentials = safeDecryptCredentials(data.config.credentials);
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
    const credentials = safeDecryptCredentials(config.credentials);
    if (!credentials.webhookSecret) continue;

    const gateway = PaymentGatewayFactory.getOrCreate(
      config.id, 'stripe', credentials, config.testMode ?? true
    );
    let event: WebhookEvent;
    try {
      if (!await gateway.verifyWebhookSignature(body, signature)) continue;
      event = gateway.parseWebhookEvent(body, signature);
    } catch {
      continue;
    }
    await processWebhookEvent(config.id, event, gateway);
    return c.json({ received: true });
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
    const credentials = safeDecryptCredentials(config.credentials);
    if (!credentials.webhookId) continue;

    const gateway = PaymentGatewayFactory.getOrCreate(
      config.id, 'paypal', credentials, config.testMode ?? true
    );
    let event: WebhookEvent;
    try {
      if (!await gateway.verifyWebhookSignature(body, signature, c.req.header())) continue;
      event = gateway.parseWebhookEvent(body);
    } catch {
      continue;
    }
    await processWebhookEvent(config.id, event, gateway);
    return c.json({ received: true });
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
    const credentials = safeDecryptCredentials(config.credentials);
    if (!credentials.signatureKey) continue;

    const gateway = PaymentGatewayFactory.getOrCreate(
      config.id, 'authorizenet', credentials, config.testMode ?? true
    );
    let event: WebhookEvent;
    try {
      if (!await gateway.verifyWebhookSignature(body, signature)) continue;
      event = gateway.parseWebhookEvent(body);
    } catch {
      continue;
    }
    await processWebhookEvent(config.id, event, gateway);
    return c.json({ received: true });
  }

  throw new HTTPException(400, { message: 'Invalid signature' });
});

// Reconcile signed provider events through the same locked settlement path as
// synchronous responses. PayPal capture IDs differ from the stored order IDs.
async function processWebhookEvent(configId: string, event: WebhookEvent, gateway: BasePaymentGateway) {
  const reference = webhookPaymentReference(event);
  if (!reference) return;
  const completed = ['payment_intent.succeeded', 'PAYMENT.CAPTURE.COMPLETED', 'net.authorize.payment.authcapture.created'].includes(event.type);
  const failed = ['payment_intent.payment_failed', 'PAYMENT.CAPTURE.DENIED'].includes(event.type);
  const refunded = ['charge.refunded', 'PAYMENT.CAPTURE.REFUNDED'].includes(event.type);
  if (!completed && !failed && !refunded) return;
  const [payment] = await db.select().from(paymentTransactions).where(and(
    eq(paymentTransactions.configId, configId),
    or(eq(paymentTransactions.providerTransactionId, reference), sql`${paymentTransactions.metadata}->>'providerCaptureId' = ${reference}`),
    sql`${paymentTransactions.type} != 'refund'`
  )).limit(1);
  if (!payment) throw new Error('Webhook payment not yet recorded');
  if (completed) {
    const result = await gateway.getTransaction(payment.providerTransactionId || reference);
    if (!result.success || result.status !== 'completed') throw new Error('Provider payment is not yet completed');
    await applyPaymentResult(payment.id, result, gateway.provider === 'paypal' ? event.data.id as string : undefined);
  } else if (failed) {
    await applyPaymentResult(payment.id, {
      success: false, status: 'failed', transactionId: payment.providerTransactionId || reference,
      amount: payment.amount, currency: payment.currency as 'usd',
    });
  } else {
    await db.transaction(async (tx) => {
      const [locked] = await tx.select().from(paymentTransactions).where(eq(paymentTransactions.id, payment.id)).for('update');
      if (!locked) throw new Error('Payment transaction not found');
      if (event.type === 'charge.refunded') {
        const total = event.data.amount_refunded;
        if (!Number.isSafeInteger(total) || (total as number) < 0) throw new Error('Invalid refunded amount');
        await reverseCreatorEarnings(tx, locked, total as number);
      } else {
        const refundId = event.data.id as string;
        if (!refundId) throw new Error('Missing refund ID');
        const [existing] = await tx.select().from(paymentTransactions).where(and(
          eq(paymentTransactions.configId, configId), eq(paymentTransactions.providerTransactionId, refundId), eq(paymentTransactions.type, 'refund')
        )).limit(1);
        if (existing?.status === 'completed') return;
        const amount = paypalRefundAmount(event.data);
        const currency = (event.data.amount as { currency_code: string }).currency_code;
        if (currency.toLowerCase() !== locked.currency.toLowerCase()) throw new Error('Refund currency mismatch');
        await reverseCreatorEarnings(tx, locked, (locked.refundedAmount || 0) + amount);
        if (existing) {
          await tx.update(paymentTransactions).set({ status: 'completed', amount }).where(eq(paymentTransactions.id, existing.id));
        } else {
          await tx.insert(paymentTransactions).values({
            id: nanoid(), configId, providerTransactionId: refundId, type: 'refund', status: 'completed',
            amount, currency: locked.currency, fromDid: locked.toDid, toDid: locked.fromDid,
            metadata: { originalTransactionId: payment.id },
          });
        }
      }
    });
  }
}

// ============================================
// Creator Subscriptions
// ============================================

// Create subscription tier
paymentRoutes.post('/io.exprsn.payments.createSubscriptionTier', authMiddleware, zValidator('json', createSubscriptionTierSchema), async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const body = getValidatedData<typeof createSubscriptionTierSchema._output>(c);

  const tierId = nanoid();
  await db.insert(creatorSubscriptionTiers).values({
    id: tierId,
    creatorDid: userDid,
    name: body.name,
    description: body.description,
    price: body.price,
    benefits: body.benefits,
    maxSubscribers: body.maxSubscribers,
  });

  return c.json({
    tier: {
      id: tierId,
      creatorDid: userDid,
      name: body.name,
      price: body.price,
      benefits: body.benefits,
    },
  });
});

// Get creator's subscription tiers
paymentRoutes.get('/io.exprsn.payments.getSubscriptionTiers', async (c) => {
  const creatorDid = c.req.query('creatorDid');
  if (!creatorDid) {
    throw new HTTPException(400, { message: 'creatorDid required' });
  }

  const tiers = await db
    .select()
    .from(creatorSubscriptionTiers)
    .where(
      and(
        eq(creatorSubscriptionTiers.creatorDid, creatorDid),
        eq(creatorSubscriptionTiers.isActive, true)
      )
    )
    .orderBy(creatorSubscriptionTiers.sortOrder);

  return c.json({
    tiers: tiers.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      price: t.price,
      benefits: t.benefits,
      currentSubscribers: t.currentSubscribers,
      maxSubscribers: t.maxSubscribers,
    })),
  });
});

// Subscribe to a creator
paymentRoutes.post('/io.exprsn.payments.subscribe', authMiddleware, zValidator('json', subscribeSchema), async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const body = getValidatedData<typeof subscribeSchema._output>(c);

  // Reserve the subscription and capacity before initiating payment. The user lock
  // serializes retries, while the tier lock prevents oversubscribing its capacity.
  const reservation = await db.transaction(async (tx) => {
    await tx.select({ did: users.did }).from(users).where(eq(users.did, userDid)).for('update');
    const [existing] = await tx.select().from(creatorSubscriptions).where(and(
      eq(creatorSubscriptions.subscriberDid, userDid),
      sql`${creatorSubscriptions.creatorDid} = (SELECT creator_did FROM creator_subscription_tiers WHERE id = ${body.tierId})`
    ));
    if (existing?.status === 'pending' || (existing?.status === 'active' && existing.currentPeriodEnd > new Date())) {
      throw new HTTPException(409, { message: 'An active subscription or pending payment already exists' });
    }
    const [tier] = await tx.select().from(creatorSubscriptionTiers)
      .where(eq(creatorSubscriptionTiers.id, body.tierId)).for('update');
    if (!tier || !tier.isActive) throw new HTTPException(404, { message: 'Tier not found or inactive' });
    if (tier.creatorDid === userDid) throw new HTTPException(400, { message: 'Cannot subscribe to yourself' });
    if (existing?.status === 'active') {
      await tx.update(creatorSubscriptionTiers).set({
        currentSubscribers: sql`GREATEST(0, ${creatorSubscriptionTiers.currentSubscribers} - 1)`,
      }).where(eq(creatorSubscriptionTiers.id, existing.tierId));
    }
    const reservedCount = tier.currentSubscribers - (existing?.status === 'active' && existing.tierId === tier.id ? 1 : 0);
    if (tier.maxSubscribers !== null && reservedCount >= tier.maxSubscribers) {
      throw new HTTPException(400, { message: 'Subscription tier is at capacity' });
    }
    const [config] = await tx.select().from(paymentConfigs).where(and(
      eq(paymentConfigs.userDid, tier.creatorDid), eq(paymentConfigs.isActive, true),
      sql`${paymentConfigs.organizationId} IS NULL`
    )).limit(1);
    if (!config) throw new HTTPException(400, { message: 'Creator has no active payment configuration' });
    const gateway = PaymentGatewayFactory.getOrCreate(
      config.id, config.provider as PaymentProvider, safeDecryptCredentials(config.credentials), config.testMode ?? true
    );
    if (body.paymentMethodId) {
      const [method] = await tx.select().from(paymentMethods).where(and(
        eq(paymentMethods.userDid, userDid), eq(paymentMethods.configId, config.id),
        eq(paymentMethods.providerPaymentMethodId, body.paymentMethodId)
      )).limit(1);
      if (!method) throw new HTTPException(400, { message: 'Payment method does not belong to this subscriber and payment configuration' });
    }
    const [customer] = await tx.select().from(paymentCustomers).where(and(
      eq(paymentCustomers.userDid, userDid), eq(paymentCustomers.configId, config.id)
    )).limit(1);
    const subId = nanoid();
    const transactionId = nanoid();
    const now = new Date();
    const pending = {
      id: subId, status: 'pending', tierId: tier.id,
      currentPeriodStart: now, currentPeriodEnd: now, cancelledAt: null, updatedAt: now,
    };
    // There is one row per subscriber/creator; a new ID isolates late callbacks
    // from previous attempts when replacing an expired or cancelled subscription.
    await tx.insert(creatorSubscriptions).values({ ...pending, subscriberDid: userDid, creatorDid: tier.creatorDid })
      .onConflictDoUpdate({ target: [creatorSubscriptions.subscriberDid, creatorSubscriptions.creatorDid], set: pending });
    await tx.update(creatorSubscriptionTiers).set({
      currentSubscribers: sql`${creatorSubscriptionTiers.currentSubscribers} + 1`,
    }).where(eq(creatorSubscriptionTiers.id, tier.id));
    await tx.insert(paymentTransactions).values({
      id: transactionId, configId: config.id, type: 'subscription', status: 'pending',
      amount: tier.price, currency: 'usd', fromDid: userDid, toDid: tier.creatorDid,
      metadata: { ...paymentSplit(tier.price, 3000), earningsCredited: false, subscriptionId: subId },
    });
    return { gateway, tier, subId, transactionId, customerId: customer?.providerCustomerId || undefined };
  });

  const { gateway, tier, subId, transactionId, customerId } = reservation;
  let result: PaymentResult;
  try {
    result = await gateway.processPayment({
      amount: tier.price, currency: 'usd', customerId, paymentMethodId: body.paymentMethodId,
      description: `Subscription: ${tier.name}`, idempotencyKey: transactionId,
      metadata: { subscriptionId: subId, transactionId },
    });
  } catch (error) {
    // An unknown provider outcome must remain pending: retrying a charge could
    // collect twice. Reconciliation can resolve it using the idempotency key.
    throw new HTTPException(502, { message: 'Payment outcome is unknown; do not retry until reconciled' });
  }
  await applyPaymentResult(transactionId, result);
  const [subscription] = await db.select().from(creatorSubscriptions).where(eq(creatorSubscriptions.id, subId));
  return c.json({
    transactionId,
    requiresAction: result.requiresAction,
    clientSecret: result.clientSecret,
    errorMessage: result.errorMessage,
    subscription: {
      id: subId, creatorDid: tier.creatorDid, tierId: tier.id, tierName: tier.name,
      status: subscription?.status || 'pending', currentPeriodEnd: subscription?.currentPeriodEnd.toISOString(),
    },
  }, result.status === 'failed' ? 402 : 200);
});

// Cancel subscription
paymentRoutes.post('/io.exprsn.payments.cancelSubscription', authMiddleware, zValidator('json', cancelSubscriptionSchema), async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const body = getValidatedData<typeof cancelSubscriptionSchema._output>(c);

  await db.transaction(async (tx) => {
    await tx.select({ did: users.did }).from(users).where(eq(users.did, userDid)).for('update');
    const subResult = await tx
      .select()
      .from(creatorSubscriptions)
      .where(eq(creatorSubscriptions.id, body.subscriptionId))
      .limit(1);

    const subscription = subResult[0];
    if (!subscription) {
      throw new HTTPException(404, { message: 'Subscription not found' });
    }

    if (subscription.subscriberDid !== userDid) {
      throw new HTTPException(403, { message: 'Permission denied' });
    }

    if (subscription.status !== 'active') {
      throw new HTTPException(400, { message: 'Subscription is not active' });
    }

    // Preserve the current cancellation behavior; serialize with new checkouts.
    await tx
      .update(creatorSubscriptions)
      .set({
        status: 'cancelled',
        cancelledAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(creatorSubscriptions.id, body.subscriptionId));

    // Update subscriber count
    await tx
      .update(creatorSubscriptionTiers)
      .set({ currentSubscribers: sql`GREATEST(0, ${creatorSubscriptionTiers.currentSubscribers} - 1)` })
      .where(eq(creatorSubscriptionTiers.id, subscription.tierId));
  });

  return c.json({ success: true });
});

// Get user's subscriptions
paymentRoutes.get('/io.exprsn.payments.getSubscriptions', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const subscriptions = await db
    .select({
      subscription: creatorSubscriptions,
      tier: creatorSubscriptionTiers,
      creator: {
        did: users.did,
        handle: users.handle,
        displayName: users.displayName,
        avatar: users.avatar,
      },
    })
    .from(creatorSubscriptions)
    .innerJoin(creatorSubscriptionTiers, eq(creatorSubscriptions.tierId, creatorSubscriptionTiers.id))
    .innerJoin(users, eq(creatorSubscriptions.creatorDid, users.did))
    .where(eq(creatorSubscriptions.subscriberDid, userDid))
    .orderBy(desc(creatorSubscriptions.createdAt));

  return c.json({
    subscriptions: subscriptions.map(({ subscription, tier, creator }) => ({
      id: subscription.id,
      creator,
      tier: {
        id: tier.id,
        name: tier.name,
        price: tier.price,
        benefits: tier.benefits,
      },
      status: subscription.status,
      currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
      cancelledAt: subscription.cancelledAt?.toISOString(),
    })),
  });
});

// Get creator's subscribers
paymentRoutes.get('/io.exprsn.payments.getSubscribers', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);
  const cursor = c.req.query('cursor');

  const conditions = [
    eq(creatorSubscriptions.creatorDid, userDid),
    eq(creatorSubscriptions.status, 'active'),
  ];

  if (cursor) {
    conditions.push(lt(creatorSubscriptions.createdAt, new Date(cursor)));
  }

  const subscribers = await db
    .select({
      subscription: creatorSubscriptions,
      tier: creatorSubscriptionTiers,
      subscriber: {
        did: users.did,
        handle: users.handle,
        displayName: users.displayName,
        avatar: users.avatar,
      },
    })
    .from(creatorSubscriptions)
    .innerJoin(creatorSubscriptionTiers, eq(creatorSubscriptions.tierId, creatorSubscriptionTiers.id))
    .innerJoin(users, eq(creatorSubscriptions.subscriberDid, users.did))
    .where(and(...conditions))
    .orderBy(desc(creatorSubscriptions.createdAt))
    .limit(limit + 1);

  const hasMore = subscribers.length > limit;
  const results = hasMore ? subscribers.slice(0, -1) : subscribers;

  return c.json({
    subscribers: results.map(({ subscription, tier, subscriber }) => ({
      subscriber,
      tier: {
        id: tier.id,
        name: tier.name,
      },
      subscribedAt: subscription.createdAt.toISOString(),
    })),
    cursor: hasMore ? results[results.length - 1]?.subscription.createdAt.toISOString() : undefined,
  });
});

// Check if user is subscribed to a creator
paymentRoutes.get('/io.exprsn.payments.isSubscribed', authMiddleware, async (c) => {
  const userDid = c.get('did');
  if (!userDid) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  const creatorDid = c.req.query('creatorDid');
  if (!creatorDid) {
    throw new HTTPException(400, { message: 'creatorDid required' });
  }

  const subscription = await db
    .select({
      subscription: creatorSubscriptions,
      tier: creatorSubscriptionTiers,
    })
    .from(creatorSubscriptions)
    .innerJoin(creatorSubscriptionTiers, eq(creatorSubscriptions.tierId, creatorSubscriptionTiers.id))
    .where(
      and(
        eq(creatorSubscriptions.subscriberDid, userDid),
        eq(creatorSubscriptions.creatorDid, creatorDid),
        eq(creatorSubscriptions.status, 'active'),
        gte(creatorSubscriptions.currentPeriodEnd, new Date())
      )
    )
    .limit(1);

  const sub = subscription[0];

  return c.json({
    isSubscribed: !!sub,
    subscription: sub
      ? {
          tierId: sub.subscription.tierId,
          tierName: sub.tier.name,
          benefits: sub.tier.benefits,
          expiresAt: sub.subscription.currentPeriodEnd.toISOString(),
        }
      : null,
  });
});

export default paymentRoutes;

