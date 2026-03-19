import Stripe from 'stripe';
import type { TransactionStatus, CurrencyCode, CardBrand } from '@exprsn/shared/types';
import {
  BasePaymentGateway,
  type GatewayCredentials,
  type ProcessPaymentData,
  type PaymentResult,
  type CustomerData,
  type CustomerResult,
  type PaymentMethodData,
  type PaymentMethodResult,
  type RefundData,
  type RefundResult,
  type CaptureData,
  type WebhookEvent,
} from './BasePaymentGateway.js';

interface StripeCredentials {
  secretKey: string;
  publishableKey?: string;
  webhookSecret?: string;
  [key: string]: string | undefined;
}

/**
 * Stripe Payment Gateway Implementation
 */
export class StripeGateway extends BasePaymentGateway {
  private stripe: Stripe;
  private webhookSecret?: string;

  constructor(credentials: StripeCredentials, testMode = true) {
    super('stripe', credentials, testMode);

    const apiKey = credentials.secretKey;
    if (!apiKey) {
      throw new Error('Stripe API key is required');
    }

    this.stripe = new Stripe(apiKey);

    this.webhookSecret = credentials.webhookSecret;
  }

  /**
   * Map Stripe status to standard status
   */
  private mapStripeStatus(stripeStatus: Stripe.PaymentIntent.Status): TransactionStatus {
    const statusMap: Record<Stripe.PaymentIntent.Status, TransactionStatus> = {
      requires_payment_method: 'pending',
      requires_confirmation: 'pending',
      requires_action: 'pending',
      processing: 'processing',
      requires_capture: 'processing',
      succeeded: 'completed',
      canceled: 'cancelled',
    };

    return statusMap[stripeStatus] || 'pending';
  }

  /**
   * Map Stripe card brand to standard brand
   */
  private mapCardBrand(brand: string | null | undefined): CardBrand {
    if (!brand) return 'unknown';
    const brandMap: Record<string, CardBrand> = {
      visa: 'visa',
      mastercard: 'mastercard',
      amex: 'amex',
      discover: 'discover',
      diners: 'diners',
      jcb: 'jcb',
      unionpay: 'unionpay',
    };
    return brandMap[brand] || 'unknown';
  }

  async processPayment(paymentData: ProcessPaymentData): Promise<PaymentResult> {
    try {
      const {
        amount,
        currency = 'usd',
        customerId,
        paymentMethodId,
        description,
        metadata = {},
        idempotencyKey,
        capture = true,
      } = paymentData;

      const paymentIntent = await this.stripe.paymentIntents.create(
        {
          amount, // Already in cents
          currency: currency.toLowerCase(),
          customer: customerId,
          payment_method: paymentMethodId,
          description,
          metadata: metadata as Stripe.MetadataParam,
          capture_method: capture ? 'automatic' : 'manual',
          confirm: !!paymentMethodId,
        },
        idempotencyKey ? { idempotencyKey } : undefined
      );

      return {
        success: paymentIntent.status === 'succeeded' || paymentIntent.status === 'requires_capture',
        transactionId: paymentIntent.id,
        status: this.mapStripeStatus(paymentIntent.status),
        amount: paymentIntent.amount,
        currency: paymentIntent.currency.toUpperCase() as CurrencyCode,
        requiresAction: paymentIntent.status === 'requires_action',
        clientSecret: paymentIntent.client_secret || undefined,
        raw: paymentIntent,
      };
    } catch (error) {
      const stripeError = error as Stripe.errors.StripeError;
      return {
        success: false,
        transactionId: '',
        status: 'failed',
        amount: paymentData.amount,
        currency: paymentData.currency || 'usd',
        errorCode: stripeError.code,
        errorMessage: stripeError.message,
        raw: error,
      };
    }
  }

  async createCustomer(customerData: CustomerData): Promise<CustomerResult> {
    try {
      const { email, name, phone, metadata = {} } = customerData;

      const customer = await this.stripe.customers.create({
        email: email || undefined,
        name: name || undefined,
        phone: phone || undefined,
        metadata: metadata as Stripe.MetadataParam,
      });

      return {
        success: true,
        customerId: customer.id,
        email: customer.email || undefined,
        name: customer.name || undefined,
        metadata: customer.metadata as Record<string, unknown>,
      };
    } catch (error) {
      const stripeError = error as Stripe.errors.StripeError;
      return {
        success: false,
        customerId: '',
        errorMessage: stripeError.message,
      };
    }
  }

