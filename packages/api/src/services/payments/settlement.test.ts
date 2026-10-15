import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyPaymentResult, reverseCreatorEarnings } from './settlement.js';

const state = vi.hoisted(() => {
  const table = (name: string, fields: string[]) => Object.assign({ name }, Object.fromEntries(fields.map((field) => [field, `${name}.${field}`])));
  return {
    tables: {
      paymentTransactions: table('payments', ['id']),
      creatorEarnings: table('earnings', ['userDid', 'totalEarnings', 'pendingBalance', 'availableBalance']),
      creatorSubscriptions: table('subscriptions', ['id', 'status', 'tierId']),
      creatorSubscriptionTiers: table('tiers', ['id', 'currentSubscribers']),
    },
    payment: {} as Record<string, any>,
    subscription: { id: 'sub-1', status: 'pending', tierId: 'tier-1' },
    credits: [] as Array<Record<string, any>>,
    updates: [] as Array<{ table: string; values: Record<string, any> }>,
    lock: vi.fn(),
    transaction: vi.fn(),
  };
});

vi.mock('../../db/index.js', () => ({ db: { transaction: state.transaction } }));
vi.mock('../../db/schema.js', () => state.tables);
vi.mock('drizzle-orm', () => ({
  eq: (column: string, value: unknown) => ({ column, value }),
  and: (...conditions: unknown[]) => conditions,
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
}));

const tx = {
  select: () => ({ from: () => ({ where: () => ({ for: async (mode: string) => {
    state.lock(mode);
    return [{ ...state.payment }];
  } }) }) }),
  update: (table: { name: string }) => ({ set: (values: Record<string, any>) => ({ where: (conditions: any) => {
    let rows: unknown[] = [];
    if (table.name === 'payments') Object.assign(state.payment, values);
    if (table.name === 'subscriptions' && conditions.every((condition: any) =>
      state.subscription[condition.column.split('.')[1] as keyof typeof state.subscription] === condition.value)) {
      Object.assign(state.subscription, values);
      rows = [state.subscription];
    }
    state.updates.push({ table: table.name, values });
    return Object.assign(Promise.resolve(), { returning: async () => rows });
  } }) }),
  insert: () => ({ values: (values: Record<string, any>) => ({ onConflictDoUpdate: async () => {
    state.credits.push(values);
  } }) }),
};

const completed = { success: true, status: 'completed' as const, transactionId: 'provider-1', amount: 1000, currency: 'usd' as const };

beforeEach(() => {
  state.payment = {
    id: 'payment-1', providerTransactionId: 'provider-1', type: 'charge', status: 'pending',
    amount: 1000, currency: 'usd', toDid: 'creator', refundedAmount: 0,
    metadata: { platformFeeBps: 1000, creatorAmount: 900, earningsCredited: false },
  };
  state.subscription = { id: 'sub-1', status: 'pending', tierId: 'tier-1' };
  state.credits.length = 0;
  state.updates.length = 0;
  state.lock.mockClear();
  state.transaction.mockImplementation(async (callback) => callback(tx));
});

