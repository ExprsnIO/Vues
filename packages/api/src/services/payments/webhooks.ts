import type { WebhookEvent } from './BasePaymentGateway.js';

/** Gateways normalize event.data to the provider's resource, not its envelope. */
export function webhookPaymentReference(event: Pick<WebhookEvent, 'type' | 'data'>): string | undefined {
  const data = event.data;
  if (event.type === 'charge.refunded') return typeof data.payment_intent === 'string' ? data.payment_intent : undefined;
  if (event.type.startsWith('PAYMENT.CAPTURE.')) {
    const related = (data.supplementary_data as { related_ids?: { order_id?: string } } | undefined)?.related_ids;
    if (related?.order_id) return related.order_id;
    // Refund resources link back to their capture, rather than the order we store.
    const links = data.links as Array<{ rel: string; href: string }> | undefined;
    const capture = links?.find((link) => link.rel === 'up')?.href.match(/\/captures\/([^/?]+)/)?.[1];
    if (capture) return capture;
  }
  return typeof data.id === 'string' ? data.id : undefined;
}

export function paypalRefundAmount(data: Record<string, unknown>): number {
  const amount = data.amount as { value?: string; currency_code?: string } | undefined;
  const decimals = amount?.currency_code === 'JPY' ? 0 : 2;
  if (!amount?.value || !/^\d+(\.\d+)?$/.test(amount.value)) throw new Error('Missing PayPal refund amount');
  const minor = Number(amount.value) * 10 ** decimals;
  const rounded = Math.round(minor);
  if (!Number.isSafeInteger(rounded) || rounded <= 0 || Math.abs(minor - rounded) > 0.000001) {
    throw new Error('Invalid PayPal refund amount');
  }
  return rounded;
}
