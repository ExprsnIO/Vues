/**
 * Service configuration step
 *
 * Allows enabling/disabling platform services during setup.
 */

import { db } from '@exprsn/api/db';
import { systemConfig } from '@exprsn/api/db';
import { eq } from 'drizzle-orm';

export interface ServiceConfig {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  default: boolean;
  requiresConfig?: string[];
}

export interface ServicesResult {
  success: boolean;
  services: ServiceConfig[];
  error?: string;
}

/**
 * Available services that can be configured
 */
export const AVAILABLE_SERVICES: ServiceConfig[] = [
  {
    id: 'federation',
    name: 'AT Protocol Federation',
    description: 'Enable federation with other ATProto services',
    enabled: true,
    default: true,
  },
  {
    id: 'studio',
    name: 'Video Studio',
    description: 'Video editing and creation tools',
    enabled: true,
    default: true,
  },
  {
    id: 'render_pipeline',
    name: 'Render Pipeline',
    description: 'Server-side video rendering (requires render worker)',
    enabled: false,
    default: false,
    requiresConfig: ['REDIS_URL'],
  },
  {
    id: 'spark_messaging',
    name: 'Spark Messaging',
    description: 'Real-time direct messaging',
    enabled: true,
    default: true,
  },
  {
    id: 'ai_moderation',
    name: 'AI Moderation',
    description: 'Automated content moderation using AI',
    enabled: false,
    default: false,
    requiresConfig: ['MODERATION_API_KEY'],
  },
  {
    id: 'email_notifications',
    name: 'Email Notifications',
    description: 'Send email notifications to users',
    enabled: false,
    default: false,
    requiresConfig: ['SMTP_HOST', 'SMTP_USER'],
  },
  {
    id: 'live_streaming',
    name: 'Live Streaming',
    description: 'Real-time video streaming (requires IVS)',
    enabled: false,
    default: false,
    requiresConfig: ['AWS_IVS_CHANNEL_ARN'],
  },
  {
    id: 'analytics',
    name: 'Analytics',
    description: 'User and content analytics tracking',
    enabled: true,
    default: true,
  },
];

/**
 * Get current service configuration
 */
export async function getServicesConfig(): Promise<ServiceConfig[]> {
  const services = [...AVAILABLE_SERVICES];

  // Load saved configuration
  const [savedConfig] = await db
    .select()
    .from(systemConfig)
    .where(eq(systemConfig.key, 'services'))
    .limit(1);

  if (savedConfig?.value) {
    const enabledServices = savedConfig.value as Record<string, boolean>;
    for (const service of services) {
      if (service.id in enabledServices) {
        service.enabled = enabledServices[service.id] ?? service.default;
      }
    }
  }

  return services;
}

/**
 * Configure services
 */
export async function configureServices(
  serviceConfig: Record<string, boolean>
): Promise<ServicesResult> {
  try {
    // Validate service IDs
    const validIds = AVAILABLE_SERVICES.map((s) => s.id);
    const invalidIds = Object.keys(serviceConfig).filter((id) => !validIds.includes(id));

    if (invalidIds.length > 0) {
      return {
        success: false,
        services: [],
        error: `Invalid service IDs: ${invalidIds.join(', ')}`,
      };
    }

    // Check for missing required configuration
    const missingConfig: string[] = [];
    for (const [serviceId, enabled] of Object.entries(serviceConfig)) {
      if (enabled) {
        const service = AVAILABLE_SERVICES.find((s) => s.id === serviceId);
        if (service?.requiresConfig) {
          for (const configKey of service.requiresConfig) {
            if (!process.env[configKey]) {
              missingConfig.push(`${service.name} requires ${configKey}`);
            }
          }
        }
      }
    }

    if (missingConfig.length > 0) {
      return {
        success: false,
        services: [],
        error: `Missing configuration: ${missingConfig.join('; ')}`,
      };
    }

    // Build final config with defaults
    const finalConfig: Record<string, boolean> = {};
    for (const service of AVAILABLE_SERVICES) {
      finalConfig[service.id] = serviceConfig[service.id] ?? service.default;
    }

    // Save configuration
    await db
      .insert(systemConfig)
      .values({
        key: 'services',
        value: finalConfig,
        description: 'Enabled/disabled platform services',
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: systemConfig.key,
        set: {
          value: finalConfig,
          updatedAt: new Date(),
        },
      });

    // Return updated service list
    const services: ServiceConfig[] = AVAILABLE_SERVICES.map((s) => ({
      ...s,
      enabled: finalConfig[s.id] ?? s.default,
    }));

    return {
      success: true,
      services,
    };
  } catch (error) {
    return {
      success: false,
      services: [],
      error: error instanceof Error ? error.message : 'Failed to configure services',
    };
  }
}

/**
 * Check if a specific service is enabled
 */
export async function isServiceEnabled(serviceId: string): Promise<boolean> {
  const services = await getServicesConfig();
  const service = services.find((s) => s.id === serviceId);
  return service?.enabled ?? false;
}
