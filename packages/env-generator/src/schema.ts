/**
 * Unified environment variable schema for the Exprsn platform.
 *
 * Each variable declares its key, description, sensitivity flag,
 * optional auto-generator, and per-environment defaults.
 */

import { z } from 'zod';
import type { SecretGenerator } from './secrets.js';

export interface EnvVarDefinition {
  key: string;
  label: string;
  description: string;
  sensitive?: boolean;
  generator?: SecretGenerator;
  defaults?: {
    development?: string;
    staging?: string;
    production?: string;
  };
}

export interface EnvCategory {
  name: string;
  label: string;
  vars: EnvVarDefinition[];
}

export type Environment = 'development' | 'staging' | 'production';

export const ENV_SCHEMA: EnvCategory[] = [
  {
    name: 'core',
    label: 'Core Server',
    vars: [
      { key: 'NODE_ENV', label: 'Environment', description: 'production / development / staging', defaults: { development: 'development', staging: 'staging', production: 'production' } },
      { key: 'PORT', label: 'API Port', description: 'Port the API server listens on', defaults: { development: '3002', staging: '3002', production: '3002' } },
      { key: 'HOST', label: 'Bind Address', description: 'Host to bind to', defaults: { development: '0.0.0.0', staging: '0.0.0.0', production: '0.0.0.0' } },
      { key: 'APP_URL', label: 'App URL', description: 'Public URL of the application', defaults: { development: 'http://localhost:3002', staging: 'https://staging.exprsn.io', production: 'https://exprsn.io' } },
      { key: 'WEB_URL', label: 'Web URL', description: 'Public URL of the web frontend', defaults: { development: 'http://localhost:3001', staging: 'https://staging.exprsn.io', production: 'https://exprsn.io' } },
      { key: 'CORS_ORIGIN', label: 'CORS Origins', description: 'Comma-separated allowed origins' },
      { key: 'LOG_LEVEL', label: 'Log Level', description: 'debug / info / warn / error', defaults: { development: 'debug', staging: 'info', production: 'warn' } },
    ],
  },
  {
    name: 'platform',
    label: 'Platform',
    vars: [
      { key: 'PLATFORM_NAME', label: 'Platform Name', description: 'Platform display name', defaults: { development: 'Exprsn.io', staging: 'Exprsn.io', production: 'Exprsn.io' } },
      { key: 'PLATFORM_ACCENT_COLOR', label: 'Accent Color', description: 'Primary accent color (hex)', defaults: { development: '#f83b85', staging: '#f83b85', production: '#f83b85' } },
    ],
  },
  {
    name: 'nextjs',
    label: 'Next.js (Web)',
    vars: [
      { key: 'NEXT_PUBLIC_API_URL', label: 'Public API URL', description: 'API URL visible to browser', defaults: { development: 'http://localhost:3002', staging: 'https://api.staging.exprsn.io', production: 'https://api.exprsn.io' } },
      { key: 'NEXT_PUBLIC_APP_URL', label: 'Public App URL', description: 'App URL visible to browser', defaults: { development: 'http://localhost:3001', staging: 'https://staging.exprsn.io', production: 'https://exprsn.io' } },
      { key: 'NEXT_PUBLIC_OAUTH_CLIENT_ID', label: 'OAuth Client ID', description: 'OAuth client metadata URL', defaults: { development: 'https://exprsn.io/client-metadata.json' } },
      { key: 'NEXT_PUBLIC_OAUTH_REDIRECT_URI', label: 'OAuth Redirect URI', description: 'OAuth redirect URI', defaults: { development: 'http://localhost:3001/oauth/callback' } },
    ],
  },
  {
    name: 'database',
    label: 'Database',
    vars: [
      { key: 'DATABASE_URL', label: 'PostgreSQL URL', description: 'postgresql://user:pass@host:5432/db', sensitive: true, defaults: { development: 'postgresql://exprsn:exprsn_dev@localhost:5432/exprsn' } },
    ],
  },
  {
    name: 'redis',
    label: 'Redis',
    vars: [
      { key: 'REDIS_URL', label: 'Redis URL', description: 'Redis connection string', defaults: { development: 'redis://localhost:6379', staging: 'redis://localhost:6379', production: 'redis://localhost:6379' } },
    ],
  },
  {
    name: 'storage',
    label: 'Object Storage',
    vars: [
      { key: 'DO_SPACES_REGION', label: 'DO Region', description: 'DigitalOcean Spaces region', defaults: { development: 'nyc3' } },
      { key: 'DO_SPACES_BUCKET', label: 'DO Bucket', description: 'DO Spaces bucket', defaults: { development: 'exprsn-uploads' } },
      { key: 'DO_SPACES_PROCESSED_BUCKET', label: 'DO Processed Bucket', description: 'DO processed bucket', defaults: { development: 'exprsn-processed' } },
      { key: 'DO_SPACES_KEY', label: 'DO Access Key', description: 'DO Spaces access key', sensitive: true, defaults: { development: 'minioadmin' } },
      { key: 'DO_SPACES_SECRET', label: 'DO Secret Key', description: 'DO Spaces secret key', sensitive: true, defaults: { development: 'minioadmin' } },
      { key: 'DO_SPACES_ENDPOINT', label: 'DO Endpoint', description: 'DO Spaces endpoint', defaults: { development: 'http://localhost:9000' } },
      { key: 'DO_SPACES_CDN', label: 'DO CDN URL', description: 'CDN URL for DO Spaces', defaults: { development: 'http://localhost:9000/exprsn-processed' } },
    ],
  },
  {
    name: 'security',
    label: 'Security',
    vars: [
      { key: 'JWT_SECRET', label: 'JWT Secret', description: 'JWT signing secret', sensitive: true, generator: 'base64-32' },
      { key: 'ENCRYPTION_KEY', label: 'Encryption Key', description: 'AES encryption key', sensitive: true, generator: 'hex32' },
      { key: 'CA_ENCRYPTION_KEY', label: 'CA Encryption Key', description: 'Certificate Authority encryption key', sensitive: true, generator: 'base64-32' },
      { key: 'DEV_AUTH_BYPASS', label: 'Dev Auth Bypass', description: 'Bypass auth in dev (NEVER in prod)', defaults: { development: 'true', staging: 'false', production: 'false' } },
    ],
  },
  {
    name: 'pds',
    label: 'PDS / AT Protocol',
    vars: [
      { key: 'PDS_ENABLED', label: 'PDS Enabled', description: 'Enable Personal Data Server', defaults: { development: 'true', staging: 'true', production: 'true' } },
      { key: 'PDS_DOMAIN', label: 'PDS Domain', description: 'PDS domain name', defaults: { development: 'localhost:3002' } },
      { key: 'PDS_DID_METHOD', label: 'DID Method', description: 'DID method to use', defaults: { development: 'did:exprsn' } },
      { key: 'BLOB_STORAGE_TYPE', label: 'Blob Storage Type', description: 'local / s3', defaults: { development: 'local', staging: 's3', production: 's3' } },
      { key: 'BLOB_STORAGE_PATH', label: 'Blob Storage Path', description: 'Path for local blob storage', defaults: { development: './data/blobs' } },
    ],
  },
  {
    name: 'federation',
    label: 'Federation',
    vars: [
      { key: 'RELAY_ENABLED', label: 'Relay Enabled', description: 'Enable firehose relay', defaults: { development: 'false', staging: 'true', production: 'true' } },
      { key: 'FEDERATION_CONSUMER_ENABLED', label: 'Consumer Enabled', description: 'Enable federation consumer', defaults: { development: 'false', staging: 'true', production: 'true' } },
      { key: 'SERVICE_DOMAIN', label: 'Service Domain', description: 'Platform domain', defaults: { development: 'localhost:3002' } },
      { key: 'SERVICE_DID', label: 'Service DID', description: 'Platform service DID', defaults: { development: 'did:web:localhost:3002' } },
      { key: 'PLC_URL', label: 'PLC URL', description: 'PLC directory URL', defaults: { development: 'https://plc.directory' } },
    ],
  },
  {
    name: 'email',
    label: 'Email / SMTP',
    vars: [
      { key: 'SMTP_HOST', label: 'SMTP Host', description: 'SMTP server hostname', defaults: { development: 'localhost', staging: 'localhost', production: 'localhost' } },
      { key: 'SMTP_PORT', label: 'SMTP Port', description: 'SMTP server port', defaults: { development: '1025', staging: '587', production: '587' } },
      { key: 'SMTP_SECURE', label: 'SMTP TLS', description: 'Use TLS for SMTP', defaults: { development: 'false', staging: 'true', production: 'true' } },
      { key: 'SMTP_USER', label: 'SMTP User', description: 'SMTP username', sensitive: true },
      { key: 'SMTP_PASSWORD', label: 'SMTP Password', description: 'SMTP password', sensitive: true },
      { key: 'EMAIL_FROM', label: 'From Address', description: 'Sender email address', defaults: { development: 'noreply@exprsn.io', staging: 'noreply@exprsn.io', production: 'noreply@exprsn.io' } },
    ],
  },
  {
    name: 'prefetch',
    label: 'Prefetch / Caching',
    vars: [
      { key: 'PREFETCH_ENABLED', label: 'Prefetch Enabled', description: 'Enable prefetch engine', defaults: { development: 'true', staging: 'true', production: 'true' } },
      { key: 'PREFETCH_PRODUCER_ENABLED', label: 'Producer Enabled', description: 'Enable prefetch producer', defaults: { development: 'true', staging: 'true', production: 'true' } },
      { key: 'PREFETCH_AUTH_TOKEN', label: 'Auth Token', description: 'Prefetch worker token', sensitive: true, generator: 'prefetch' },
      { key: 'PREFETCH_CONCURRENCY', label: 'Concurrency', description: 'Prefetch concurrency', defaults: { development: '50', staging: '50', production: '50' } },
    ],
  },
  {
    name: 'video',
    label: 'Video Processing',
    vars: [
      { key: 'FFMPEG_SERVICE_TYPE', label: 'FFmpeg Service Type', description: 'FFmpeg service type', defaults: { development: 'local' } },
      { key: 'FFMPEG_PATH', label: 'FFmpeg Path', description: 'Path to ffmpeg binary', defaults: { development: '/usr/local/bin/ffmpeg' } },
      { key: 'FFPROBE_PATH', label: 'FFprobe Path', description: 'Path to ffprobe binary', defaults: { development: '/usr/local/bin/ffprobe' } },
      { key: 'VIDEO_PRESETS', label: 'Video Presets', description: 'Transcoding presets', defaults: { development: '360p,480p,720p,1080p' } },
      { key: 'RENDER_ENABLED', label: 'Render Enabled', description: 'Enable render pipeline', defaults: { development: 'true', staging: 'true', production: 'true' } },
      { key: 'TRANSCODE_WORKER_ENABLED', label: 'Transcode Worker', description: 'Enable transcode worker', defaults: { development: 'true', staging: 'true', production: 'true' } },
      { key: 'WORKER_CONCURRENCY', label: 'Worker Concurrency', description: 'General worker concurrency', defaults: { development: '2', staging: '4', production: '4' } },
    ],
  },
  {
    name: 'oauth',
    label: 'OAuth',
    vars: [
      { key: 'OAUTH_CLIENT_ID', label: 'OAuth Client ID', description: 'OAuth client metadata URL', defaults: { development: 'https://exprsn.io/client-metadata.json' } },
      { key: 'OAUTH_ISSUER', label: 'OAuth Issuer', description: 'OAuth issuer URL', defaults: { development: 'http://localhost:3002' } },
    ],
  },
  {
    name: 'tls',
    label: 'TLS / Certificates',
    vars: [
      { key: 'TLS_ENABLED', label: 'TLS Enabled', description: 'Enable TLS on Hono server', defaults: { development: 'false', staging: 'true', production: 'true' } },
      { key: 'TLS_CERT_PATH', label: 'TLS Cert Path', description: 'Path to TLS fullchain.pem', defaults: { development: 'deploy/nginx/ssl/fullchain.pem' } },
      { key: 'TLS_KEY_PATH', label: 'TLS Key Path', description: 'Path to TLS privkey.pem', defaults: { development: 'deploy/nginx/ssl/privkey.pem' } },
      { key: 'CA_AUTO_BOOTSTRAP', label: 'CA Auto-Bootstrap', description: 'Auto-generate certificate chain on startup', defaults: { development: 'true', staging: 'true', production: 'false' } },
    ],
  },
  {
    name: 'env',
    label: 'Environment Selection',
    vars: [
      { key: 'EXPRSN_ENV', label: 'Exprsn Environment', description: 'Environment name for .env file selection', defaults: { development: 'development', staging: 'staging', production: 'production' } },
    ],
  },
  {
    name: 'docker',
    label: 'Docker Service Credentials',
    vars: [
      { key: 'POSTGRES_USER', label: 'Postgres User', description: 'PostgreSQL username', defaults: { development: 'exprsn' } },
      { key: 'POSTGRES_PASSWORD', label: 'Postgres Password', description: 'PostgreSQL password', sensitive: true, generator: 'password' },
      { key: 'MINIO_ROOT_USER', label: 'MinIO User', description: 'MinIO root user', defaults: { development: 'minioadmin' } },
      { key: 'MINIO_ROOT_PASSWORD', label: 'MinIO Password', description: 'MinIO root password', sensitive: true, generator: 'password' },
      { key: 'OPENSEARCH_INITIAL_ADMIN_PASSWORD', label: 'OpenSearch Password', description: 'OpenSearch admin password', sensitive: true, generator: 'password' },
    ],
  },
  {
    name: 'payments',
    label: 'Payments',
    vars: [
      { key: 'STRIPE_SECRET_KEY', label: 'Stripe Secret', description: 'Stripe secret key', sensitive: true },
      { key: 'STRIPE_WEBHOOK_SECRET', label: 'Stripe Webhook', description: 'Stripe webhook secret', sensitive: true },
    ],
  },
  {
    name: 'monitoring',
    label: 'Monitoring',
    vars: [
      { key: 'OPENSEARCH_URL', label: 'OpenSearch URL', description: 'OpenSearch endpoint', defaults: { development: 'http://localhost:9200' } },
      { key: 'RABBITMQ_URL', label: 'RabbitMQ URL', description: 'RabbitMQ connection string', defaults: { development: 'amqp://guest:guest@localhost:5672' } },
    ],
  },
];

/**
 * Zod validation schema for environment — validates required vars per environment.
 */
export function createEnvValidationSchema(env: Environment) {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const cat of ENV_SCHEMA) {
    for (const v of cat.vars) {
      if (v.sensitive && !v.generator && env === 'production') {
        // Sensitive vars without generators must be set in production
        shape[v.key] = z.string().min(1, `${v.key} is required in production`);
      } else {
        shape[v.key] = z.string().optional();
      }
    }
  }

  return z.object(shape).passthrough();
}
