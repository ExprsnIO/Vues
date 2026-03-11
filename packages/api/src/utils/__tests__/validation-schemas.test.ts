/**
 * Unit tests for Zod validation schemas
 * Run with: pnpm --filter @exprsn/api test validation-schemas
 */

import { describe, it, expect } from 'vitest';
import {
  handleSchema,
  emailSchema,
  passwordSchema,
  amountSchema,
  currencySchema,
  didSchema,
  createAccountSchema,
  chargeSchema,
  tipSchema,
  updateSettingsSchema,
} from '../validation-schemas.js';

describe('validation-schemas', () => {
  describe('handleSchema', () => {
    it('should accept valid handles', () => {
      expect(handleSchema.parse('testuser')).toBe('testuser');
      expect(handleSchema.parse('user_123')).toBe('user_123');
      expect(handleSchema.parse('abc')).toBe('abc'); // minimum length
    });

    it('should reject invalid handles', () => {
      expect(() => handleSchema.parse('ab')).toThrow('Handle must be at least 3 characters');
      expect(() => handleSchema.parse('a'.repeat(21))).toThrow('Handle must be at most 20 characters');
      expect(() => handleSchema.parse('user-name')).toThrow('Handle can only contain lowercase letters');
      expect(() => handleSchema.parse('_username')).toThrow('Handle cannot start or end with underscore');
      expect(() => handleSchema.parse('admin')).toThrow('This handle is reserved');
    });
  });

  describe('emailSchema', () => {
    it('should accept valid emails', () => {
      expect(emailSchema.parse('test@example.com')).toBe('test@example.com');
      expect(emailSchema.parse('User@Example.COM')).toBe('user@example.com'); // lowercase
      expect(emailSchema.parse('user+tag@example.co.uk')).toBe('user+tag@example.co.uk');
    });

    it('should reject invalid emails', () => {
      expect(() => emailSchema.parse('notanemail')).toThrow('Invalid email format');
      expect(() => emailSchema.parse('user@')).toThrow('Invalid email format');
      expect(() => emailSchema.parse('@example.com')).toThrow('Invalid email format');
    });
  });

  describe('passwordSchema', () => {
    it('should accept strong passwords', () => {
      expect(passwordSchema.parse('SecurePass123')).toBe('SecurePass123');
      expect(passwordSchema.parse('Abcd1234')).toBe('Abcd1234');
    });

    it('should reject weak passwords', () => {
      expect(() => passwordSchema.parse('short')).toThrow('Password must be at least 8 characters');
      expect(() => passwordSchema.parse('alllowercase123')).toThrow('Password must contain both uppercase and lowercase');
      expect(() => passwordSchema.parse('NoNumbers')).toThrow('Password must contain at least one number');
    });
  });

  describe('amountSchema', () => {
    it('should accept valid amounts', () => {
      expect(amountSchema.parse(100)).toBe(100); // $1.00
      expect(amountSchema.parse(50000)).toBe(50000); // $500.00
      expect(amountSchema.parse(999999999)).toBe(999999999); // ~$10M max
    });

    it('should reject invalid amounts', () => {
      expect(() => amountSchema.parse(0)).toThrow('Amount must be positive');
      expect(() => amountSchema.parse(-100)).toThrow('Amount must be positive');
      expect(() => amountSchema.parse(1.5)).toThrow('Amount must be an integer');
      expect(() => amountSchema.parse(1000000000)).toThrow('Amount exceeds maximum');
    });
  });

  describe('currencySchema', () => {
    it('should accept valid currencies', () => {
      expect(currencySchema.parse('usd')).toBe('usd');
      expect(currencySchema.parse('eur')).toBe('eur');
      expect(currencySchema.parse('gbp')).toBe('gbp');
    });

    it('should reject invalid currencies', () => {
      expect(() => currencySchema.parse('btc')).toThrow();
      expect(() => currencySchema.parse('invalid')).toThrow();
    });
  });

  describe('didSchema', () => {
    it('should accept valid DIDs', () => {
      expect(didSchema.parse('did:plc:abc123')).toBe('did:plc:abc123');
      expect(didSchema.parse('did:web:example.com')).toBe('did:web:example.com');
      expect(didSchema.parse('did:exprn:xyz789')).toBe('did:exprn:xyz789');
      expect(didSchema.parse('did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK')).toBe('did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK');
    });

    it('should reject invalid DIDs', () => {
      expect(() => didSchema.parse('not-a-did')).toThrow('Invalid DID format');
      expect(() => didSchema.parse('did:unknown:123')).toThrow('Invalid DID format');
    });
  });

  describe('createAccountSchema', () => {
    it('should accept valid account creation data', () => {
      const validData = {
        handle: 'testuser',
        email: 'test@example.com',
        password: 'SecurePass123',
        displayName: 'Test User',
        accountType: 'personal' as const,
      };

      const result = createAccountSchema.parse(validData);
      expect(result.handle).toBe('testuser');
      expect(result.email).toBe('test@example.com');
    });

    it('should validate nested organization data', () => {
      const orgData = {
        handle: 'companyuser',
        email: 'admin@company.com',
        password: 'SecurePass123',
        accountType: 'organization' as const,
        organizationType: 'enterprise' as const,
        organizationName: 'ACME Corp',
      };

      const result = createAccountSchema.parse(orgData);
      expect(result.organizationType).toBe('enterprise');
      expect(result.organizationName).toBe('ACME Corp');
    });

    it('should reject missing required fields', () => {
      expect(() => createAccountSchema.parse({ handle: 'user' })).toThrow();
      expect(() => createAccountSchema.parse({ email: 'test@example.com' })).toThrow();
    });
  });

  describe('chargeSchema', () => {
    it('should accept valid charge data', () => {
      const validCharge = {
        configId: 'config_123',
        amount: 5000,
        currency: 'usd' as const,
        description: 'Product purchase',
      };

      const result = chargeSchema.parse(validCharge);
      expect(result.amount).toBe(5000);
      expect(result.currency).toBe('usd');
    });

    it('should accept optional fields', () => {
      const minimalCharge = {
        configId: 'config_123',
        amount: 1000,
      };

      const result = chargeSchema.parse(minimalCharge);
      expect(result.currency).toBeUndefined(); // Optional, not provided
    });
  });

  describe('tipSchema', () => {
    it('should accept valid tip data', () => {
      const validTip = {
        recipientDid: 'did:plc:abc123',
        amount: 500, // $5.00
        message: 'Great content!',
      };

      const result = tipSchema.parse(validTip);
      expect(result.amount).toBe(500);
    });

    it('should enforce minimum tip amount', () => {
      const lowTip = {
        recipientDid: 'did:plc:abc123',
        amount: 50, // $0.50 - below minimum
      };

      expect(() => tipSchema.parse(lowTip)).toThrow('Minimum tip is $1.00');
    });
  });

  describe('updateSettingsSchema', () => {
    it('should accept partial settings updates', () => {
      const update = {
        themeId: 'ocean' as const,
        colorMode: 'dark' as const,
      };

      const result = updateSettingsSchema.parse(update);
      expect(result.themeId).toBe('ocean');
      expect(result.colorMode).toBe('dark');
    });

    it('should accept nested settings', () => {
      const update = {
        playback: {
          autoplay: false,
          defaultQuality: 'high' as const,
        },
        privacy: {
          privateAccount: true,
        },
      };

      const result = updateSettingsSchema.parse(update);
      expect(result.playback?.autoplay).toBe(false);
      expect(result.privacy?.privateAccount).toBe(true);
    });

    it('should require at least one field', () => {
      expect(() => updateSettingsSchema.parse({})).toThrow('At least one setting must be provided');
    });

    it('should validate enum values', () => {
      const invalidTheme = {
        themeId: 'invalid-theme',
      };

      expect(() => updateSettingsSchema.parse(invalidTheme)).toThrow();
    });
  });

  describe('type inference', () => {
    it('should provide correct TypeScript types', () => {
      // This test demonstrates type inference at compile time
      const accountData = createAccountSchema.parse({
        handle: 'user',
        email: 'test@example.com',
        password: 'Pass1234',
      });

      // TypeScript knows these fields exist and their types
      const handle: string = accountData.handle;
      const email: string = accountData.email;
      const accountType: 'personal' | 'creator' | 'business' | 'organization' | undefined = accountData.accountType;

      expect(handle).toBe('user');
      expect(email).toBe('test@example.com');
      expect(accountType).toBeUndefined();
    });
  });
});
