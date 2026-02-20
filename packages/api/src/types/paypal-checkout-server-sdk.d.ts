declare module '@paypal/checkout-server-sdk' {
  export namespace core {
    class SandboxEnvironment {
      constructor(clientId: string, clientSecret: string);
    }

    class LiveEnvironment {
      constructor(clientId: string, clientSecret: string);
    }

    class PayPalHttpClient {
      constructor(environment: SandboxEnvironment | LiveEnvironment);
      execute<T>(request: unknown): Promise<{ result: T; statusCode: number }>;
    }
  }

  export namespace orders {
    class OrdersCreateRequest {
      requestBody(body: OrderCreateRequestBody): void;
      prefer(header: string): void;
    }

    class OrdersCaptureRequest {
      constructor(orderId: string);
      requestBody(body: unknown): void;
      prefer(header: string): void;
    }

    class OrdersGetRequest {
      constructor(orderId: string);
    }

    interface OrderCreateRequestBody {
      intent: 'CAPTURE' | 'AUTHORIZE';
      purchase_units: PurchaseUnit[];
      application_context?: {
        return_url?: string;
        cancel_url?: string;
        brand_name?: string;
        user_action?: string;
      };
    }

    interface PurchaseUnit {
      amount: {
        currency_code: string;
        value: string;
        breakdown?: {
          item_total?: { currency_code: string; value: string };
          shipping?: { currency_code: string; value: string };
          handling?: { currency_code: string; value: string };
          tax_total?: { currency_code: string; value: string };
          insurance?: { currency_code: string; value: string };
          shipping_discount?: { currency_code: string; value: string };
          discount?: { currency_code: string; value: string };
        };
      };
      description?: string;
      custom_id?: string;
      invoice_id?: string;
      reference_id?: string;
      items?: Item[];
    }

    interface Item {
      name: string;
      unit_amount: { currency_code: string; value: string };
      quantity: string;
      description?: string;
      sku?: string;
      category?: 'DIGITAL_GOODS' | 'PHYSICAL_GOODS' | 'DONATION';
    }

    interface Order {
      id: string;
      status: 'CREATED' | 'SAVED' | 'APPROVED' | 'VOIDED' | 'COMPLETED' | 'PAYER_ACTION_REQUIRED';
      links: Array<{ href: string; rel: string; method: string }>;
      purchase_units: Array<{
        reference_id?: string;
        payments?: {
          captures?: Array<{
            id: string;
            status: string;
            amount: { currency_code: string; value: string };
          }>;
        };
      }>;
    }
  }

  export namespace payments {
    class CapturesRefundRequest {
      constructor(captureId: string);
      requestBody(body: RefundRequestBody): void;
    }

    class AuthorizationsVoidRequest {
      constructor(authorizationId: string);
    }

    class AuthorizationsCaptureRequest {
      constructor(authorizationId: string);
      requestBody(body: CaptureRequestBody): void;
      prefer(header: string): void;
    }

    interface RefundRequestBody {
      amount?: { currency_code: string; value: string };
      note_to_payer?: string;
      invoice_id?: string;
    }

    interface CaptureRequestBody {
      amount?: { currency_code: string; value: string };
      final_capture?: boolean;
    }

    interface Refund {
      id: string;
      status: string;
      amount: { currency_code: string; value: string };
    }
  }
}
