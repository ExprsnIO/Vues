/** All amounts are integer minor currency units. Keep the fee split on the payment. */
export function paymentSplit(amount: number, platformFeeBps: number) {
  if (!Number.isSafeInteger(amount) || amount < 0 || !Number.isInteger(platformFeeBps) || platformFeeBps < 0 || platformFeeBps > 10_000) {
    throw new Error('Invalid payment split');
  }
  const platformFee = Math.floor(amount * platformFeeBps / 10_000);
  return { platformFeeBps, platformFee, creatorAmount: amount - platformFee };
}

/** Cumulative allocation avoids losing cents across multiple partial refunds. */
export function creatorRefundDelta(
  amount: number,
  creatorAmount: number,
  alreadyRefunded: number,
  refundAmount: number
): number {
  if (![amount, creatorAmount, alreadyRefunded, refundAmount].every(Number.isSafeInteger) ||
      creatorAmount < 0 || creatorAmount > amount || amount <= 0 || alreadyRefunded < 0 || refundAmount <= 0 ||
      alreadyRefunded + refundAmount > amount) {
    throw new Error('Refund exceeds the remaining payment amount');
  }
  const allocated = (refunded: number) => Math.floor(creatorAmount * refunded / amount);
  return allocated(alreadyRefunded + refundAmount) - allocated(alreadyRefunded);
}
