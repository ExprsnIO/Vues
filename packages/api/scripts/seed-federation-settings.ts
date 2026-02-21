/**
 * Seed Federation and Caching Admin Settings
 *
 * This script populates the systemConfig table with federation and caching settings
 * that can be managed through the admin panel.
 */

import { db } from '../src/db/index.js';
import { systemConfig } from '../src/db/schema.js';

interface FederationSettings {
  enabled: boolean;
  relay: {
    enabled: boolean;
    maxBackfill: number;
    heartbeatIntervalMs: number;
  };
  didResolution: {
    plcUrl: string;
    cacheTtlSeconds: number;
    staleTtlSeconds: number;
    maxConcurrentResolutions: number;
  };
  serviceDiscovery: {
    enabled: boolean;
    healthCheckIntervalMs: number;
    healthCheckTimeoutMs: number;
    maxHealthCheckFailures: number;
  };
  contentSync: {
    enabled: boolean;
    pullIntervalMs: number;
    pushEnabled: boolean;
    maxRecordsPerSync: number;
    retryAttempts: number;
  };
  federatedSearch: {
    enabled: boolean;
    timeoutMs: number;
    maxResultsPerServer: number;
    deduplicateByUri: boolean;
  };
}

interface CacheSettings {
  enabled: boolean;
  provider: 'redis' | 'memory';
  redis: {
    url: string;
    keyPrefix: string;
    maxRetries: number;
  };
  ttls: {
    did: number;
    profile: number;
    feed: number;
    trending: number;
    search: number;
    serviceRegistry: number;
  };
  limits: {
    maxCacheSize: number;
    maxKeyLength: number;
    maxValueSize: number;
  };
}

interface ServiceAuthSettings {
  enabled: boolean;
  timestampWindowMs: number;
  nonceExpiryMs: number;
  requireCertificateChain: boolean;
  allowedIssuers: string[];
}

const defaultFederationSettings: FederationSettings = {
  enabled: true,
  relay: {
    enabled: true,
    maxBackfill: 10000,
    heartbeatIntervalMs: 30000,
  },
  didResolution: {
    plcUrl: 'https://plc.directory',
    cacheTtlSeconds: 3600,
    staleTtlSeconds: 86400,
    maxConcurrentResolutions: 10,
  },
  serviceDiscovery: {
    enabled: true,
    healthCheckIntervalMs: 60000,
    healthCheckTimeoutMs: 5000,
    maxHealthCheckFailures: 3,
  },
  contentSync: {
    enabled: true,
    pullIntervalMs: 300000, // 5 minutes
    pushEnabled: false,
    maxRecordsPerSync: 100,
    retryAttempts: 3,
  },
  federatedSearch: {
    enabled: true,
    timeoutMs: 5000,
    maxResultsPerServer: 50,
    deduplicateByUri: true,
  },
};

const defaultCacheSettings: CacheSettings = {
  enabled: true,
  provider: 'redis',
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    keyPrefix: 'exprsn:',
    maxRetries: 3,
  },
  ttls: {
    did: 3600,        // 1 hour
    profile: 300,      // 5 minutes
    feed: 60,          // 1 minute
    trending: 300,     // 5 minutes
    search: 120,       // 2 minutes
    serviceRegistry: 300, // 5 minutes
  },
  limits: {
    maxCacheSize: 1073741824, // 1GB
    maxKeyLength: 1024,
    maxValueSize: 10485760,   // 10MB
  },
};

const defaultServiceAuthSettings: ServiceAuthSettings = {
  enabled: true,
  timestampWindowMs: 300000, // 5 minutes
  nonceExpiryMs: 600000,     // 10 minutes
  requireCertificateChain: true,
  allowedIssuers: [],
};

async function seedFederationSettings() {
  console.log('Seeding federation and caching admin settings...\n');

  const settings = [
    {
      key: 'federation',
      value: defaultFederationSettings,
      description: 'Federation settings for AT Protocol and Exprsn federation',
    },
    {
      key: 'cache',
      value: defaultCacheSettings,
      description: 'Caching configuration for Redis and in-memory caching',
    },
    {
      key: 'serviceAuth',
      value: defaultServiceAuthSettings,
      description: 'Service-to-service authentication using CA certificates',
    },
    {
      key: 'relaySubscribers',
      value: {
        maxSubscribers: 1000,
        defaultWantedCollections: [
          'io.exprsn.feed.video',
          'io.exprsn.feed.like',
          'io.exprsn.feed.comment',
          'io.exprsn.graph.follow',
        ],
        rateLimit: {
          messagesPerSecond: 100,
          burstSize: 500,
        },
      },
      description: 'Configuration for relay firehose subscribers',
    },
    {
      key: 'didCache',
      value: {
        cleanupIntervalMs: 3600000, // 1 hour
        maxEntries: 100000,
        staleWhileRevalidate: true,
        backgroundRefresh: true,
      },
      description: 'DID document caching configuration',
    },
    {
      key: 'serviceRegistry',
      value: {
        autoDiscovery: false,
        trustedRelays: [],
        trustedAppviews: [],
        blockedServices: [],
      },
      description: 'Service registry and discovery configuration',
    },
    {
      key: 'contentSyncSchedule',
      value: {
        enabled: false,
        collections: [
          'io.exprsn.feed.video',
          'io.exprsn.actor.profile',
        ],
        syncFromRelays: [],
        syncIntervalMs: 300000,
        lastFullSync: null,
      },
      description: 'Scheduled content synchronization settings',
    },
  ];

  for (const setting of settings) {
    try {
      await db
        .insert(systemConfig)
        .values({
          key: setting.key,
          value: setting.value,
          description: setting.description,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: systemConfig.key,
          set: {
            value: setting.value,
            description: setting.description,
            updatedAt: new Date(),
          },
        });

      console.log(`✓ Seeded setting: ${setting.key}`);
    } catch (error) {
      console.error(`✗ Failed to seed ${setting.key}:`, error);
    }
  }

  console.log('\nFederation and caching settings seeded successfully!');
  console.log('\nSettings can be managed via:');
  console.log('  - Admin Panel: /admin/settings/federation');
  console.log('  - API: POST /xrpc/io.exprsn.admin.setConfig');
  console.log('  - API: GET /xrpc/io.exprsn.admin.getConfig?key=federation');
}

// Run the seed
seedFederationSettings()
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Failed to seed settings:', error);
    process.exit(1);
  });