describe('payment settlement', () => {
  it('does not credit a newly created, unapproved PayPal order', async () => {
    await applyPaymentResult('payment-1', { ...completed, status: 'pending', requiresAction: true });
    expect(state.credits).toHaveLength(0);
    expect(state.payment.metadata.earningsCredited).toBe(false);
  });
  it('does not credit authorization-only payments', async () => {
    await applyPaymentResult('payment-1', { ...completed, status: 'processing' });
    expect(state.credits).toHaveLength(0);
  });
  it('credits a captured payment exactly once across repeated notifications', async () => {
    await applyPaymentResult('payment-1', completed);
    await applyPaymentResult('payment-1', completed);
    expect(state.credits).toHaveLength(1);
    expect(state.credits[0]?.totalEarnings).toBe(900);
    expect(state.lock).toHaveBeenCalledWith('update');
  });
  it('keeps subscription benefits pending until payment completes', async () => {
    state.payment.type = 'subscription';
    state.payment.metadata = { platformFeeBps: 3000, earningsCredited: false, subscriptionId: 'sub-1' };
    await applyPaymentResult('payment-1', { ...completed, status: 'pending', requiresAction: true });
    expect(state.subscription.status).toBe('pending');
    expect(state.credits).toHaveLength(0);
    await applyPaymentResult('payment-1', completed);
    expect(state.subscription.status).toBe('active');
    expect(state.credits[0]?.totalEarnings).toBe(700);
  });
  it('releases a failed subscription reservation once', async () => {
    state.payment.metadata.subscriptionId = 'sub-1';
    await applyPaymentResult('payment-1', { ...completed, success: false, status: 'failed' });
    await applyPaymentResult('payment-1', { ...completed, success: false, status: 'failed' });
    expect(state.subscription.status).toBe('expired');
    expect(state.credits).toHaveLength(0);
    expect(state.updates.filter((update) => update.table === 'tiers')).toHaveLength(1);
  });
  it('rejects partial capture of a paid subscription', async () => {
    state.payment.metadata.subscriptionId = 'sub-1';
    await expect(applyPaymentResult('payment-1', { ...completed, amount: 500 })).rejects.toThrow('in full');
    expect(state.subscription.status).toBe('pending');
    expect(state.credits).toHaveLength(0);
  });
  it('credits the actual captured amount for a partial charge capture', async () => {
    await applyPaymentResult('payment-1', { ...completed, amount: 500 });
    expect(state.credits[0]?.totalEarnings).toBe(450);
    expect(state.payment.amount).toBe(500);
  });
  it.each([{ amount: 1001 }, { currency: 'eur' as const }])('rejects a mismatched provider settlement: %j', async (overrides) => {
    await expect(applyPaymentResult('payment-1', { ...completed, ...overrides })).rejects.toThrow('does not match');
    expect(state.credits).toHaveLength(0);
  });
  it('does not recredit legacy completed payments', async () => {
    state.payment.status = 'completed';
    state.payment.metadata = {};
    await applyPaymentResult('payment-1', completed);
    expect(state.credits).toHaveLength(0);
  });
  it('credits only the remaining share if a partial refund arrived before settlement', async () => {
    await reverseCreatorEarnings(tx as any, { ...state.payment } as any, 500);
    await applyPaymentResult('payment-1', completed);
    expect(state.credits[0]?.totalEarnings).toBe(450);
    expect(state.payment.refundedAmount).toBe(500);
  });
  it('retains a PayPal capture reference even when the API settled first', async () => {
    await applyPaymentResult('payment-1', completed);
    await applyPaymentResult('payment-1', completed, 'capture-1');
    expect(state.payment.metadata.providerCaptureId).toBe('capture-1');
    expect(state.credits).toHaveLength(1);
  });
  it('never reopens a refunded payment on a late completed event', async () => {
    state.payment.status = 'refunded';
    await applyPaymentResult('payment-1', completed);
    expect(state.payment.status).toBe('refunded');
    expect(state.credits).toHaveLength(0);
  });
});

describe('refund ledger', () => {
  it('reverses the recorded creator share and ignores duplicate cumulative refunds', async () => {
    state.payment.status = 'completed';
    state.payment.metadata.earningsCredited = true;
    await reverseCreatorEarnings(tx as any, { ...state.payment } as any, 500);
    await reverseCreatorEarnings(tx as any, { ...state.payment } as any, 500);
    await reverseCreatorEarnings(tx as any, { ...state.payment } as any, 1000);
    const deductions = state.updates.filter((update) => update.table === 'earnings');
    expect(deductions.map((update) => update.values.totalEarnings.values[1])).toEqual([450, 450]);
    expect(state.payment.status).toBe('refunded');
    expect(state.payment.refundedAmount).toBe(1000);
  });
  it('does not subtract earnings for an uncredited payment', async () => {
    await reverseCreatorEarnings(tx as any, { ...state.payment } as any, 1000);
    expect(state.updates.filter((update) => update.table === 'earnings')).toHaveLength(0);
  });
});
