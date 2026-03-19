import { describe, it, expect, beforeAll } from 'vitest';
import { encrypt, decrypt, encryptCredentials, decryptCredentials, isEncrypted, canDecrypt } from '../encryption.js';

describe('Encryption Utility', () => {
  beforeAll(() => {
    // Set a test encryption key
    process.env.ENCRYPTION_KEY = 'test-encryption-key-for-unit-tests-minimum-32-chars';
  });

  describe('encrypt/decrypt', () => {
    it('should encrypt and decrypt text correctly', () => {
      const plaintext = 'my-secret-api-key-12345';
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
      process.env.ENCRYPTION_KEY = 'different-key-that-is-at-least-32-characters-long';

      expect(() => decrypt(encrypted)).toThrow();

      // Restore original key
      process.env.ENCRYPTION_KEY = 'test-encryption-key-for-unit-tests-minimum-32-chars';
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
        apiKey: 'sk_test_12345',
        secret: 'whsec_abcdef',
        clientId: 'client_xyz',
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
        stripe_key: 'sk_test',
        webhook_secret: 'whsec_test',
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
        apiKey: 'sk_test_12345',
        secret: 'secret_value',
      };

      const encrypted = encryptCredentials(credentials);

      expect(isEncrypted(encrypted)).toBe(true);
    });

    it('should detect unencrypted credentials', () => {
      const credentials = {
        apiKey: 'sk_test_12345',
        secret: 'secret_value',
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
        apiKey: 'test_key',
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
        apiKey: 'plain_text_key',
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
    // Ensure ENCRYPTION_KEY is set for these tests
    beforeAll(() => {
      process.env.ENCRYPTION_KEY = 'test-encryption-key-for-unit-tests-minimum-32-chars';
    });
    it('should handle Stripe credentials', () => {
      const credentials = {
        secretKey: 'sk_test_51234567890abcdefghijklmnop',
        publishableKey: 'pk_test_51234567890abcdefghijklmnop',
        webhookSecret: 'whsec_1234567890abcdefghijklmnop',
      };

      const encrypted = encryptCredentials(credentials);
      const decrypted = decryptCredentials(encrypted);

      expect(decrypted).toEqual(credentials);
    });

    it('should handle PayPal credentials', () => {
      const credentials = {
        clientId: 'AeB1234567890abcdefghijklmnopqrstuvwxyz',
        clientSecret: 'EFG1234567890abcdefghijklmnopqrstuvwxyz',
        webhookId: 'WH-12345678AB-12345678CD',
      };

      const encrypted = encryptCredentials(credentials);
      const decrypted = decryptCredentials(encrypted);

      expect(decrypted).toEqual(credentials);
    });

    it('should handle Authorize.Net credentials', () => {
      const credentials = {
        apiLoginId: '1234567890AB',
        transactionKey: '1234567890abcdefghij',
        signatureKey: 'ABCD1234567890EFGH1234567890IJKL1234567890MNOP1234567890QRST1234567890',
      };

      const encrypted = encryptCredentials(credentials);
      const decrypted = decryptCredentials(encrypted);

      expect(decrypted).toEqual(credentials);
    });
  });
});
