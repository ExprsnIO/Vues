import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { encrypt, decrypt, encryptCredentials, decryptCredentials, isEncrypted, canDecrypt } from '../encryption.js';

// Generate a deterministic-but-not-hardcoded test key from the test suite name.
// This avoids committing real-looking secrets while remaining reproducible.
const TEST_KEY = crypto.createHash('sha256').update('exprsn-encryption-test-suite').digest('hex');

describe('Encryption Utility', () => {
  beforeAll(() => {
    process.env.ENCRYPTION_KEY = TEST_KEY;
  });

  describe('encrypt/decrypt', () => {
    it('should encrypt and decrypt text correctly', () => {
      const plaintext = 'test-plaintext-value';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should produce different ciphertexts for the same plaintext', () => {
      const plaintext = 'same-text';
      const encrypted1 = encrypt(plaintext);
      const encrypted2 = encrypt(plaintext);

      // Should be different due to random IV and salt
      expect(encrypted1).not.toBe(encrypted2);

      // But both should decrypt to the same plaintext
      expect(decrypt(encrypted1)).toBe(plaintext);
      expect(decrypt(encrypted2)).toBe(plaintext);
    });

    it('should have version prefix in encrypted text', () => {
      const plaintext = 'test';
      const encrypted = encrypt(plaintext);

      expect(encrypted).toMatch(/^v\d+:/);
      expect(encrypted.split(':')).toHaveLength(5);
    });

    it('should throw error when decrypting with wrong key', () => {
      const plaintext = 'secret';
      const encrypted = encrypt(plaintext);

      // Change the encryption key
      process.env.ENCRYPTION_KEY = crypto.createHash('sha256').update('different-test-key').digest('hex');

      expect(() => decrypt(encrypted)).toThrow();

      // Restore original key
      process.env.ENCRYPTION_KEY = TEST_KEY;
    });

    it('should throw error when encrypting empty string', () => {
      expect(() => encrypt('')).toThrow('Cannot encrypt empty plaintext');
    });

    it('should throw error when decrypting empty string', () => {
      expect(() => decrypt('')).toThrow('Cannot decrypt empty ciphertext');
    });

    it('should throw error when decrypting invalid format', () => {
      expect(() => decrypt('invalid-format')).toThrow('Invalid encrypted data format');
    });

    it('should handle unicode characters', () => {
      const plaintext = 'Hello 世界 🌍';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle long text', () => {
      const plaintext = 'a'.repeat(10000);
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
      expect(decrypted.length).toBe(10000);
    });
  });

  describe('encryptCredentials/decryptCredentials', () => {
    it('should encrypt and decrypt credential objects', () => {
      const credentials = {
        apiKey: 'test-api-key',
        secret: 'test-webhook-secret',
        clientId: 'test-client-id',
      };

      const encrypted = encryptCredentials(credentials);
      const decrypted = decryptCredentials(encrypted);

      expect(decrypted).toEqual(credentials);
    });

    it('should encrypt each credential separately', () => {
      const credentials = {
        key1: 'value1',
        key2: 'value2',
      };

      const encrypted = encryptCredentials(credentials);

      // Each value should be encrypted differently
      expect(encrypted.key1).not.toBe(encrypted.key2);
      expect(encrypted.key1).not.toBe(credentials.key1);
      expect(encrypted.key2).not.toBe(credentials.key2);
    });

    it('should skip empty values', () => {
      const credentials = {
        key1: 'value1',
        key2: '',
        key3: 'value3',
      };

      const encrypted = encryptCredentials(credentials);

      expect(encrypted).toHaveProperty('key1');
      expect(encrypted).not.toHaveProperty('key2');
      expect(encrypted).toHaveProperty('key3');
    });

    it('should handle empty object', () => {
      const credentials = {};
      const encrypted = encryptCredentials(credentials);
      const decrypted = decryptCredentials(encrypted);

      expect(decrypted).toEqual({});
    });

    it('should preserve keys when encrypting', () => {
      const credentials = {
        stripe_key: 'test-stripe-key',
        webhook_secret: 'test-webhook-secret',
      };

      const encrypted = encryptCredentials(credentials);

      expect(Object.keys(encrypted)).toEqual(Object.keys(credentials));
    });

    it('should throw error if any credential fails to decrypt', () => {
      const credentials = {
        key1: 'value1',
        key2: 'value2',
      };

      const encrypted = encryptCredentials(credentials);

      // Corrupt one value
      encrypted.key2 = 'v1:corrupted:data:here:test';

      expect(() => decryptCredentials(encrypted)).toThrow('Failed to decrypt credentials');
    });
  });

  describe('isEncrypted', () => {
    it('should detect encrypted credentials', () => {
      const credentials = {
        apiKey: 'test-api-key',
        secret: 'test-secret-value',
      };

      const encrypted = encryptCredentials(credentials);

      expect(isEncrypted(encrypted)).toBe(true);
    });

    it('should detect unencrypted credentials', () => {
      const credentials = {
        apiKey: 'test-api-key',
        secret: 'test-secret-value',
      };

      expect(isEncrypted(credentials)).toBe(false);
    });

    it('should return false for empty object', () => {
      expect(isEncrypted({})).toBe(false);
    });

    it('should detect mixed encrypted/unencrypted as encrypted', () => {
      const credentials = {
        apiKey: encrypt('test'),
        plainKey: 'plaintext',
      };

      // If any value is encrypted, considers the whole object encrypted
      expect(isEncrypted(credentials)).toBe(true);
    });
  });

  describe('canDecrypt', () => {
    it('should return true for valid encrypted credentials', () => {
      const credentials = {
        apiKey: 'test-key',
      };

      const encrypted = encryptCredentials(credentials);

      expect(canDecrypt(encrypted)).toBe(true);
    });

    it('should return false for corrupted credentials', () => {
      const credentials = {
        apiKey: 'v1:invalid:encrypted:data:here',
      };

      expect(canDecrypt(credentials)).toBe(false);
    });

    it('should return false for unencrypted credentials', () => {
      const credentials = {
        apiKey: 'plain-text-key',
      };

      // Unencrypted credentials will fail to decrypt (wrong format)
      expect(canDecrypt(credentials)).toBe(false);
    });
  });

  describe('key requirements', () => {
    it('should throw error if encryption key is too short in production', () => {
      const originalEnv = process.env.NODE_ENV;
      const originalKey = process.env.ENCRYPTION_KEY;

      try {
        process.env.NODE_ENV = 'production';
        process.env.ENCRYPTION_KEY = 'short';

        expect(() => encrypt('test')).toThrow('ENCRYPTION_KEY must be at least 32 characters long');
      } finally {
        // Restore - use finally to ensure cleanup even if test fails
        process.env.NODE_ENV = originalEnv;
        process.env.ENCRYPTION_KEY = originalKey!;
      }
    });

    it('should throw error if encryption key is not set in production', () => {
      const originalEnv = process.env.NODE_ENV;
      const originalKey = process.env.ENCRYPTION_KEY;

      try {
        process.env.NODE_ENV = 'production';
        delete process.env.ENCRYPTION_KEY;

        expect(() => encrypt('test')).toThrow('CRITICAL: ENCRYPTION_KEY environment variable is required');
      } finally {
        // Restore - use finally to ensure cleanup even if test fails
        process.env.NODE_ENV = originalEnv;
        process.env.ENCRYPTION_KEY = originalKey!;
      }
    });
  });

  describe('real-world scenarios', () => {
    beforeAll(() => {
      process.env.ENCRYPTION_KEY = TEST_KEY;
    });

    it('should handle Stripe-like credentials', () => {
      const credentials = {
        secretKey: 'test-secret-key-' + crypto.randomBytes(16).toString('hex'),
        publishableKey: 'test-pub-key-' + crypto.randomBytes(16).toString('hex'),
        webhookSecret: 'test-webhook-' + crypto.randomBytes(16).toString('hex'),
      };

      const encrypted = encryptCredentials(credentials);
      const decrypted = decryptCredentials(encrypted);

      expect(decrypted).toEqual(credentials);
    });

    it('should handle PayPal-like credentials', () => {
      const credentials = {
        clientId: 'test-client-' + crypto.randomBytes(20).toString('hex'),
        clientSecret: 'test-secret-' + crypto.randomBytes(20).toString('hex'),
        webhookId: 'test-webhook-' + crypto.randomBytes(10).toString('hex'),
      };

      const encrypted = encryptCredentials(credentials);
      const decrypted = decryptCredentials(encrypted);

      expect(decrypted).toEqual(credentials);
    });

    it('should handle payment gateway credentials', () => {
      const credentials = {
        apiLoginId: 'test-login-' + crypto.randomBytes(6).toString('hex'),
        transactionKey: 'test-txn-' + crypto.randomBytes(10).toString('hex'),
        signatureKey: 'test-sig-' + crypto.randomBytes(32).toString('hex'),
      };

      const encrypted = encryptCredentials(credentials);
      const decrypted = decryptCredentials(encrypted);

      expect(decrypted).toEqual(credentials);
    });
  });
});
