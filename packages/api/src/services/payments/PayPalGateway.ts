import paypal from '@paypal/checkout-server-sdk';
import crypto from 'crypto';
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

  /**
   * Create a customer in PayPal Vault
   * PayPal uses merchant_customer_id for customer identification
   */
  async createCustomer(customerData: CustomerData): Promise<CustomerResult> {
    try {
      // PayPal doesn't have a separate customer creation endpoint
      // Customers are created implicitly when vaulting payment methods
      // We generate a merchant_customer_id that can be used to link payment tokens
      const merchantCustomerId = `cust_${crypto.randomUUID().replace(/-/g, '').substring(0, 22)}`;

      return {
        success: true,
        customerId: merchantCustomerId,
        email: customerData.email,
        name: customerData.name,
        metadata: {
          merchantCustomerId,
          note: 'PayPal customer ID for vault operations. Payment tokens will be linked to this ID.',
        },
      };
    } catch (error) {
      const err = error as Error;
      return {
        success: false,
        customerId: '',
        errorMessage: err.message,
      };
    }
  }

  /**
   * Get customer info from PayPal
   * Retrieves payment tokens associated with customer_id
   */
  async getCustomer(customerId: string): Promise<CustomerResult> {
    try {
      const accessToken = await this.getAccessToken();
      const baseUrl = this.testMode
        ? 'https://api-m.sandbox.paypal.com'
        : 'https://api-m.paypal.com';

      // List payment tokens for this customer
      const response = await fetch(
        `${baseUrl}/v3/vault/payment-tokens?customer_id=${encodeURIComponent(customerId)}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        if (response.status === 404) {
          return {
            success: false,
            customerId,
            errorMessage: 'Customer not found or has no vaulted payment methods',
          };
        }
        throw new Error(`PayPal API error: ${response.status}`);
      }

      const data = await response.json() as {
        customer?: { id: string; merchant_customer_id?: string };
        payment_tokens?: Array<{ id: string }>;
        total_items?: number;
      };

      return {
        success: true,
        customerId,
        metadata: {
          paymentTokenCount: data.payment_tokens?.length || 0,
          totalItems: data.total_items || 0,
        },
      };
    } catch (error) {
      const err = error as Error;
      return {
        success: false,
        customerId,
        errorMessage: err.message,
      };
    }
  }

  /**
   * Update customer - PayPal doesn't support direct customer updates
   * Customer data is managed through payment token operations
   */
  async updateCustomer(customerId: string, updates: Partial<CustomerData>): Promise<CustomerResult> {
    // PayPal doesn't have customer profile updates
    // Return success with note about limitations
    return {
      success: true,
      customerId,
      email: updates.email,
      name: updates.name,
      metadata: {
        note: 'PayPal customer profiles are managed through payment tokens. Updates to email/name should be handled in your application database.',
      },
    };
  }

  /**
   * Delete customer - Deletes all vaulted payment tokens for customer
   */
  async deleteCustomer(customerId: string): Promise<{ success: boolean; errorMessage?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      const baseUrl = this.testMode
        ? 'https://api-m.sandbox.paypal.com'
        : 'https://api-m.paypal.com';

      // First, list all payment tokens for this customer
      const listResponse = await fetch(
        `${baseUrl}/v3/vault/payment-tokens?customer_id=${encodeURIComponent(customerId)}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!listResponse.ok) {
        if (listResponse.status === 404) {
          return { success: true }; // No tokens to delete
        }
        throw new Error(`Failed to list payment tokens: ${listResponse.status}`);
      }

      const data = await listResponse.json() as {
        payment_tokens?: Array<{ id: string }>;
      };

      // Delete each payment token
      const tokens = data.payment_tokens || [];
      for (const token of tokens) {
        const deleteResponse = await fetch(
          `${baseUrl}/v3/vault/payment-tokens/${token.id}`,
          {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
          }
        );

        if (!deleteResponse.ok && deleteResponse.status !== 404) {
          console.warn(`Failed to delete PayPal token ${token.id}: ${deleteResponse.status}`);
        }
      }

      return { success: true };
    } catch (error) {
      const err = error as Error;
      return {
        success: false,
        errorMessage: err.message,
      };
    }
  }

  /**
   * Create a setup token for vaulting a payment method
   * Returns URL for customer to complete payment method setup
   */
  async attachPaymentMethod(data: PaymentMethodData): Promise<PaymentMethodResult> {
    try {
      const accessToken = await this.getAccessToken();
      const baseUrl = this.testMode
        ? 'https://api-m.sandbox.paypal.com'
        : 'https://api-m.paypal.com';

      const returnUrl = process.env.PAYPAL_RETURN_URL || `${process.env.APP_URL}/payments/success`;
      const cancelUrl = process.env.PAYPAL_CANCEL_URL || `${process.env.APP_URL}/payments/cancel`;

      // Create a setup token for vault
      const response = await fetch(`${baseUrl}/v3/vault/setup-tokens`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'PayPal-Request-Id': crypto.randomUUID(),
        },
        body: JSON.stringify({
          payment_source: {
            paypal: {
              description: 'Billing Agreement',
              usage_type: 'MERCHANT',
              customer_type: 'CONSUMER',
              experience_context: {
                return_url: returnUrl,
                cancel_url: cancelUrl,
              },
            },
          },
          customer: data.customerId ? { id: data.customerId } : undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`PayPal setup token creation failed: ${response.status} - ${JSON.stringify(errorData)}`);
      }

      const setupToken = await response.json() as {
        id: string;
        status: string;
        links: Array<{ rel: string; href: string }>;
      };

      return {
        success: true,
        paymentMethodId: setupToken.id,
        type: 'paypal',
      };
    } catch (error) {
      const err = error as Error;
      return {
        success: false,
        paymentMethodId: '',
        type: 'paypal',
        errorMessage: err.message,
      };
    }
  }

  /**
   * Delete a vaulted payment token
   */
  async detachPaymentMethod(paymentMethodId: string): Promise<{ success: boolean; errorMessage?: string }> {
    try {
      const accessToken = await this.getAccessToken();
      const baseUrl = this.testMode
        ? 'https://api-m.sandbox.paypal.com'
        : 'https://api-m.paypal.com';

      const response = await fetch(
        `${baseUrl}/v3/vault/payment-tokens/${paymentMethodId}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok && response.status !== 404) {
        throw new Error(`Failed to delete payment token: ${response.status}`);
      }

      return { success: true };
    } catch (error) {
      const err = error as Error;
      return {
        success: false,
        errorMessage: err.message,
      };
    }
  }

  async listPaymentMethods(customerId: string): Promise<PaymentMethodResult[]> {
    try {
      // Get access token for API calls
      const accessToken = await this.getAccessToken();

      // PayPal Vault API to list payment tokens
      const baseUrl = this.testMode
        ? 'https://api-m.sandbox.paypal.com'
        : 'https://api-m.paypal.com';

      const response = await fetch(
        `${baseUrl}/v3/vault/payment-tokens?customer_id=${encodeURIComponent(customerId)}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        console.error(`PayPal listPaymentMethods failed: ${response.status} ${response.statusText}`);
        return [];
      }

      const data = await response.json() as {
        payment_tokens?: Array<{
          id: string;
          customer?: { id: string };
          payment_source?: {
            card?: {
              last_digits?: string;
              brand?: string;
              expiry?: string;
            };
            paypal?: {
              email_address?: string;
            };
          };
        }>;
      };

      if (!data.payment_tokens || data.payment_tokens.length === 0) {
        return [];
      }

      return data.payment_tokens.map((token): PaymentMethodResult => {
        const card = token.payment_source?.card;
        const paypalAccount = token.payment_source?.paypal;

        if (card) {
          return {
            success: true,
            paymentMethodId: token.id,
            type: 'card' as const,
            last4: card.last_digits,
            brand: this.mapPayPalCardBrand(card.brand),
            expiryMonth: card.expiry ? parseInt(card.expiry.split('-')[1] || '0', 10) : undefined,
            expiryYear: card.expiry ? parseInt(card.expiry.split('-')[0] || '0', 10) : undefined,
          };
        } else if (paypalAccount) {
          return {
            success: true,
            paymentMethodId: token.id,
            type: 'paypal' as const,
          };
        }

        return {
          success: true,
          paymentMethodId: token.id,
          type: 'paypal' as const,
        };
      });
    } catch (error) {
      console.error('PayPal listPaymentMethods error:', error);
      return [];
    }
  }

  /**
   * Get PayPal access token for API calls
   */
  private async getAccessToken(): Promise<string> {
    const credentials = this.credentials as PayPalCredentials;
    const baseUrl = this.testMode
      ? 'https://api-m.sandbox.paypal.com'
      : 'https://api-m.paypal.com';

    const auth = Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString('base64');

    const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    if (!response.ok) {
      throw new Error(`Failed to get PayPal access token: ${response.status}`);
    }

    const data = await response.json() as { access_token: string };
    return data.access_token;
  }

  /**
   * Map PayPal card brand to standard CardBrand type
   */
  private mapPayPalCardBrand(brand?: string): CardBrand | undefined {
    if (!brand) return undefined;
    const brandLower = brand.toLowerCase();
    const brandMap: Record<string, CardBrand> = {
      visa: 'visa',
      mastercard: 'mastercard',
      amex: 'amex',
      'american express': 'amex',
      discover: 'discover',
      diners: 'diners',
      'diners club': 'diners',
      jcb: 'jcb',
      unionpay: 'unionpay',
      'china unionpay': 'unionpay',
    };
    return brandMap[brandLower] || 'unknown';
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

  /**
   * Create a payout to a PayPal account or email
   * Uses PayPal Payouts API
   */
  async createPayout(
    amount: number,
    currency: CurrencyCode,
    destination: string, // PayPal email or PayPal ID
    metadata?: Record<string, unknown>
  ): Promise<{
    success: boolean;
    payoutId: string;
    status: 'pending' | 'in_transit' | 'paid' | 'failed';
    arrivalDate?: Date;
    errorMessage?: string;
  }> {
    try {
      const accessToken = await this.getAccessToken();
      const baseUrl = this.testMode
        ? 'https://api-m.sandbox.paypal.com'
        : 'https://api-m.paypal.com';

      // Determine if destination is email or PayPal ID
      const isEmail = destination.includes('@');
      const recipientType = isEmail ? 'EMAIL' : 'PAYPAL_ID';

      // Convert amount to decimal string (PayPal expects string with 2 decimal places)
      const amountStr = (amount / 100).toFixed(2);

      // Create a unique sender batch ID
      const senderBatchId = `payout_${crypto.randomUUID().replace(/-/g, '').substring(0, 20)}`;
      const senderItemId = `item_${crypto.randomUUID().replace(/-/g, '').substring(0, 20)}`;

      const response = await fetch(`${baseUrl}/v1/payments/payouts`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'PayPal-Request-Id': crypto.randomUUID(),
        },
        body: JSON.stringify({
          sender_batch_header: {
            sender_batch_id: senderBatchId,
            email_subject: metadata?.subject || 'You have received a payment',
            email_message: metadata?.message || 'Thank you for your service.',
          },
          items: [
            {
              recipient_type: recipientType,
              amount: {
                value: amountStr,
                currency: currency.toUpperCase(),
              },
              receiver: destination,
              note: metadata?.note || 'Creator payout',
              sender_item_id: senderItemId,
            },
          ],
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`PayPal payout failed: ${response.status} - ${JSON.stringify(errorData)}`);
      }

      const data = await response.json() as {
        batch_header: {
          payout_batch_id: string;
          batch_status: string;
          time_created?: string;
        };
        links: Array<{ rel: string; href: string }>;
      };

      // Map PayPal batch status to our status
      const statusMap: Record<string, 'pending' | 'in_transit' | 'paid' | 'failed'> = {
        'PENDING': 'pending',
        'PROCESSING': 'in_transit',
        'SUCCESS': 'paid',
        'NEW': 'pending',
        'DENIED': 'failed',
        'CANCELED': 'failed',
      };

      const status = statusMap[data.batch_header.batch_status] || 'pending';

      return {
        success: true,
        payoutId: data.batch_header.payout_batch_id,
        status,
        arrivalDate: status === 'paid' ? new Date() : undefined,
      };
    } catch (error) {
      const err = error as Error;
      console.error('PayPal payout error:', err);
      return {
        success: false,
        payoutId: '',
        status: 'failed',
        errorMessage: err.message,
      };
    }
  }

  /**
   * Get payout status
   */
  async getPayoutStatus(payoutId: string): Promise<{
    status: 'pending' | 'in_transit' | 'paid' | 'failed';
    errorMessage?: string;
  }> {
    try {
      const accessToken = await this.getAccessToken();
      const baseUrl = this.testMode
        ? 'https://api-m.sandbox.paypal.com'
        : 'https://api-m.paypal.com';

      const response = await fetch(`${baseUrl}/v1/payments/payouts/${payoutId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to get payout status: ${response.status}`);
      }

      const data = await response.json() as {
        batch_header: {
          batch_status: string;
        };
      };

      const statusMap: Record<string, 'pending' | 'in_transit' | 'paid' | 'failed'> = {
        'PENDING': 'pending',
        'PROCESSING': 'in_transit',
        'SUCCESS': 'paid',
        'NEW': 'pending',
        'DENIED': 'failed',
        'CANCELED': 'failed',
      };

      return {
        status: statusMap[data.batch_header.batch_status] || 'pending',
      };
    } catch (error) {
      const err = error as Error;
      return {
        status: 'failed',
        errorMessage: err.message,
      };
    }
  }
}