  async getCustomer(customerId: string): Promise<CustomerResult> {
    try {
      const customer = await this.stripe.customers.retrieve(customerId);

      if (customer.deleted) {
        return {
          success: false,
          customerId,
          errorMessage: 'Customer has been deleted',
        };
      }

      return {
        success: true,
        customerId: customer.id,
        email: customer.email || undefined,
        name: customer.name || undefined,
        metadata: customer.metadata as Record<string, unknown>,
      };
    } catch (error) {
      const stripeError = error as Stripe.errors.StripeError;
      return {
        success: false,
        customerId,
        errorMessage: stripeError.message,
      };
    }
  }

  async updateCustomer(customerId: string, updates: Partial<CustomerData>): Promise<CustomerResult> {
    try {
      const customer = await this.stripe.customers.update(customerId, {
        email: updates.email || undefined,
        name: updates.name || undefined,
        phone: updates.phone || undefined,
        metadata: updates.metadata as Stripe.MetadataParam,
      });

      return {
        success: true,
        customerId: customer.id,
        email: customer.email || undefined,
        name: customer.name || undefined,
        metadata: customer.metadata as Record<string, unknown>,
      };
    } catch (error) {
      const stripeError = error as Stripe.errors.StripeError;
      return {
        success: false,
        customerId,
        errorMessage: stripeError.message,
      };
    }
  }

  async deleteCustomer(customerId: string): Promise<{ success: boolean; errorMessage?: string }> {
    try {
      await this.stripe.customers.del(customerId);
      return { success: true };
    } catch (error) {
      const stripeError = error as Stripe.errors.StripeError;
      return {
        success: false,
        errorMessage: stripeError.message,
      };
    }
  }

  async attachPaymentMethod(data: PaymentMethodData): Promise<PaymentMethodResult> {
    try {
      // Attach the payment method to the customer
      const paymentMethod = await this.stripe.paymentMethods.attach(data.token, {
        customer: data.customerId,
      });

      // Set as default if requested
      if (data.setAsDefault) {
        await this.stripe.customers.update(data.customerId, {
          invoice_settings: {
            default_payment_method: paymentMethod.id,
          },
        });
      }

      return {
        success: true,
        paymentMethodId: paymentMethod.id,
        type: paymentMethod.type === 'card' ? 'card' : 'bank_account',
        last4: paymentMethod.card?.last4 || undefined,
        brand: this.mapCardBrand(paymentMethod.card?.brand),
        expiryMonth: paymentMethod.card?.exp_month,
        expiryYear: paymentMethod.card?.exp_year,
      };
    } catch (error) {
      const stripeError = error as Stripe.errors.StripeError;
      return {
        success: false,
        paymentMethodId: '',
        type: 'card',
        errorMessage: stripeError.message,
      };
    }
  }

  async detachPaymentMethod(paymentMethodId: string): Promise<{ success: boolean; errorMessage?: string }> {
    try {
      await this.stripe.paymentMethods.detach(paymentMethodId);
      return { success: true };
    } catch (error) {
      const stripeError = error as Stripe.errors.StripeError;
      return {
        success: false,
        errorMessage: stripeError.message,
      };
    }
  }

  async listPaymentMethods(customerId: string): Promise<PaymentMethodResult[]> {
    try {
      const paymentMethods = await this.stripe.paymentMethods.list({
        customer: customerId,
        type: 'card',
      });

      return paymentMethods.data.map((pm) => ({
        success: true,
        paymentMethodId: pm.id,
        type: 'card' as const,
        last4: pm.card?.last4 || undefined,
        brand: this.mapCardBrand(pm.card?.brand),
        expiryMonth: pm.card?.exp_month,
        expiryYear: pm.card?.exp_year,
      }));
    } catch (error) {
      const stripeError = error as Error;
      console.error('Stripe listPaymentMethods error:', {
        customerId,
        message: stripeError.message,
        name: stripeError.name,
      });
      return [];
    }
  }

