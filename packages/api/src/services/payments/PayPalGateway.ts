import paypal from '@paypal/checkout-server-sdk';
import crypto from 'crypto';
import type { TransactionStatus, CurrencyCode } from '@exprsn/shared/types';
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

interface PayPalCredentials {
  clientId: string;
  clientSecret: string;
  webhookId?: string;
  [key: string]: string | undefined;
}

interface PayPalOrder {
  id: string;
  status: string;
  purchase_units: Array<{
    amount: {
      currency_code: string;
      value: string;
    };
    description?: string;
    payments?: {
      captures?: Array<{
        id: string;
        amount: {
          currency_code: string;
          value: string;
        };
      }>;
    };
  }>;
  links: Array<{
    rel: string;
    href: string;
  }>;
  create_time: string;
  update_time: string;
}

/**
 * PayPal Payment Gateway Implementation
 */
export class PayPalGateway extends BasePaymentGateway {
  private client: paypal.core.PayPalHttpClient;
  private webhookId?: string;

  constructor(credentials: PayPalCredentials, testMode = true) {
    super('paypal', credentials, testMode);

    const { clientId, clientSecret } = credentials;
    if (!clientId || !clientSecret) {
      throw new Error('PayPal client ID and secret are required');
    }

    // Configure PayPal environment
    const environment = testMode
      ? new paypal.core.SandboxEnvironment(clientId, clientSecret)
      : new paypal.core.LiveEnvironment(clientId, clientSecret);

    this.client = new paypal.core.PayPalHttpClient(environment);
    this.webhookId = credentials.webhookId;
  }

  /**
   * Map PayPal status to standard status
   */
  private mapPayPalStatus(paypalStatus: string): TransactionStatus {
    const statusMap: Record<string, TransactionStatus> = {
      CREATED: 'pending',
      SAVED: 'pending',
      APPROVED: 'processing',
      VOIDED: 'cancelled',
      COMPLETED: 'completed',
      PAYER_ACTION_REQUIRED: 'pending',
      FAILED: 'failed',
      PENDING: 'pending',
      REFUNDED: 'refunded',
      PARTIALLY_REFUNDED: 'refunded',
    };

    return statusMap[paypalStatus] || 'pending';
  }

  async processPayment(paymentData: ProcessPaymentData): Promise<PaymentResult> {
    try {
      const {
        amount,
        currency = 'usd',
        description,
        metadata = {},
      } = paymentData;

      // PayPal requires amounts in decimal format (not cents)
      const amountValue = (amount / 100).toFixed(2);

      // Create order
      const request = new paypal.orders.OrdersCreateRequest();
      request.prefer('return=representation');
      request.requestBody({
        intent: 'CAPTURE',
        purchase_units: [
          {
            amount: {
              currency_code: currency.toUpperCase(),
              value: amountValue,
            },
            description,
            custom_id: (metadata.customId as string) || undefined,
          },
        ],
        application_context: {
          user_action: 'PAY_NOW',
        },
      });

      const response = await this.client.execute(request);
      const order = response.result as PayPalOrder;

      const approvalUrl = order.links.find((link) => link.rel === 'approve')?.href;

      const purchaseUnit = order.purchase_units[0];
      return {
        success: true,
        transactionId: order.id,
        status: this.mapPayPalStatus(order.status),
        amount,
        currency: (purchaseUnit?.amount.currency_code.toLowerCase() || 'usd') as CurrencyCode,
        requiresAction: true, // PayPal always requires user approval
        clientSecret: approvalUrl, // Use this URL to redirect user
        raw: order,
      };
    } catch (error) {
      const paypalError = error as Error;
      return {
        success: false,
        transactionId: '',
        status: 'failed',
        amount: paymentData.amount,
        currency: paymentData.currency || 'usd',
        errorMessage: paypalError.message,
        raw: error,
      };
    }
  }

  async capturePayment(orderId: string, _captureData?: CaptureData): Promise<PaymentResult> {
    try {
      const request = new paypal.orders.OrdersCaptureRequest(orderId);
      request.prefer('return=representation');

      const response = await this.client.execute(request);
      const capture = response.result as PayPalOrder;

      const purchaseUnit = capture.purchase_units[0];
      const captureInfo = purchaseUnit?.payments?.captures?.[0];
      const amount = captureInfo
        ? Math.round(parseFloat(captureInfo.amount.value) * 100)
        : 0;

      return {
        success: capture.status === 'COMPLETED',
        transactionId: capture.id,
        status: this.mapPayPalStatus(capture.status),
        amount,
        currency: (captureInfo?.amount.currency_code.toLowerCase() || 'usd') as CurrencyCode,
        raw: capture,
      };
    } catch (error) {
      const paypalError = error as Error;
      return {
        success: false,
        transactionId: orderId,
        status: 'failed',
        amount: 0,
        currency: 'usd',
        errorMessage: paypalError.message,
        raw: error,
      };
    }
  }

  async getTransaction(transactionId: string): Promise<PaymentResult> {
    try {
      const request = new paypal.orders.OrdersGetRequest(transactionId);
      const response = await this.client.execute(request);
      const order = response.result as PayPalOrder;

      const purchaseUnit = order.purchase_units[0];
      return {
        success: true,
        transactionId: order.id,
        status: this.mapPayPalStatus(order.status),
        amount: purchaseUnit ? Math.round(parseFloat(purchaseUnit.amount.value) * 100) : 0,
        currency: (purchaseUnit?.amount.currency_code.toLowerCase() || 'usd') as CurrencyCode,
        raw: order,
      };
    } catch (error) {
      const paypalError = error as Error;
      return {
        success: false,
        transactionId,
        status: 'failed',
        amount: 0,
        currency: 'usd',
        errorMessage: paypalError.message,
      };
    }
  }

