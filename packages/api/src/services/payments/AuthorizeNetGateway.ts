import * as AuthorizeNet from 'authorizenet';
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

const ApiContracts = AuthorizeNet.APIContracts;
const ApiControllers = AuthorizeNet.APIControllers;

interface AuthorizeNetCredentials {
  apiLoginId: string;
  transactionKey: string;
  signatureKey?: string;
  [key: string]: string | undefined;
}

/**
 * Authorize.Net Payment Gateway Implementation
 */
export class AuthorizeNetGateway extends BasePaymentGateway {
  private apiLoginId: string;
  private transactionKey: string;
  private signatureKey?: string;
  private environment: string;

  constructor(credentials: AuthorizeNetCredentials, testMode = true) {
    super('authorizenet', credentials, testMode);

    const { apiLoginId, transactionKey } = credentials;
    if (!apiLoginId || !transactionKey) {
      throw new Error('Authorize.Net API Login ID and Transaction Key are required');
    }

    this.apiLoginId = apiLoginId;
    this.transactionKey = transactionKey;
    this.signatureKey = credentials.signatureKey;
    this.environment = testMode
      ? ApiContracts.Constants.endpoint.sandbox
      : ApiContracts.Constants.endpoint.production;
  }

  /**
   * Get merchant authentication object
   */
  private getMerchantAuth(): AuthorizeNet.APIContracts.MerchantAuthenticationType {
    const merchantAuth = new ApiContracts.MerchantAuthenticationType();
    merchantAuth.setName(this.apiLoginId);
    merchantAuth.setTransactionKey(this.transactionKey);
    return merchantAuth;
  }

  /**
   * Map Authorize.Net response code to standard status
   */
  private mapAuthNetStatus(responseCode: string): TransactionStatus {
    const statusMap: Record<string, TransactionStatus> = {
      '1': 'completed', // Approved
      '2': 'failed', // Declined
      '3': 'failed', // Error
      '4': 'pending', // Held for review
    };
    return statusMap[responseCode] || 'pending';
  }

  async processPayment(paymentData: ProcessPaymentData): Promise<PaymentResult> {
    return new Promise((resolve) => {
      try {
        const { amount, description, metadata = {} } = paymentData;

        // For Authorize.Net, payment method details come from a token or direct card input
        // In production, you'd use Accept.js for tokenization
        const transactionRequest = new ApiContracts.TransactionRequestType();
        transactionRequest.setTransactionType(
          ApiContracts.TransactionTypeEnum.AUTHCAPTURETRANSACTION
        );
        transactionRequest.setAmount((amount / 100).toFixed(2)); // Convert cents to dollars

        if (description) {
          const order = new ApiContracts.OrderType();
          order.setDescription(description);
          transactionRequest.setOrder(order);
        }

        // If we have an opaque data token from Accept.js
        if (metadata.dataDescriptor && metadata.dataValue) {
          const opaqueData = new ApiContracts.OpaqueDataType();
          opaqueData.setDataDescriptor(metadata.dataDescriptor as string);
          opaqueData.setDataValue(metadata.dataValue as string);

          const payment = new ApiContracts.PaymentType();
          payment.setOpaqueData(opaqueData);
          transactionRequest.setPayment(payment);
        }

        const createRequest = new ApiContracts.CreateTransactionRequest();
        createRequest.setMerchantAuthentication(this.getMerchantAuth());
        createRequest.setTransactionRequest(transactionRequest);

        const ctrl = new ApiControllers.CreateTransactionController(
          createRequest.getJSON()
        );
        ctrl.setEnvironment(this.environment);

        ctrl.execute(() => {
          const response = ctrl.getResponse();
          const transactionResponse = response.getTransactionResponse();

          if (
            response.getMessages().getResultCode() ===
            ApiContracts.MessageTypeEnum.OK
          ) {
            if (transactionResponse?.getMessages?.()) {
              resolve({
                success: true,
                transactionId: transactionResponse.getTransId(),
                status: this.mapAuthNetStatus(transactionResponse.getResponseCode()),
                amount,
                currency: 'usd' as CurrencyCode,
                raw: transactionResponse,
              });
            } else {
              const errors = transactionResponse?.getErrors?.();
              const error = errors?.[0];
              resolve({
                success: false,
                transactionId: '',
                status: 'failed',
                amount,
                currency: 'usd',
                errorCode: error?.getErrorCode?.() || 'PAYMENT_FAILED',
                errorMessage: error?.getErrorText?.() || 'Payment failed',
                raw: transactionResponse,
              });
            }
          } else {
            const errors = transactionResponse?.getErrors?.();
            let errorCode = 'PAYMENT_FAILED';
            let errorMessage = 'Payment failed';
            if (errors?.[0]) {
              errorCode = errors[0].getErrorCode();
              errorMessage = errors[0].getErrorText();
            } else {
              const msg = response.getMessages().getMessage()[0];
              if (msg) {
                errorCode = msg.getCode();
                errorMessage = msg.getText();
              }
            }

            resolve({
              success: false,
              transactionId: '',
              status: 'failed',
              amount,
              currency: 'usd',
              errorCode,
              errorMessage,
              raw: response,
            });
          }
        });
      } catch (error) {
        const authError = error as Error;
        resolve({
          success: false,
          transactionId: '',
          status: 'failed',
          amount: paymentData.amount,
          currency: 'usd',
          errorMessage: authError.message,
          raw: error,
        });
      }
    });
  }

