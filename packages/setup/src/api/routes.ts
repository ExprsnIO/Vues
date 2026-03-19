/**
 * Setup API routes
 */

import { Hono } from 'hono';
import {
  getSetupState,
  initializeSetupState,
  completeStep,
  generateSetupToken,
  SETUP_STEPS,
} from '../state.js';
import { setupRateLimitMiddleware } from '../middleware.js';
import { checkPrerequisites } from '../steps/prerequisites.js';
import { initializeCertificates, getCertificateStatus } from '../steps/certificates.js';
import { createAdminUser, hasAdminUsers } from '../steps/admin.js';
import { configureServices, getServicesConfig, AVAILABLE_SERVICES } from '../steps/services.js';
import { finalizeSetup, getSystemInfo } from '../steps/finalize.js';
import { updateEnvFile, readEnvFile, getSetupEnvSchema } from '../steps/env-writer.js';

export const apiRoutes = new Hono();

// Apply rate limiting to API routes
apiRoutes.use('*', setupRateLimitMiddleware);

/**
 * Get current setup state
 */
apiRoutes.get('/state', async (c) => {
  let state = await getSetupState();

  // Initialize if not exists
  if (!state) {
    state = await initializeSetupState();
  }

  return c.json({
    status: state.status,
    currentStep: state.currentStep,
    completedSteps: state.completedSteps,
    steps: SETUP_STEPS,
    hasToken: !!state.setupToken,
  });
});

/**
 * Generate setup token for remote access
 */
apiRoutes.post('/token', async (c) => {
  const token = await generateSetupToken();

  return c.json({
    token,
    expiresIn: 3600, // 1 hour in seconds
    usage: 'Add ?token=<token> to the URL or set X-Setup-Token header',
  });
});

/**
 * Step 1: Run prerequisite checks
 */
apiRoutes.post('/prerequisites', async (c) => {
  const result = await checkPrerequisites();

  if (result.success) {
    await initializeSetupState();
    await completeStep('prerequisites');
  }

  return c.json(result);
});

/**
 * Step 2: Initialize certificates
 */
apiRoutes.post('/certificates', async (c) => {
  const body = await c.req.json().catch(() => ({}));

  const result = await initializeCertificates(body);

  if (result.success) {
    await completeStep('certificates');
  }

  return c.json(result);
});

/**
 * Get certificate status
 */
apiRoutes.get('/certificates/status', async (c) => {
  const status = await getCertificateStatus();
  return c.json(status);
});

/**
 * Step 3: Create admin user
 */
apiRoutes.post('/admin', async (c) => {
  const body = await c.req.json<{
    handle: string;
    email?: string;
    password: string;
    displayName?: string;
  }>();

  if (!body.handle || !body.password) {
    return c.json({ success: false, error: 'Handle and password are required' }, 400);
  }

  const result = await createAdminUser(body);

  if (result.success) {
    await completeStep('admin');
  }

  return c.json(result);
});

/**
 * Check if admin exists
 */
apiRoutes.get('/admin/exists', async (c) => {
  const exists = await hasAdminUsers();
  return c.json({ exists });
});

/**
 * Step 4: Configure services
 */
apiRoutes.post('/services', async (c) => {
  const body = await c.req.json<Record<string, boolean>>();

  const result = await configureServices(body);

  if (result.success) {
    await completeStep('services');

    // Persist service feature flags to .env
    const envUpdates: Record<string, string> = {};
    if (body.render_pipeline) envUpdates.RENDER_ENABLED = 'true';
    if (body.federation) {
      envUpdates.PDS_ENABLED = 'true';
      envUpdates.RELAY_ENABLED = 'true';
    }
    if (body.spark_messaging) envUpdates.CHAT_ENABLED = 'true';
    if (body.live_streaming) envUpdates.LIVESTREAM_ENABLED = 'true';
    if (body.analytics) envUpdates.ANALYTICS_ENABLED = 'true';
    if (body.ai_moderation) envUpdates.AI_MODERATION_ENABLED = 'true';
    if (body.email_notifications) envUpdates.EMAIL_ENABLED = 'true';

    await updateEnvFile(envUpdates);
  }

  return c.json(result);
});

/**
 * Get available services
 */
apiRoutes.get('/services', async (c) => {
  const services = await getServicesConfig();
  return c.json({
    services,
    available: AVAILABLE_SERVICES,
  });
});

/**
 * Step 5: Finalize setup
 */
apiRoutes.post('/finalize', async (c) => {
  type FinalizeBody = {
    adminDid?: string;
    branding?: {
      name?: string;
      domain?: string;
      accentColor?: string;
      tagline?: string;
    };
  };

  const body: FinalizeBody = await c.req.json<FinalizeBody>().catch(() => ({}));

  // Write branding and production safety vars before finalizing
  if (body.branding) {
    const branding = body.branding;
    const brandingEnv: Record<string, string> = {};
    if (branding.name) brandingEnv.PLATFORM_NAME = branding.name;
    if (branding.domain) brandingEnv.APP_URL = `https://${branding.domain}`;
    if (branding.accentColor) brandingEnv.PLATFORM_ACCENT_COLOR = branding.accentColor;
    if (branding.tagline) brandingEnv.PLATFORM_TAGLINE = branding.tagline;

    // Enforce production safety
    brandingEnv.DEV_AUTH_BYPASS = 'false';
    brandingEnv.NODE_ENV = 'production';

    await updateEnvFile(brandingEnv);
  }

  const result = await finalizeSetup(body);

  return c.json(result);
});

/**
 * Get system info
 */
apiRoutes.get('/system', async (c) => {
  const info = await getSystemInfo();
  return c.json(info);
});

/**
 * Get environment variable schema with current values
 */
apiRoutes.get('/env', async (c) => {
  const current = await readEnvFile();
  const schema = getSetupEnvSchema();

  // Return schema with current values (mask sensitive ones)
  const variables = schema.map((s) => ({
    ...s,
    value: current.get(s.key) || s.default || '',
    isSet: current.has(s.key),
    displayValue:
      s.sensitive && current.has(s.key) ? '••••••••' : (current.get(s.key) || ''),
  }));

  return c.json({ variables, path: process.cwd() + '/.env' });
});

/**
 * Write environment variables to .env file
 */
apiRoutes.post('/env', async (c) => {
  const body = await c.req.json<Record<string, string>>();

  const result = await updateEnvFile(body);
  return c.json(result);
});

/**
 * Reset setup (development only)
 */
apiRoutes.post('/reset', async (c) => {
  if (process.env.NODE_ENV === 'production') {
    return c.json({ error: 'Not available in production' }, 403);
  }

  const { db } = await import('@exprsn/api/db');
  const { setupState } = await import('@exprsn/api/db');
  const { eq } = await import('drizzle-orm');

  await db.delete(setupState).where(eq(setupState.id, 'singleton'));

  return c.json({ success: true, message: 'Setup state reset' });
});
