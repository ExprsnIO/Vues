/**
 * Development environment defaults
 */

import type { Environment } from '../schema.js';

export const ENVIRONMENT: Environment = 'development';

export const OVERRIDES: Record<string, string> = {
  NODE_ENV: 'development',
  DEV_AUTH_BYPASS: 'true',
  LOG_LEVEL: 'debug',
  SMTP_PORT: '1025',
  SMTP_SECURE: 'false',
  BLOB_STORAGE_TYPE: 'local',
  RELAY_ENABLED: 'false',
  FEDERATION_CONSUMER_ENABLED: 'false',
};