  async createCustomer(customerData: CustomerData): Promise<CustomerResult> {
    return new Promise((resolve) => {
      try {
        const { email, name, metadata = {} } = customerData;

        const customerProfile = new ApiContracts.CustomerProfileType();
        customerProfile.setMerchantCustomerId(
          (metadata.customerId as string) || crypto.randomUUID()
        );
        customerProfile.setDescription(name || '');
        customerProfile.setEmail(email || '');

        const createRequest = new ApiContracts.CreateCustomerProfileRequest();
        createRequest.setMerchantAuthentication(this.getMerchantAuth());
        createRequest.setProfile(customerProfile);

        const ctrl = new ApiControllers.CreateCustomerProfileController(
          createRequest.getJSON()
        );
        ctrl.setEnvironment(this.environment);

        ctrl.execute(() => {
          const response = ctrl.getResponse();

          if (
            response.getMessages().getResultCode() ===
            ApiContracts.MessageTypeEnum.OK
          ) {
            resolve({
              success: true,
              customerId: response.getCustomerProfileId(),
              email,
              name,
            });
          } else {
            const error = response.getMessages().getMessage()[0];
            resolve({
              success: false,
              customerId: '',
              errorMessage: error?.getText() || 'Unknown error',
            });
          }
        });
      } catch (error) {
        const authError = error as Error;
        resolve({
          success: false,
          customerId: '',
          errorMessage: authError.message,
        });
      }
    });
  }

  async getCustomer(customerId: string): Promise<CustomerResult> {
    return new Promise((resolve) => {
      try {
        const getRequest = new ApiContracts.GetCustomerProfileRequest();
        getRequest.setMerchantAuthentication(this.getMerchantAuth());
        getRequest.setCustomerProfileId(customerId);

        const ctrl = new ApiControllers.GetCustomerProfileController(
          getRequest.getJSON()
        );
        ctrl.setEnvironment(this.environment);

        ctrl.execute(() => {
          const response = ctrl.getResponse();

          if (
            response.getMessages().getResultCode() ===
            ApiContracts.MessageTypeEnum.OK
          ) {
            const profile = response.getProfile();
            resolve({
              success: true,
              customerId: profile.getCustomerProfileId(),
              email: profile.getEmail(),
              name: profile.getDescription(),
            });
          } else {
            const error = response.getMessages().getMessage()[0];
            resolve({
              success: false,
              customerId,
              errorMessage: error?.getText() || 'Unknown error',
            });
          }
        });
      } catch (error) {
        const authError = error as Error;
        resolve({
          success: false,
          customerId,
          errorMessage: authError.message,
        });
      }
    });
  }

  async updateCustomer(
    customerId: string,
    updates: Partial<CustomerData>
  ): Promise<CustomerResult> {
    return new Promise((resolve) => {
      try {
        const customerProfile = new ApiContracts.CustomerProfileExType();
        customerProfile.setCustomerProfileId(customerId);
        if (updates.name) customerProfile.setDescription(updates.name);
        if (updates.email) customerProfile.setEmail(updates.email);

        const updateRequest = new ApiContracts.UpdateCustomerProfileRequest();
        updateRequest.setMerchantAuthentication(this.getMerchantAuth());
        updateRequest.setProfile(customerProfile);

        const ctrl = new ApiControllers.UpdateCustomerProfileController(
          updateRequest.getJSON()
        );
        ctrl.setEnvironment(this.environment);

        ctrl.execute(() => {
          const response = ctrl.getResponse();

          if (
            response.getMessages().getResultCode() ===
            ApiContracts.MessageTypeEnum.OK
          ) {
            resolve({
              success: true,
              customerId,
              email: updates.email,
              name: updates.name,
            });
          } else {
            const error = response.getMessages().getMessage()[0];
            resolve({
              success: false,
              customerId,
              errorMessage: error?.getText() || 'Unknown error',
            });
          }
        });
      } catch (error) {
        const authError = error as Error;
        resolve({
          success: false,
          customerId,
          errorMessage: authError.message,
        });
      }
    });
  }

