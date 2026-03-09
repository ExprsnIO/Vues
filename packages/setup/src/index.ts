/**
 * @exprsn/setup - First-run setup wizard
 *
 * A self-contained setup package for initializing Exprsn installations.
 * Handles CA setup, admin user creation, and service configuration.
 */

import { Hono } from 'hono';
import { setupAccessMiddleware } from './middleware.js';
import { apiRoutes } from './api/routes.js';
import { renderSetupPage } from './ui/templates.js';
import { getSetupState, getStepConfig } from './state.js';

export const setupRouter = new Hono();

// Apply access control middleware
setupRouter.use('*', setupAccessMiddleware);

// Main setup wizard UI
setupRouter.get('/', async (c) => {
  const state = await getSetupState();
  const currentStep = state?.currentStep || 0;
  const stepConfig = getStepConfig(currentStep);

  const html = renderSetupPage({
    currentStep,
    stepConfig,
    completedSteps: state?.completedSteps || [],
    status: state?.status || 'pending',
  });

  return c.html(html);
});

// Mount API routes
setupRouter.route('/api', apiRoutes);

// Re-export types and utilities
export { getSetupState, initializeSetupState } from './state.js';
export type { SetupState, StepConfig } from './state.js';