  async processRefund(refundData: RefundData): Promise<RefundResult> {
    try {
      const { transactionId, amount, reason } = refundData;

      const refund = await this.stripe.refunds.create({
        payment_intent: transactionId,
        amount: amount, // Already in cents
        reason: reason as Stripe.RefundCreateParams.Reason,
      });

      return {
        success: refund.status === 'succeeded',
        refundId: refund.id,
        amount: refund.amount,
        status: refund.status === 'succeeded' ? 'succeeded' : refund.status === 'pending' ? 'pending' : 'failed',
      };
    } catch (error) {
      const stripeError = error as Stripe.errors.StripeError;
      return {
        success: false,
        refundId: '',
        amount: refundData.amount || 0,
        status: 'failed',
        errorMessage: stripeError.message,
      };
    }
  }

  async getTransaction(transactionId: string): Promise<PaymentResult> {
    try {
      const paymentIntent = await this.stripe.paymentIntents.retrieve(transactionId);

      return {
        success: true,
        transactionId: paymentIntent.id,
        status: this.mapStripeStatus(paymentIntent.status),
        amount: paymentIntent.amount,
        currency: paymentIntent.currency.toUpperCase() as CurrencyCode,
        raw: paymentIntent,
      };
    } catch (error) {
      const stripeError = error as Stripe.errors.StripeError;
      return {
        success: false,
        transactionId,
        status: 'failed',
        amount: 0,
        currency: 'usd',
        errorMessage: stripeError.message,
      };
    }
  }

  async capturePayment(authorizationId: string, captureData?: CaptureData): Promise<PaymentResult> {
    try {
      const paymentIntent = await this.stripe.paymentIntents.capture(authorizationId, {
        amount_to_capture: captureData?.amount,
      });

      return {
        success: paymentIntent.status === 'succeeded',
        transactionId: paymentIntent.id,
        status: this.mapStripeStatus(paymentIntent.status),
        amount: paymentIntent.amount,
        currency: paymentIntent.currency.toUpperCase() as CurrencyCode,
        raw: paymentIntent,
      };
    } catch (error) {
      const stripeError = error as Stripe.errors.StripeError;
      return {
        success: false,
        transactionId: authorizationId,
        status: 'failed',
        amount: 0,
        currency: 'usd',
        errorMessage: stripeError.message,
      };
    }
  }

  async voidPayment(authorizationId: string): Promise<{ success: boolean; errorMessage?: string }> {
    try {
      await this.stripe.paymentIntents.cancel(authorizationId);
      return { success: true };
    } catch (error) {
      const stripeError = error as Stripe.errors.StripeError;
      return {
        success: false,
        errorMessage: stripeError.message,
      };
    }
  }

  verifyWebhookSignature(payload: string | Buffer, signature: string): boolean {
    if (!this.webhookSecret) {
      throw new Error('Webhook secret not configured');
    }

    try {
      this.stripe.webhooks.constructEvent(payload, signature, this.webhookSecret);
      return true;
    } catch {
      return false;
    }
  }

  parseWebhookEvent(payload: string | Buffer, signature?: string): WebhookEvent {
    if (this.webhookSecret && signature) {
      const event = this.stripe.webhooks.constructEvent(payload, signature, this.webhookSecret);
      return {
        id: event.id,
        type: event.type,
        data: event.data.object as unknown as Record<string, unknown>,
        created: new Date(event.created * 1000),
      };
    }

    // Parse without verification (not recommended for production)
    const parsed = typeof payload === 'string' ? JSON.parse(payload) : JSON.parse(payload.toString());
    return {
      id: parsed.id,
      type: parsed.type,
      data: parsed.data.object,
      created: new Date(parsed.created * 1000),
    };
  }

  async createPayout(
    amount: number,
    currency: CurrencyCode,
    destination: string,
    metadata?: Record<string, unknown>
  ): Promise<{
    success: boolean;
    payoutId: string;
    status: 'pending' | 'in_transit' | 'paid' | 'failed';
    arrivalDate?: Date;
    errorMessage?: string;
  }> {
    try {
      const transfer = await this.stripe.transfers.create({
        amount,
        currency: currency.toLowerCase(),
        destination,
        metadata: metadata as Stripe.MetadataParam,
      });

      return {
        success: true,
        payoutId: transfer.id,
        status: 'pending',
      };
    } catch (error) {
      const stripeError = error as Stripe.errors.StripeError;
      return {
        success: false,
        payoutId: '',
        status: 'failed',
        errorMessage: stripeError.message,
      };
    }
  }

  async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    try {
      await this.stripe.balance.retrieve();
      return { healthy: true };
    } catch (error) {
      const stripeError = error as Stripe.errors.StripeError;
      return { healthy: false, message: stripeError.message };
    }
  }
}
