/**
 * Production environment defaults
 */

import type { Environment } from '../schema.js';

export const ENVIRONMENT: Environment = 'production';

export const OVERRIDES: Record<string, string> = {
  NODE_ENV: 'production',
  DEV_AUTH_BYPASS: 'false',
  LOG_LEVEL: 'warn',
  SMTP_SECURE: 'true',
  SMTP_PORT: '587',
  BLOB_STORAGE_TYPE: 's3',
  RELAY_ENABLED: 'true',
  FEDERATION_CONSUMER_ENABLED: 'true',
  TLS_ENABLED: 'true',
  CA_AUTO_BOOTSTRAP: 'false',
};
