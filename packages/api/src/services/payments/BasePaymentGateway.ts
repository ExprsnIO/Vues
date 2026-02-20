import type {
  PaymentProvider,
  TransactionStatus,
  CurrencyCode,
  CardBrand,
  PaymentMethodType,
} from '@exprsn/shared/types';

/**
 * Gateway credentials for different providers
 */
export interface GatewayCredentials {
  [key: string]: string | undefined;
}

/**
 * Payment data for processing a charge
 */
export interface ProcessPaymentData {
  amount: number; // In smallest currency unit (cents)
  currency: CurrencyCode;
  customerId?: string;
  paymentMethodId?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
  capture?: boolean; // If false, authorize only
}

/**
 * Result of a payment operation
 */
export interface PaymentResult {
  success: boolean;
  transactionId: string;
  status: TransactionStatus;
  amount: number;
  currency: CurrencyCode;
  requiresAction?: boolean;
  clientSecret?: string; // For 3D Secure
  errorMessage?: string;
  errorCode?: string;
  raw?: unknown; // Raw provider response
}

/**
 * Customer data for creation
 */
export interface CustomerData {
  email?: string;
  name?: string;
  phone?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Result of customer operations
 */
export interface CustomerResult {
  success: boolean;
  customerId: string;
  email?: string;
  name?: string;
  metadata?: Record<string, unknown>;
  errorMessage?: string;
}

/**
 * Payment method data
 */
export interface PaymentMethodData {
  customerId: string;
  token: string; // Token from client-side SDK
  setAsDefault?: boolean;
}

/**
 * Result of payment method operations
 */
export interface PaymentMethodResult {
  success: boolean;
  paymentMethodId: string;
  type: PaymentMethodType;
  last4?: string;
  brand?: CardBrand;
  expiryMonth?: number;
  expiryYear?: number;
  errorMessage?: string;
}

/**
 * Refund data
 */
export interface RefundData {
  transactionId: string;
  amount?: number; // Partial refund if specified
  reason?: string;
}

/**
 * Refund result
 */
export interface RefundResult {
  success: boolean;
  refundId: string;
  amount: number;
  status: 'pending' | 'succeeded' | 'failed';
  errorMessage?: string;
}

/**
 * Capture data for authorized payments
 */
export interface CaptureData {
  amount?: number; // Partial capture if specified
}

/**
 * Webhook event data
 */
export interface WebhookEvent {
  id: string;
  type: string;
  data: Record<string, unknown>;
  created: Date;
}

/**
 * Base Payment Gateway Interface
 * All payment gateway implementations must extend this class
 */
export abstract class BasePaymentGateway {
  protected credentials: GatewayCredentials;
  protected testMode: boolean;
  public readonly provider: PaymentProvider;

  constructor(provider: PaymentProvider, credentials: GatewayCredentials, testMode = true) {
    this.provider = provider;
    this.credentials = credentials;
    this.testMode = testMode;
  }

  /**
   * Process a payment (charge)
   */
  abstract processPayment(paymentData: ProcessPaymentData): Promise<PaymentResult>;

  /**
   * Create a customer in the provider's system
   */
  abstract createCustomer(customerData: CustomerData): Promise<CustomerResult>;

  /**
   * Get customer details from the provider
   */
  abstract getCustomer(customerId: string): Promise<CustomerResult>;

  /**
   * Update customer details in the provider
   */
  abstract updateCustomer(customerId: string, updates: Partial<CustomerData>): Promise<CustomerResult>;

  /**
   * Delete a customer from the provider
   */
  abstract deleteCustomer(customerId: string): Promise<{ success: boolean; errorMessage?: string }>;

  /**
   * Attach a payment method to a customer
   */
  abstract attachPaymentMethod(data: PaymentMethodData): Promise<PaymentMethodResult>;

  /**
   * Detach a payment method from a customer
   */
  abstract detachPaymentMethod(paymentMethodId: string): Promise<{ success: boolean; errorMessage?: string }>;

  /**
   * List payment methods for a customer
   */
  abstract listPaymentMethods(customerId: string): Promise<PaymentMethodResult[]>;

  /**
   * Process a refund
   */
  abstract processRefund(refundData: RefundData): Promise<RefundResult>;

  /**
   * Get transaction details from the provider
   */
  abstract getTransaction(transactionId: string): Promise<PaymentResult>;

  /**
   * Capture an authorized payment
   */
  abstract capturePayment(authorizationId: string, captureData?: CaptureData): Promise<PaymentResult>;

  /**
   * Void an authorized payment
   */
  abstract voidPayment(authorizationId: string): Promise<{ success: boolean; errorMessage?: string }>;

  /**
   * Verify webhook signature
   */
  abstract verifyWebhookSignature(payload: string | Buffer, signature: string): boolean;

  /**
   * Parse webhook event
   */
  abstract parseWebhookEvent(payload: string | Buffer, signature?: string): WebhookEvent;

  /**
   * Create a payout to a connected account (for creator payouts)
   * Override in subclasses that support payouts
   */
  async createPayout(
    _amount: number,
    _currency: CurrencyCode,
    _destination: string,
    _metadata?: Record<string, unknown>
  ): Promise<{
    success: boolean;
    payoutId: string;
    status: 'pending' | 'in_transit' | 'paid' | 'failed';
    arrivalDate?: Date;
    errorMessage?: string;
  }> {
    return {
      success: false,
      payoutId: '',
      status: 'failed',
      errorMessage: `Payouts not supported by ${this.provider}`,
    };
  }

  /**
   * Check if the gateway is properly configured
   */
  async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    return { healthy: true };
  }

  /**
   * Get the test mode status
   */
  isTestMode(): boolean {
    return this.testMode;
  }
}
