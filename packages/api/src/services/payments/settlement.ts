import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { creatorEarnings, creatorSubscriptions, creatorSubscriptionTiers, paymentTransactions } from '../../db/schema.js';
import { paymentSplit, creatorRefundDelta } from './accounting.js';
import type { PaymentResult } from './BasePaymentGateway.js';

type PaymentTransaction = typeof paymentTransactions.$inferSelect;

export function feeBasisPoints(payment: Pick<PaymentTransaction, 'type' | 'metadata'>): number {
  const stored = payment.metadata?.platformFeeBps;
  return typeof stored === 'number' ? stored : payment.type === 'tip' ? 500 : payment.type === 'subscription' ? 3000 : 1000;
}

/** Row locking makes API responses, captures, and repeated webhooks credit once. */
export async function applyPaymentResult(transactionId: string, result: PaymentResult, providerCaptureId?: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [payment] = await tx.select().from(paymentTransactions)
      .where(eq(paymentTransactions.id, transactionId)).for('update');
    if (!payment) throw new Error('Payment transaction not found');
    const metadata = payment.metadata || {};
    // Never reopen a refunded payment or overwrite an already settled payment.
    if (metadata.earningsCredited === true && providerCaptureId && !metadata.providerCaptureId) {
      await tx.update(paymentTransactions).set({ metadata: { ...metadata, providerCaptureId } })
        .where(eq(paymentTransactions.id, payment.id));
    }
    if (payment.status === 'refunded' || metadata.earningsCredited === true ||
        (metadata.earningsCredited === undefined && payment.status === 'completed')) return;

    const completed = result.success && result.status === 'completed' && !result.requiresAction;
    if (completed && (!Number.isSafeInteger(result.amount) || result.amount <= 0 || result.amount > payment.amount ||
        result.currency.toLowerCase() !== payment.currency.toLowerCase() || result.amount < (payment.refundedAmount || 0))) {
      throw new Error('Settlement amount or currency does not match the payment');
    }

    if (typeof metadata.subscriptionId === 'string' && completed && result.amount !== payment.amount) {
      throw new Error('Subscription payment must be captured in full');
    }
    const split = paymentSplit(completed ? result.amount : payment.amount, feeBasisPoints(payment));
    await tx.update(paymentTransactions).set({
      providerTransactionId: result.transactionId || payment.providerTransactionId,
      status: completed ? 'completed' : result.status === 'completed' ? 'processing' : result.status,
      amount: completed ? result.amount : payment.amount,
      metadata: { ...metadata, ...split, earningsCredited: completed, ...(providerCaptureId ? { providerCaptureId } : {}) },
      updatedAt: new Date(),
    }).where(eq(paymentTransactions.id, payment.id));

    if (completed && payment.toDid) {
      // A refund webhook can arrive before the completion webhook. Credit only
      // the part that has not already been refunded in that case.
      const credit = split.creatorAmount - Math.floor(split.creatorAmount * (payment.refundedAmount || 0) / result.amount);
      await tx.insert(creatorEarnings).values({
        userDid: payment.toDid,
        totalEarnings: credit,
        pendingBalance: credit,
        availableBalance: 0,
        currency: payment.currency,
      }).onConflictDoUpdate({
        target: creatorEarnings.userDid,
        set: {
          totalEarnings: sql`${creatorEarnings.totalEarnings} + ${credit}`,
          pendingBalance: sql`${creatorEarnings.pendingBalance} + ${credit}`,
          updatedAt: new Date(),
        },
      });
    }

    if (typeof metadata.subscriptionId === 'string') {
      if (completed) {
        const start = new Date();
        const end = new Date(start);
        end.setMonth(end.getMonth() + 1);
        await tx.update(creatorSubscriptions).set({
          status: 'active', currentPeriodStart: start, currentPeriodEnd: end, updatedAt: start,
        }).where(and(eq(creatorSubscriptions.id, metadata.subscriptionId), eq(creatorSubscriptions.status, 'pending')));
      } else if (result.status === 'failed' || result.status === 'cancelled') {
        const released = await tx.update(creatorSubscriptions).set({ status: 'expired', updatedAt: new Date() })
          .where(and(eq(creatorSubscriptions.id, metadata.subscriptionId), eq(creatorSubscriptions.status, 'pending')))
          .returning({ tierId: creatorSubscriptions.tierId });
        if (released[0]) {
          await tx.update(creatorSubscriptionTiers).set({
            currentSubscribers: sql`GREATEST(0, ${creatorSubscriptionTiers.currentSubscribers} - 1)`,
          }).where(eq(creatorSubscriptionTiers.id, released[0].tierId));
        }
      }
    }
  });
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Caller holds the payment row lock. Both API refunds and webhooks use this ledger. */
export async function reverseCreatorEarnings(tx: Transaction, payment: PaymentTransaction, cumulativeRefund: number) {
  if (!Number.isSafeInteger(cumulativeRefund) || cumulativeRefund < 0 || cumulativeRefund > payment.amount) {
    throw new Error('Invalid cumulative refund amount');
  }
  const alreadyRefunded = payment.refundedAmount || 0;
  if (cumulativeRefund <= alreadyRefunded) return;
  const metadata = payment.metadata || {};
  const creatorAmount = typeof metadata.creatorAmount === 'number'
    ? metadata.creatorAmount : paymentSplit(payment.amount, feeBasisPoints(payment)).creatorAmount;
  const reversal = creatorRefundDelta(payment.amount, creatorAmount, alreadyRefunded, cumulativeRefund - alreadyRefunded);
  // Legacy completed transactions were credited before explicit settlement markers.
  if (payment.toDid && metadata.earningsCredited !== false) {
    await tx.update(creatorEarnings).set({
      totalEarnings: sql`${creatorEarnings.totalEarnings} - ${reversal}`,
      availableBalance: sql`${creatorEarnings.availableBalance} - GREATEST(0, ${reversal} - ${creatorEarnings.pendingBalance})`,
      pendingBalance: sql`GREATEST(0, ${creatorEarnings.pendingBalance} - ${reversal})`,
      updatedAt: new Date(),
    }).where(eq(creatorEarnings.userDid, payment.toDid));
  }
  await tx.update(paymentTransactions).set({
    refundedAmount: cumulativeRefund,
    status: cumulativeRefund === payment.amount ? 'refunded' : 'completed',
    updatedAt: new Date(),
  }).where(eq(paymentTransactions.id, payment.id));
}
