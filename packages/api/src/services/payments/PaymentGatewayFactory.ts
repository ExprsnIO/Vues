import type { PaymentProvider } from '@exprsn/shared/types';
import { BasePaymentGateway, type GatewayCredentials } from './BasePaymentGateway.js';
import { StripeGateway } from './StripeGateway.js';
import { PayPalGateway } from './PayPalGateway.js';
import { AuthorizeNetGateway } from './AuthorizeNetGateway.js';

/**
 * Cache for gateway instances to avoid recreating them for every request
 */
const gatewayCache = new Map<string, BasePaymentGateway>();

/**
 * Factory for creating payment gateway instances
 */
export class PaymentGatewayFactory {
  /**
   * Create a payment gateway instance for the given provider
   */
  static create(
    provider: PaymentProvider,
    credentials: GatewayCredentials,
    testMode = true
  ): BasePaymentGateway {
    switch (provider) {
      case 'stripe':
        return new StripeGateway(
          credentials as { secretKey: string; publishableKey?: string; webhookSecret?: string },
          testMode
        );

      case 'paypal':
        return new PayPalGateway(
          credentials as { clientId: string; clientSecret: string; webhookId?: string },
          testMode
        );

      case 'authorizenet':
        return new AuthorizeNetGateway(
          credentials as { apiLoginId: string; transactionKey: string; signatureKey?: string },
          testMode
        );

      default:
        throw new Error(`Unsupported payment provider: ${provider}`);
    }
  }

  /**
   * Get or create a cached gateway instance
   * Uses a combination of provider, testMode, and credentials hash as the cache key
   */
  static getOrCreate(
    configId: string,
    provider: PaymentProvider,
    credentials: GatewayCredentials,
    testMode = true
  ): BasePaymentGateway {
    const cacheKey = `${configId}:${provider}:${testMode}`;

    let gateway = gatewayCache.get(cacheKey);
    if (!gateway) {
      gateway = this.create(provider, credentials, testMode);
      gatewayCache.set(cacheKey, gateway);
    }

    return gateway;
  }

  /**
   * Clear a specific gateway from the cache
   */
  static clearCache(configId: string): void {
    // Remove all entries for this config
    for (const key of gatewayCache.keys()) {
      if (key.startsWith(`${configId}:`)) {
        gatewayCache.delete(key);
      }
    }
  }

  /**
   * Clear all cached gateways
   */
  static clearAllCache(): void {
    gatewayCache.clear();
  }

  /**
   * Get supported providers
   */
  static getSupportedProviders(): PaymentProvider[] {
    return ['stripe', 'paypal', 'authorizenet'];
  }

  /**
   * Check if a provider is supported
   */
  static isProviderSupported(provider: string): provider is PaymentProvider {
    return this.getSupportedProviders().includes(provider as PaymentProvider);
  }

  /**
   * Credential field metadata for UI display
   */
  static readonly credentialMetadata: Record<string, { label: string; description: string; placeholder?: string }> = {
    // Stripe
    secretKey: { label: 'Secret Key', description: 'Your Stripe secret API key (starts with sk_)', placeholder: 'sk_test_...' },
    publishableKey: { label: 'Publishable Key', description: 'Your Stripe publishable key (starts with pk_)', placeholder: 'pk_test_...' },
    webhookSecret: { label: 'Webhook Secret', description: 'Webhook signing secret (starts with whsec_)', placeholder: 'whsec_...' },
    // PayPal
    clientId: { label: 'Client ID', description: 'Your PayPal app Client ID', placeholder: 'AV...' },
    clientSecret: { label: 'Client Secret', description: 'Your PayPal app Client Secret', placeholder: 'EK...' },
    webhookId: { label: 'Webhook ID', description: 'PayPal webhook ID for event notifications', placeholder: '1234567890' },
    // Authorize.Net
    apiLoginId: { label: 'API Login ID', description: 'Your Authorize.Net API Login ID', placeholder: '5KP3...' },
    transactionKey: { label: 'Transaction Key', description: 'Your Authorize.Net Transaction Key', placeholder: '4Ktq...' },
    signatureKey: { label: 'Signature Key', description: 'Signature key for webhook verification', placeholder: '' },
  };

  /**
   * Get the required credentials for a provider
   */
  static getRequiredCredentials(provider: PaymentProvider): string[] {
    switch (provider) {
      case 'stripe':
        return ['secretKey'];
      case 'paypal':
        return ['clientId', 'clientSecret'];
      case 'authorizenet':
        return ['apiLoginId', 'transactionKey'];
      default:
        return [];
    }
  }

  /**
   * Get optional credentials for a provider
   */
  static getOptionalCredentials(provider: PaymentProvider): string[] {
    switch (provider) {
      case 'stripe':
        return ['publishableKey', 'webhookSecret'];
      case 'paypal':
        return ['webhookId'];
      case 'authorizenet':
        return ['signatureKey'];
      default:
        return [];
    }
  }

  /**
   * Get credential field metadata
   */
  static getCredentialMetadata(field: string): { label: string; description: string; placeholder?: string } {
    return this.credentialMetadata[field] || { label: field, description: '', placeholder: '' };
  }

  /**
   * Validate credentials for a provider
   */
  static validateCredentials(
    provider: PaymentProvider,
    credentials: GatewayCredentials
  ): { valid: boolean; missing: string[] } {
    const required = this.getRequiredCredentials(provider);
    const missing = required.filter((key) => !credentials[key]);

    return {
      valid: missing.length === 0,
      missing,
    };
  }
}
