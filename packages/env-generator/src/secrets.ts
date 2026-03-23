/**
 * Secret generation utilities for environment files.
 * Zero dependencies — uses Node.js built-in crypto.
 */

import crypto from 'crypto';

export type SecretGenerator =
  | 'hex16'
  | 'hex32'
  | 'hex64'
  | 'base64-32'
  | 'base64url-24'
  | 'prefetch'
  | 'password';

export function generateSecret(type: SecretGenerator): string {
  switch (type) {
    case 'hex16':
      return crypto.randomBytes(16).toString('hex');
    case 'hex32':
      return crypto.randomBytes(32).toString('hex');
    case 'hex64':
      return crypto.randomBytes(64).toString('hex');
    case 'base64-32':
      return crypto.randomBytes(32).toString('base64');
    case 'base64url-24':
      return crypto.randomBytes(24).toString('base64url');
    case 'prefetch':
      return 'exp_' + crypto.randomBytes(24).toString('base64url');
    case 'password':
      return crypto.randomBytes(24).toString('base64url').slice(0, 24);
    default:
      return crypto.randomBytes(32).toString('hex');
  }
}
