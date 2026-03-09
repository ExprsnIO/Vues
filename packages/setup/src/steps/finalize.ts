/**
 * Finalization step
 *
 * Completes the setup process and marks the installation as ready.
 */

import { db } from '@exprsn/api/db';
import { systemConfig, setupState } from '@exprsn/api/db';
import { eq } from 'drizzle-orm';
import { updateSetupState, SETUP_STEPS } from '../state.js';

export interface FinalizeResult {
  success: boolean;
  message: string;
  redirectUrl: string;
  summary: {
    certificatesInitialized: boolean;
    adminCreated: boolean;
    servicesConfigured: boolean;
    completedAt: Date;
  };
  error?: string;
}

export interface FinalizeOptions {
  adminDid?: string;
}

/**
 * Finalize the setup process
 */
export async function finalizeSetup(options?: FinalizeOptions): Promise<FinalizeResult> {
  try {
    // Verify all previous steps are completed
    const [state] = await db
      .select()
      .from(setupState)
      .where(eq(setupState.id, 'singleton'))
      .limit(1);

    if (!state) {
      return {
        success: false,
        message: 'Setup state not found',
        redirectUrl: '/first-run',
        summary: {
          certificatesInitialized: false,
          adminCreated: false,
          servicesConfigured: false,
          completedAt: new Date(),
        },
        error: 'Setup has not been started',
      };
    }

    const completedSteps = (state.completedSteps as string[]) || [];
    const requiredSteps = ['prerequisites', 'certificates', 'admin', 'services'];
    const missingSteps = requiredSteps.filter((step) => !completedSteps.includes(step));

    if (missingSteps.length > 0) {
      return {
        success: false,
        message: `Missing required steps: ${missingSteps.join(', ')}`,
        redirectUrl: '/first-run',
        summary: {
          certificatesInitialized: completedSteps.includes('certificates'),
          adminCreated: completedSteps.includes('admin'),
          servicesConfigured: completedSteps.includes('services'),
          completedAt: new Date(),
        },
        error: 'Not all required steps have been completed',
      };
    }

    // Mark setup as complete
    const now = new Date();
    await updateSetupState({
      status: 'completed',
      currentStep: SETUP_STEPS.length - 1,
      completedSteps: [...completedSteps, 'finalize'],
      completedAt: now,
      completedBy: options?.adminDid || null,
    });

    // Set system initialization timestamp
    await db
      .insert(systemConfig)
      .values({
        key: 'system.initialized_at',
        value: { timestamp: now.toISOString() },
        description: 'System initialization timestamp',
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: systemConfig.key,
        set: {
          value: { timestamp: now.toISOString() },
          updatedAt: now,
        },
      });

    // Set setup version
    await db
      .insert(systemConfig)
      .values({
        key: 'system.setup_version',
        value: { version: '1.0.0' },
        description: 'Setup wizard version used for installation',
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: systemConfig.key,
        set: {
          value: { version: '1.0.0' },
          updatedAt: now,
        },
      });

    return {
      success: true,
      message: 'Setup completed successfully',
      redirectUrl: '/admin',
      summary: {
        certificatesInitialized: true,
        adminCreated: true,
        servicesConfigured: true,
        completedAt: now,
      },
    };
  } catch (error) {
    return {
      success: false,
      message: 'Failed to finalize setup',
      redirectUrl: '/first-run',
      summary: {
        certificatesInitialized: false,
        adminCreated: false,
        servicesConfigured: false,
        completedAt: new Date(),
      },
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check if the system has been initialized
 */
export async function isSystemInitialized(): Promise<boolean> {
  const [config] = await db
    .select()
    .from(systemConfig)
    .where(eq(systemConfig.key, 'system.initialized_at'))
    .limit(1);

  return !!config;
}

/**
 * Get system initialization info
 */
export async function getSystemInfo(): Promise<{
  initialized: boolean;
  initializedAt?: Date;
  setupVersion?: string;
}> {
  const [initConfig] = await db
    .select()
    .from(systemConfig)
    .where(eq(systemConfig.key, 'system.initialized_at'))
    .limit(1);

  const [versionConfig] = await db
    .select()
    .from(systemConfig)
    .where(eq(systemConfig.key, 'system.setup_version'))
    .limit(1);

  if (!initConfig) {
    return { initialized: false };
  }

  const initValue = initConfig.value as { timestamp: string };
  const versionValue = versionConfig?.value as { version: string } | undefined;

  return {
    initialized: true,
    initializedAt: new Date(initValue.timestamp),
    setupVersion: versionValue?.version,
  };
}
