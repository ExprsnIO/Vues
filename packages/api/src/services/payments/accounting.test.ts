import { describe, expect, it } from 'vitest';
import { creatorRefundDelta, paymentSplit } from './accounting.js';
import { paypalRefundAmount, webhookPaymentReference } from './webhooks.js';

describe('creator refund allocation', () => {
  it.each([[1000, 900], [500, 475], [1000, 700]])('reverses only the creator share of %i', (gross, net) => {
    expect(creatorRefundDelta(gross, net, 0, gross)).toBe(net);
  });
  it('preserves cents across successive partial refunds', () => {
    const net = paymentSplit(103, 1000).creatorAmount;
    const first = creatorRefundDelta(103, net, 0, 17);
    const second = creatorRefundDelta(103, net, 17, 31);
    const last = creatorRefundDelta(103, net, 48, 55);
    expect(first + second + last).toBe(net);
  });
  it('rejects over-refunds', () => {
    expect(() => creatorRefundDelta(1000, 900, 800, 201)).toThrow();
  });
  it('stores distinct fee splits for charges, tips, and subscriptions', () => {
    expect(paymentSplit(1000, 1000).creatorAmount).toBe(900);
    expect(paymentSplit(1000, 500).creatorAmount).toBe(950);
    expect(paymentSplit(1000, 3000).creatorAmount).toBe(700);
  });
});

describe('provider webhook references', () => {
  it('maps a PayPal capture to the stored order', () => {
    expect(webhookPaymentReference({ type: 'PAYMENT.CAPTURE.COMPLETED', data: {
      id: 'capture-1', supplementary_data: { related_ids: { order_id: 'order-1' } },
    } })).toBe('order-1');
  });
  it('maps a PayPal refund to its original capture', () => {
    expect(webhookPaymentReference({ type: 'PAYMENT.CAPTURE.REFUNDED', data: {
      id: 'refund-1', links: [{ rel: 'up', href: 'https://api.paypal.com/v2/payments/captures/capture-1' }],
    } })).toBe('capture-1');
  });
  it('maps Stripe refunds to the payment intent, rather than the charge', () => {
    expect(webhookPaymentReference({ type: 'charge.refunded', data: { id: 'ch_1', payment_intent: 'pi_1' } })).toBe('pi_1');
  });
  it('converts PayPal refund amounts to minor units', () => {
    expect(paypalRefundAmount({ amount: { value: '10.01', currency_code: 'USD' } })).toBe(1001);
    expect(paypalRefundAmount({ amount: { value: '100', currency_code: 'JPY' } })).toBe(100);
    expect(() => paypalRefundAmount({ amount: { value: '1.001', currency_code: 'USD' } })).toThrow();
  });
});