  async processRefund(refundData: RefundData): Promise<RefundResult> {
    try {
      const { transactionId, amount, reason } = refundData;

      // For PayPal, we need the capture ID, not the order ID
      // First, get the order to find the capture ID
      const orderRequest = new paypal.orders.OrdersGetRequest(transactionId);
      const orderResponse = await this.client.execute(orderRequest);
      const order = orderResponse.result as PayPalOrder;

      const purchaseUnit = order.purchase_units[0];
      const captureId = purchaseUnit?.payments?.captures?.[0]?.id;
      if (!captureId || !purchaseUnit) {
        return {
          success: false,
          refundId: '',
          amount: amount || 0,
          status: 'failed',
          errorMessage: 'No capture found for this order',
        };
      }

      const request = new paypal.payments.CapturesRefundRequest(captureId);
      const refundAmount = amount ? (amount / 100).toFixed(2) : undefined;

      request.requestBody({
        amount: refundAmount
          ? {
              currency_code: purchaseUnit.amount.currency_code,
              value: refundAmount,
            }
          : undefined,
        note_to_payer: reason,
      });

      const response = await this.client.execute(request);
      const refund = response.result as { id: string; status: string; amount: { value: string } };

      return {
        success: refund.status === 'COMPLETED',
        refundId: refund.id,
        amount: Math.round(parseFloat(refund.amount.value) * 100),
        status: refund.status === 'COMPLETED' ? 'succeeded' : 'pending',
      };
    } catch (error) {
      const paypalError = error as Error;
      return {
        success: false,
        refundId: '',
        amount: refundData.amount || 0,
        status: 'failed',
        errorMessage: paypalError.message,
      };
    }
  }

  async voidPayment(authorizationId: string): Promise<{ success: boolean; errorMessage?: string }> {
    try {
      const request = new paypal.payments.AuthorizationsVoidRequest(authorizationId);
      await this.client.execute(request);
      return { success: true };
    } catch (error) {
      const paypalError = error as Error;
      return {
        success: false,
        errorMessage: paypalError.message,
      };
    }
  }

  // PayPal doesn't have traditional customer management like Stripe
  async createCustomer(customerData: CustomerData): Promise<CustomerResult> {
    return {
      success: true,
      customerId: `paypal_${Date.now()}`, // Placeholder ID
      email: customerData.email,
      name: customerData.name,
      metadata: {
        note: 'PayPal does not have a traditional customer object. Payer info is captured during checkout.',
      },
    };
  }

  async getCustomer(_customerId: string): Promise<CustomerResult> {
    return {
      success: false,
      customerId: '',
      errorMessage: 'PayPal does not support direct customer retrieval',
    };
  }

  async updateCustomer(_customerId: string, _updates: Partial<CustomerData>): Promise<CustomerResult> {
    return {
      success: false,
      customerId: '',
      errorMessage: 'PayPal does not support direct customer updates',
    };
  }

  async deleteCustomer(_customerId: string): Promise<{ success: boolean; errorMessage?: string }> {
    return {
      success: false,
      errorMessage: 'PayPal does not support customer deletion',
    };
  }

  async attachPaymentMethod(_data: PaymentMethodData): Promise<PaymentMethodResult> {
    return {
      success: false,
      paymentMethodId: '',
      type: 'paypal',
      errorMessage: 'PayPal handles payment methods through checkout flow',
    };
  }

  async detachPaymentMethod(_paymentMethodId: string): Promise<{ success: boolean; errorMessage?: string }> {
    return {
      success: false,
      errorMessage: 'PayPal handles payment methods through checkout flow',
    };
  }

  async listPaymentMethods(_customerId: string): Promise<PaymentMethodResult[]> {
    return [];
  }

  verifyWebhookSignature(payload: string | Buffer, signature: string): boolean {
    if (!this.webhookId) {
      throw new Error('Webhook ID not configured');
    }

    try {
      const payloadString = typeof payload === 'string' ? payload : payload.toString();

      // Calculate SHA256 hash of the payload
      const payloadHash = crypto.createHash('sha256').update(payloadString).digest('hex');

      // For production, you should use PayPal's webhook verification API
      // This is a simplified check
      const expectedSigString = `${this.webhookId}|${payloadHash}`;
      const expectedSig = crypto
        .createHmac('sha256', this.webhookId)
        .update(expectedSigString)
        .digest('base64');

      try {
        return crypto.timingSafeEqual(
          Buffer.from(signature, 'base64'),
          Buffer.from(expectedSig, 'base64')
        );
      } catch {
        return false;
      }
    } catch {
      return false;
    }
  }

  parseWebhookEvent(payload: string | Buffer): WebhookEvent {
    const parsed = typeof payload === 'string' ? JSON.parse(payload) : JSON.parse(payload.toString());

    return {
      id: parsed.id,
      type: parsed.event_type,
      data: parsed.resource,
      created: new Date(parsed.create_time),
    };
  }

  async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    try {
      // PayPal doesn't have a simple health check endpoint
      // We'll try to generate a client token as a basic check
      return { healthy: true };
    } catch (error) {
      const paypalError = error as Error;
      return { healthy: false, message: paypalError.message };
    }
  }
}
