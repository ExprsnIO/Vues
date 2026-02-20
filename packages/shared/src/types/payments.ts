/**
 * Payment Processing Types
 * Supports Stripe, PayPal, and Authorize.Net
 */

// Payment provider types
export type PaymentProvider = 'stripe' | 'paypal' | 'authorizenet';

// Transaction types
export type TransactionType = 'charge' | 'refund' | 'tip' | 'subscription' | 'payout';
export type TransactionStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'refunded' | 'cancelled';

// Payment method types
export type PaymentMethodType = 'card' | 'bank_account' | 'paypal' | 'authorizenet';
export type CardBrand = 'visa' | 'mastercard' | 'amex' | 'discover' | 'diners' | 'jcb' | 'unionpay' | 'unknown';

// Currency codes (ISO 4217)
export type CurrencyCode = 'usd' | 'eur' | 'gbp' | 'cad' | 'aud' | 'jpy';

/**
 * Payment configuration for a user or organization
 */
export interface PaymentConfig {
  id: string;
  organizationId?: string;
  userDid?: string;
  provider: PaymentProvider;
  providerAccountId?: string;
  testMode: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Create payment config request
 */
export interface CreatePaymentConfigInput {
  organizationId?: string;
  provider: PaymentProvider;
  credentials: PaymentCredentials;
  testMode?: boolean;
}

/**
 * Provider-specific credentials (encrypted at rest)
 */
export type PaymentCredentials =
  | StripeCredentials
  | PayPalCredentials
  | AuthorizeNetCredentials;

export interface StripeCredentials {
  provider: 'stripe';
  secretKey: string;
  publishableKey: string;
  webhookSecret?: string;
}

export interface PayPalCredentials {
  provider: 'paypal';
  clientId: string;
  clientSecret: string;
  webhookId?: string;
}

export interface AuthorizeNetCredentials {
  provider: 'authorizenet';
  apiLoginId: string;
  transactionKey: string;
  signatureKey?: string;
}

/**
 * Payment customer linked to a provider
 */
export interface PaymentCustomer {
  id: string;
  userDid: string;
  configId: string;
  providerCustomerId: string;
  email?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

/**
 * Create customer request
 */
export interface CreateCustomerInput {
  configId: string;
  email?: string;
  name?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Payment method stored for a customer
 */
export interface PaymentMethod {
  id: string;
  customerId: string;
  providerPaymentMethodId: string;
  type: PaymentMethodType;
  last4?: string;
  brand?: CardBrand;
  expiryMonth?: number;
  expiryYear?: number;
  isDefault: boolean;
  createdAt: string;
}

/**
 * Add payment method request
 */
export interface AddPaymentMethodInput {
  customerId: string;
  paymentMethodToken: string; // From client-side tokenization
  setAsDefault?: boolean;
}

/**
 * Payment transaction record
 */
export interface PaymentTransaction {
  id: string;
  configId: string;
  customerId?: string;
  providerTransactionId?: string;
  type: TransactionType;
  status: TransactionStatus;
  amount: number; // In smallest currency unit (cents)
  currency: CurrencyCode;
  fromDid?: string;
  toDid?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  errorMessage?: string;
  refundedAmount?: number;
  createdAt: string;
  updatedAt?: string;
}

/**
 * Charge request
 */
export interface ChargeInput {
  configId: string;
  customerId?: string;
  paymentMethodId?: string;
  amount: number;
  currency?: CurrencyCode;
  toDid?: string; // Creator receiving the payment
  description?: string;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
}

/**
 * Charge result
 */
export interface ChargeResult {
  transaction: PaymentTransaction;
  requiresAction?: boolean;
  clientSecret?: string; // For 3D Secure / additional auth
}

/**
 * Refund request
 */
export interface RefundInput {
  transactionId: string;
  amount?: number; // Partial refund amount, or full if omitted
  reason?: string;
}

/**
 * Tip/donation to a creator
 */
export interface TipInput {
  creatorDid: string;
  amount: number;
  currency?: CurrencyCode;
  message?: string;
  paymentMethodId?: string;
  anonymous?: boolean;
}

/**
 * Webhook event from payment provider
 */
export interface PaymentWebhookEvent {
  id: string;
  provider: PaymentProvider;
  type: string;
  data: Record<string, unknown>;
  createdAt: string;
}

/**
 * Payout to creator (transfer funds to their account)
 */
export interface PayoutInput {
  creatorDid: string;
  amount: number;
  currency?: CurrencyCode;
}

export interface PayoutResult {
  id: string;
  status: 'pending' | 'in_transit' | 'paid' | 'failed' | 'cancelled';
  amount: number;
  currency: CurrencyCode;
  arrivalDate?: string;
}

/**
 * Creator earnings summary
 */
export interface CreatorEarnings {
  userDid: string;
  totalEarnings: number;
  availableBalance: number;
  pendingBalance: number;
  currency: CurrencyCode;
  lastPayoutAt?: string;
  lastPayoutAmount?: number;
}

/**
 * Transaction list query params
 */
export interface ListTransactionsParams {
  configId?: string;
  customerId?: string;
  userDid?: string;
  type?: TransactionType;
  status?: TransactionStatus;
  startDate?: string;
  endDate?: string;
  limit?: number;
  cursor?: string;
}

/**
 * Transaction list result
 */
export interface ListTransactionsResult {
  transactions: PaymentTransaction[];
  cursor?: string;
  total?: number;
}