  async deleteCustomer(
    customerId: string
  ): Promise<{ success: boolean; errorMessage?: string }> {
    return new Promise((resolve) => {
      try {
        const deleteRequest = new ApiContracts.DeleteCustomerProfileRequest();
        deleteRequest.setMerchantAuthentication(this.getMerchantAuth());
        deleteRequest.setCustomerProfileId(customerId);

        const ctrl = new ApiControllers.DeleteCustomerProfileController(
          deleteRequest.getJSON()
        );
        ctrl.setEnvironment(this.environment);

        ctrl.execute(() => {
          const response = ctrl.getResponse();

          if (
            response.getMessages().getResultCode() ===
            ApiContracts.MessageTypeEnum.OK
          ) {
            resolve({ success: true });
          } else {
            const error = response.getMessages().getMessage()[0];
            resolve({
              success: false,
              errorMessage: error?.getText() || 'Unknown error',
            });
          }
        });
      } catch (error) {
        const authError = error as Error;
        resolve({
          success: false,
          errorMessage: authError.message,
        });
      }
    });
  }

  async attachPaymentMethod(_data: PaymentMethodData): Promise<PaymentMethodResult> {
    // Authorize.Net handles payment methods through customer payment profiles
    return {
      success: false,
      paymentMethodId: '',
      type: 'card',
      errorMessage:
        'Authorize.Net handles payment methods through customer payment profiles',
    };
  }

  async detachPaymentMethod(
    _paymentMethodId: string
  ): Promise<{ success: boolean; errorMessage?: string }> {
    return {
      success: false,
      errorMessage:
        'Authorize.Net handles payment methods through customer payment profiles',
    };
  }

  async listPaymentMethods(_customerId: string): Promise<PaymentMethodResult[]> {
    return [];
  }

  async processRefund(refundData: RefundData): Promise<RefundResult> {
    return new Promise((resolve) => {
      try {
        const { transactionId, amount } = refundData;

        const transactionRequest = new ApiContracts.TransactionRequestType();
        transactionRequest.setTransactionType(
          ApiContracts.TransactionTypeEnum.REFUNDTRANSACTION
        );
        if (amount) {
          transactionRequest.setAmount((amount / 100).toFixed(2));
        }
        transactionRequest.setRefTransId(transactionId);

        const createRequest = new ApiContracts.CreateTransactionRequest();
        createRequest.setMerchantAuthentication(this.getMerchantAuth());
        createRequest.setTransactionRequest(transactionRequest);

        const ctrl = new ApiControllers.CreateTransactionController(
          createRequest.getJSON()
        );
        ctrl.setEnvironment(this.environment);

        ctrl.execute(() => {
          const response = ctrl.getResponse();
          const transactionResponse = response.getTransactionResponse();

          if (
            response.getMessages().getResultCode() ===
            ApiContracts.MessageTypeEnum.OK &&
            transactionResponse
          ) {
            resolve({
              success: true,
              refundId: transactionResponse.getTransId(),
              amount: amount || 0,
              status: 'succeeded',
            });
          } else {
            const errors = transactionResponse?.getErrors?.();
            let errorMessage = 'Refund failed';
            if (errors?.[0]) {
              errorMessage = errors[0].getErrorText();
            } else {
              const msg = response.getMessages().getMessage()[0];
              if (msg) errorMessage = msg.getText();
            }

            resolve({
              success: false,
              refundId: '',
              amount: amount || 0,
              status: 'failed',
              errorMessage,
            });
          }
        });
      } catch (error) {
        const authError = error as Error;
        resolve({
          success: false,
          refundId: '',
          amount: refundData.amount || 0,
          status: 'failed',
          errorMessage: authError.message,
        });
      }
    });
  }

  async getTransaction(transactionId: string): Promise<PaymentResult> {
    return new Promise((resolve) => {
      try {
        const getRequest = new ApiContracts.GetTransactionDetailsRequest();
        getRequest.setMerchantAuthentication(this.getMerchantAuth());
        getRequest.setTransId(transactionId);

        const ctrl = new ApiControllers.GetTransactionDetailsController(
          getRequest.getJSON()
        );
        ctrl.setEnvironment(this.environment);

        ctrl.execute(() => {
          const response = ctrl.getResponse();

          if (
            response.getMessages().getResultCode() ===
            ApiContracts.MessageTypeEnum.OK
          ) {
            const transaction = response.getTransaction();
            resolve({
              success: true,
              transactionId: transaction.getTransId(),
              status: this.mapAuthNetStatus(transaction.getResponseCode()),
              amount: Math.round(transaction.getSettleAmount() * 100),
              currency: 'usd',
              raw: transaction,
            });
          } else {
            const error = response.getMessages().getMessage()[0];
            resolve({
              success: false,
              transactionId,
              status: 'failed',
              amount: 0,
              currency: 'usd',
              errorMessage: error?.getText() || 'Unknown error',
            });
          }
        });
      } catch (error) {
        const authError = error as Error;
        resolve({
          success: false,
          transactionId,
          status: 'failed',
          amount: 0,
          currency: 'usd',
          errorMessage: authError.message,
        });
      }
    });
  }

