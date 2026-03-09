/**
 * Setup state management
 */

import { db } from '@exprsn/api/db';
import { setupState } from '@exprsn/api/db';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export interface SetupState {
  id: string;
  status: 'pending' | 'in_progress' | 'completed';
  currentStep: number;
  completedSteps: string[];
  setupToken: string | null;
  tokenExpiresAt: Date | null;
  completedAt: Date | null;
  completedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface StepConfig {
  id: string;
  title: string;
  description: string;
  icon: string;
}

export const SETUP_STEPS: StepConfig[] = [
  {
    id: 'prerequisites',
    title: 'Prerequisites',
    description: 'Check system requirements and connectivity',
    icon: 'check-circle',
  },
  {
    id: 'certificates',
    title: 'Certificate Authority',
    description: 'Initialize root and intermediate certificates',
    icon: 'shield',
  },
  {
    id: 'admin',
    title: 'Admin User',
    description: 'Create the first administrator account',
    icon: 'user',
  },
  {
    id: 'services',
    title: 'Services',
    description: 'Enable or disable platform features',
    icon: 'settings',
  },
  {
    id: 'finalize',
    title: 'Finalize',
    description: 'Complete setup and launch',
    icon: 'rocket',
  },
];

export function getStepConfig(stepIndex: number): StepConfig {
  return SETUP_STEPS[stepIndex] ?? SETUP_STEPS[0]!;
}

// Helper to map DB state to our interface
type DbSetupState = typeof setupState.$inferSelect;

function mapDbState(state: DbSetupState): SetupState {
  return {
    id: state.id,
    status: state.status as SetupState['status'],
    currentStep: state.currentStep ?? 0,
    completedSteps: (state.completedSteps as string[]) ?? [],
    setupToken: state.setupToken,
    tokenExpiresAt: state.tokenExpiresAt,
    completedAt: state.completedAt,
    completedBy: state.completedBy,
    createdAt: state.createdAt ?? new Date(),
    updatedAt: state.updatedAt ?? new Date(),
  };
}

/**
 * Get the current setup state
 */
export async function getSetupState(): Promise<SetupState | null> {
  try {
    const [state] = await db
      .select()
      .from(setupState)
      .where(eq(setupState.id, 'singleton'))
      .limit(1);

    if (!state) {
      return null;
    }

    return mapDbState(state);
  } catch {
    // Table might not exist yet - that's ok
    return null;
  }
}

/**
 * Initialize setup state if not exists
 */
export async function initializeSetupState(): Promise<SetupState> {
  const existing = await getSetupState();
  if (existing) {
    return existing;
  }

  const result = await db
    .insert(setupState)
    .values({
      id: 'singleton',
      status: 'pending',
      currentStep: 0,
      completedSteps: [],
    })
    .returning();

  const state = result[0];
  if (!state) {
    throw new Error('Failed to initialize setup state');
  }

  return mapDbState(state);
}

/**
 * Update setup state
 */
export async function updateSetupState(
  updates: Partial<{
    status: SetupState['status'];
    currentStep: number;
    completedSteps: string[];
    setupToken: string | null;
    tokenExpiresAt: Date | null;
    completedAt: Date | null;
    completedBy: string | null;
  }>
): Promise<SetupState> {
  const result = await db
    .update(setupState)
    .set({
      ...updates,
      updatedAt: new Date(),
    })
    .where(eq(setupState.id, 'singleton'))
    .returning();

  const state = result[0];
  if (!state) {
    throw new Error('Failed to update setup state');
  }

  return mapDbState(state);
}

/**
 * Mark a step as completed and advance to next
 */
export async function completeStep(stepId: string): Promise<SetupState> {
  const current = await getSetupState();
  if (!current) {
    throw new Error('Setup not initialized');
  }

  const completedSteps = [...current.completedSteps];
  if (!completedSteps.includes(stepId)) {
    completedSteps.push(stepId);
  }

  const nextStep = Math.min(current.currentStep + 1, SETUP_STEPS.length - 1);
  const isLastStep = nextStep === SETUP_STEPS.length - 1 && stepId === 'finalize';

  return updateSetupState({
    currentStep: isLastStep ? current.currentStep : nextStep,
    completedSteps,
    status: isLastStep ? 'completed' : 'in_progress',
    completedAt: isLastStep ? new Date() : null,
  });
}

/**
 * Generate a setup token for remote access
 */
export async function generateSetupToken(): Promise<string> {
  const token = nanoid(32);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await updateSetupState({
    setupToken: token,
    tokenExpiresAt: expiresAt,
  });

  return token;
}

/**
 * Validate a setup token
 */
export async function validateSetupToken(token: string | null | undefined): Promise<boolean> {
  if (!token) {
    return false;
  }

  const state = await getSetupState();
  if (!state?.setupToken || !state.tokenExpiresAt) {
    return false;
  }

  if (state.setupToken !== token) {
    return false;
  }

  if (new Date() > state.tokenExpiresAt) {
    // Token expired - clear it
    await updateSetupState({
      setupToken: null,
      tokenExpiresAt: null,
    });
    return false;
  }

  return true;
}

/**
 * Check if setup is completed
 */
export async function isSetupComplete(): Promise<boolean> {
  const state = await getSetupState();
  return state?.status === 'completed';
}
