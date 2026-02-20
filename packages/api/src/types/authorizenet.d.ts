declare module 'authorizenet' {
  export namespace APIContracts {
    // Constants
    const Constants: {
      endpoint: {
        production: string;
        sandbox: string;
      };
    };

    // Enums
    const TransactionTypeEnum: {
      AUTHCAPTURETRANSACTION: string;
      AUTHONLYTRANSACTION: string;
      CAPTUREONLYTRANSACTION: string;
      REFUNDTRANSACTION: string;
      VOIDTRANSACTION: string;
      PRIORAUTHCAPTURETRANSACTION: string;
    };

    const MessageTypeEnum: {
      OK: string;
      ERROR: string;
    };

    // Types
    class MerchantAuthenticationType {
      setName(name: string): void;
      setTransactionKey(key: string): void;
    }

    class CreditCardType {
      setCardNumber(number: string): void;
      setExpirationDate(date: string): void;
      setCardCode(code: string): void;
    }

    class PaymentType {
      setCreditCard(card: CreditCardType): void;
      setOpaqueData(data: OpaqueDataType): void;
    }

    class OpaqueDataType {
      setDataDescriptor(descriptor: string): void;
      setDataValue(value: string): void;
    }

    class OrderType {
      setInvoiceNumber(invoiceNumber: string): void;
      setDescription(description: string): void;
    }

    class TransactionRequestType {
      setTransactionType(type: string): void;
      setAmount(amount: string): void;
      setPayment(payment: PaymentType): void;
      setRefTransId(transId: string): void;
      setOrder(order: OrderType): void;
      setCustomerProfileId(profileId: string): void;
      setCustomerPaymentProfileId(paymentProfileId: string): void;
    }

    class CreateTransactionRequest {
      setMerchantAuthentication(auth: MerchantAuthenticationType): void;
      setTransactionRequest(request: TransactionRequestType): void;
      getJSON(): unknown;
    }

    class CreateCustomerProfileRequest {
      setMerchantAuthentication(auth: MerchantAuthenticationType): void;
      setProfile(profile: CustomerProfileType): void;
      getJSON(): unknown;
    }

    class GetCustomerProfileRequest {
      setMerchantAuthentication(auth: MerchantAuthenticationType): void;
      setCustomerProfileId(id: string): void;
      getJSON(): unknown;
    }

    class UpdateCustomerProfileRequest {
      setMerchantAuthentication(auth: MerchantAuthenticationType): void;
      setProfile(profile: CustomerProfileExType): void;
      getJSON(): unknown;
    }

    class DeleteCustomerProfileRequest {
      setMerchantAuthentication(auth: MerchantAuthenticationType): void;
      setCustomerProfileId(id: string): void;
      getJSON(): unknown;
    }

    class GetTransactionDetailsRequest {
      setMerchantAuthentication(auth: MerchantAuthenticationType): void;
      setTransId(transId: string): void;
      getJSON(): unknown;
    }

    class CustomerProfileType {
      setMerchantCustomerId(id: string): void;
      setEmail(email: string): void;
      setDescription(description: string): void;
      setPaymentProfiles(profiles: CustomerPaymentProfileType[]): void;
    }

    class CustomerProfileExType extends CustomerProfileType {
      setCustomerProfileId(id: string): void;
    }

    class CustomerPaymentProfileType {
      setPayment(payment: PaymentType): void;
      setBillTo(billTo: CustomerAddressType): void;
    }

    class CustomerAddressType {
      setFirstName(firstName: string): void;
      setLastName(lastName: string): void;
      setAddress(address: string): void;
      setCity(city: string): void;
      setState(state: string): void;
      setZip(zip: string): void;
      setCountry(country: string): void;
      setPhoneNumber(phone: string): void;
    }
  }

  export namespace APIControllers {
    class CreateTransactionController {
      constructor(request: unknown);
      setEnvironment(environment: string): void;
      execute(callback: (error: Error | null) => void): void;
      getResponse(): AuthorizeNetResponse;
    }

    class CreateCustomerProfileController {
      constructor(request: unknown);
      setEnvironment(environment: string): void;
      execute(callback: (error: Error | null) => void): void;
      getResponse(): CustomerProfileResponse;
    }

    class GetCustomerProfileController {
      constructor(request: unknown);
      setEnvironment(environment: string): void;
      execute(callback: (error: Error | null) => void): void;
      getResponse(): GetCustomerProfileResponse;
    }

    class UpdateCustomerProfileController {
      constructor(request: unknown);
      setEnvironment(environment: string): void;
      execute(callback: (error: Error | null) => void): void;
      getResponse(): AuthorizeNetBaseResponse;
    }

    class DeleteCustomerProfileController {
      constructor(request: unknown);
      setEnvironment(environment: string): void;
      execute(callback: (error: Error | null) => void): void;
      getResponse(): AuthorizeNetBaseResponse;
    }

    class GetTransactionDetailsController {
      constructor(request: unknown);
      setEnvironment(environment: string): void;
      execute(callback: (error: Error | null) => void): void;
      getResponse(): TransactionDetailsResponse;
    }
  }

  // Response types
  interface AuthorizeNetMessage {
    getResultCode(): string;
    getMessage(): Array<{ getCode(): string; getText(): string }>;
  }

  interface AuthorizeNetBaseResponse {
    getMessages(): AuthorizeNetMessage;
  }

  interface TransactionResponse {
    getTransId(): string;
    getResponseCode(): string;
    getAuthCode(): string;
    getAvsResultCode(): string;
    getCvvResultCode(): string;
    getAccountNumber(): string;
    getAccountType(): string;
    getRefTransID(): string;
    getErrors(): Array<{ getErrorCode(): string; getErrorText(): string }> | null;
    getMessages(): Array<{ getCode(): string; getDescription(): string }> | null;
  }

  interface AuthorizeNetResponse extends AuthorizeNetBaseResponse {
    getTransactionResponse(): TransactionResponse | null;
  }

  interface CustomerProfileResponse extends AuthorizeNetBaseResponse {
    getCustomerProfileId(): string;
    getCustomerPaymentProfileIdList(): {
      getNumericString(): string[];
    };
  }

  interface CustomerProfileData {
    getMerchantCustomerId(): string;
    getEmail(): string;
    getDescription(): string;
    getCustomerProfileId(): string;
    getPaymentProfiles(): Array<{
      getPayment(): {
        getCreditCard(): {
          getCardNumber(): string;
          getExpirationDate(): string;
        } | null;
      };
      getCustomerPaymentProfileId(): string;
    }>;
  }

  interface GetCustomerProfileResponse extends AuthorizeNetBaseResponse {
    getProfile(): CustomerProfileData;
  }

  interface TransactionData {
    getTransId(): string;
    getTransactionType(): string;
    getTransactionStatus(): string;
    getResponseCode(): string;
    getSettleAmount(): number;
    getAuthAmount(): number;
    getOrder(): {
      getInvoiceNumber(): string;
      getDescription(): string;
    } | null;
    getPayment(): {
      getCreditCard(): {
        getCardNumber(): string;
        getCardType(): string;
      } | null;
    };
  }

  interface TransactionDetailsResponse extends AuthorizeNetBaseResponse {
    getTransaction(): TransactionData;
  }

  export namespace Constants {
    const endpoint: {
      production: string;
      sandbox: string;
    };
  }
}