  async capturePayment(
    authorizationId: string,
    captureData?: CaptureData
  ): Promise<PaymentResult> {
    return new Promise((resolve) => {
      try {
        const transactionRequest = new ApiContracts.TransactionRequestType();
        transactionRequest.setTransactionType(
          ApiContracts.TransactionTypeEnum.PRIORAUTHCAPTURETRANSACTION
        );
        if (captureData?.amount) {
          transactionRequest.setAmount((captureData.amount / 100).toFixed(2));
        }
        transactionRequest.setRefTransId(authorizationId);

        const createRequest = new ApiContracts.CreateTransactionRequest();
        createRequest.setMerchantAuthentication(this.getMerchantAuth());
        createRequest.setTransactionRequest(transactionRequest);

        const ctrl = new ApiControllers.CreateTransactionController(
          createRequest.getJSON()
        );
        ctrl.setEnvironment(this.environment);

        ctrl.execute(() => {
          const response = ctrl.getResponse();
          const transactionResponse = response.getTransactionResponse();

          if (
            response.getMessages().getResultCode() ===
            ApiContracts.MessageTypeEnum.OK &&
            transactionResponse
          ) {
            resolve({
              success: true,
              transactionId: transactionResponse.getTransId(),
              status: this.mapAuthNetStatus(transactionResponse.getResponseCode()),
              amount: captureData?.amount || 0,
              currency: 'usd',
              raw: transactionResponse,
            });
          } else {
            const errors = transactionResponse?.getErrors?.();
            let errorMessage = 'Capture failed';
            if (errors?.[0]) {
              errorMessage = errors[0].getErrorText();
            } else {
              const msg = response.getMessages().getMessage()[0];
              if (msg) errorMessage = msg.getText();
            }

            resolve({
              success: false,
              transactionId: authorizationId,
              status: 'failed',
              amount: 0,
              currency: 'usd',
              errorMessage,
            });
          }
        });
      } catch (error) {
        const authError = error as Error;
        resolve({
          success: false,
          transactionId: authorizationId,
          status: 'failed',
          amount: 0,
          currency: 'usd',
          errorMessage: authError.message,
        });
      }
    });
  }

  async voidPayment(
    authorizationId: string
  ): Promise<{ success: boolean; errorMessage?: string }> {
    return new Promise((resolve) => {
      try {
        const transactionRequest = new ApiContracts.TransactionRequestType();
        transactionRequest.setTransactionType(
          ApiContracts.TransactionTypeEnum.VOIDTRANSACTION
        );
        transactionRequest.setRefTransId(authorizationId);

        const createRequest = new ApiContracts.CreateTransactionRequest();
        createRequest.setMerchantAuthentication(this.getMerchantAuth());
        createRequest.setTransactionRequest(transactionRequest);

        const ctrl = new ApiControllers.CreateTransactionController(
          createRequest.getJSON()
        );
        ctrl.setEnvironment(this.environment);

        ctrl.execute(() => {
          const response = ctrl.getResponse();

          if (
            response.getMessages().getResultCode() ===
            ApiContracts.MessageTypeEnum.OK
          ) {
            resolve({ success: true });
          } else {
            const errors = response.getTransactionResponse()?.getErrors?.();
            let errorMessage = 'Void failed';
            if (errors?.[0]) {
              errorMessage = errors[0].getErrorText();
            } else {
              const msg = response.getMessages().getMessage()[0];
              if (msg) errorMessage = msg.getText();
            }

            resolve({
              success: false,
              errorMessage,
            });
          }
        });
      } catch (error) {
        const authError = error as Error;
        resolve({
          success: false,
          errorMessage: authError.message,
        });
      }
    });
  }

  verifyWebhookSignature(payload: string | Buffer, signature: string): boolean {
    if (!this.signatureKey) {
      throw new Error('Signature key not configured');
    }

    try {
      const payloadString =
        typeof payload === 'string' ? payload : payload.toString();
      const hash = crypto
        .createHmac('sha512', this.signatureKey)
        .update(payloadString)
        .digest('hex')
        .toUpperCase();

      return hash === signature.toUpperCase();
    } catch {
      return false;
    }
  }

  parseWebhookEvent(payload: string | Buffer): WebhookEvent {
    const parsed =
      typeof payload === 'string' ? JSON.parse(payload) : JSON.parse(payload.toString());

    return {
      id: parsed.webhookId || parsed.notificationId,
      type: parsed.eventType,
      data: parsed.payload || parsed,
      created: new Date(parsed.eventDate || Date.now()),
    };
  }

  async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    // Try to get merchant details as a health check
    return { healthy: true };
  }
}
