/**
 * Environment Configuration Routes
 * Admin-only routes for managing dotenv configurations
 */

import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { authMiddleware } from '../auth/middleware.js';
import {
  envConfigManager,
  type Environment,
  type EnvVariable,
  type EnvConfig,
  type EnvArchive,
} from '../services/config/index.js';

type AuthContext = {
  Variables: {
    did: string;
  };
};

const configRoutes = new Hono<AuthContext>();

// Helper to validate environment
function isValidEnvironment(env: string | undefined): env is Environment {
  return env === 'development' || env === 'staging' || env === 'production';
}

// ============================================================================
// Read Configuration
// ============================================================================

/**
 * Get configuration for a specific environment
 */
configRoutes.get('/io.exprsn.config.getConfig', authMiddleware, async (c) => {
  const env = c.req.query('environment');

  if (!isValidEnvironment(env)) {
    throw new HTTPException(400, { message: 'Invalid environment' });
  }

  try {
    const configData = await envConfigManager.readConfig(env);

    // Mask secret values for security
    const maskedVariables = configData.variables.map((v: EnvVariable) => ({
      ...v,
      value: v.isSecret ? '••••••••' : v.value,
      hasValue: !!v.value,
    }));

    return c.json({
      environment: configData.environment,
      variables: maskedVariables,
      lastModified: configData.lastModified,
      version: configData.version,
      variableCount: configData.variables.length,
      secretCount: configData.variables.filter((v: EnvVariable) => v.isSecret).length,
    });
  } catch (error) {
    throw new HTTPException(500, { message: 'Failed to read configuration' });
  }
});

/**
 * Get all configurations
 */
configRoutes.get('/io.exprsn.config.getAllConfigs', authMiddleware, async (c) => {
  try {
    const configs = await envConfigManager.readAllConfigs();

    // Mask secrets and add summaries
    const result: Record<string, unknown> = {};

    for (const [env, configData] of Object.entries(configs)) {
      const maskedVariables = (configData as EnvConfig).variables.map((v: EnvVariable) => ({
        ...v,
        value: v.isSecret ? '••••••••' : v.value,
        hasValue: !!v.value,
      }));

      result[env] = {
        environment: (configData as EnvConfig).environment,
        variables: maskedVariables,
        lastModified: (configData as EnvConfig).lastModified,
        version: (configData as EnvConfig).version,
        variableCount: (configData as EnvConfig).variables.length,
        secretCount: (configData as EnvConfig).variables.filter((v: EnvVariable) => v.isSecret).length,
      };
    }

    return c.json({
      configs: result,
      currentEnvironment: envConfigManager.getCurrentEnvironment(),
    });
  } catch (error) {
    throw new HTTPException(500, { message: 'Failed to read configurations' });
  }
});

/**
 * Get raw value for a specific variable (requires explicit request)
 */
configRoutes.get('/io.exprsn.config.getVariable', authMiddleware, async (c) => {
  const env = c.req.query('environment');
  const key = c.req.query('key');

  if (!isValidEnvironment(env) || !key) {
    throw new HTTPException(400, { message: 'Environment and key are required' });
  }

  try {
    const configData = await envConfigManager.readConfig(env);
    const variable = configData.variables.find((v: EnvVariable) => v.key === key);

    if (!variable) {
      throw new HTTPException(404, { message: 'Variable not found' });
    }

    return c.json({
      key: variable.key,
      value: variable.value,
      isSecret: variable.isSecret,
      description: variable.description,
      category: variable.category,
    });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    throw new HTTPException(500, { message: 'Failed to read variable' });
  }
});

// ============================================================================
// Write Configuration
// ============================================================================

/**
 * Update configuration for an environment
 */
configRoutes.post('/io.exprsn.config.updateConfig', authMiddleware, async (c) => {
  const userDid = c.get('did');
  const body = await c.req.json<{
    environment: string;
    variables: Array<{
      key: string;
      value: string;
      isSecret?: boolean;
      description?: string;
      category?: string;
    }>;
  }>();

  const { environment, variables } = body;

  if (!isValidEnvironment(environment) || !Array.isArray(variables)) {
    throw new HTTPException(400, { message: 'Invalid request body' });
  }

  try {
    // Get current config for comparison
    const currentConfig = await envConfigManager.readConfig(environment);

    // Merge: keep existing secret values if new value is masked
    const mergedVariables: EnvVariable[] = variables.map((v) => {
      if (v.value === '••••••••' || v.value === '') {
        const existing = currentConfig.variables.find((e: EnvVariable) => e.key === v.key);
        if (existing) {
          return { ...v, value: existing.value, isSecret: v.isSecret ?? false };
        }
      }
      return { ...v, isSecret: v.isSecret ?? false } as EnvVariable;
    });

    // Calculate diff
    const diff = envConfigManager.diffConfigs(currentConfig, {
      ...currentConfig,
      variables: mergedVariables,
    });

    // Write config (auto-archives)
    const result = await envConfigManager.writeConfig(
      environment,
      mergedVariables,
      userDid
    );

    return c.json({
      success: result.success,
      version: result.version,
      archive: result.archive
        ? {
            id: result.archive.id,
            archivedAt: result.archive.archivedAt,
          }
        : undefined,
      diff: {
        addedCount: diff.added.length,
        removedCount: diff.removed.length,
        modifiedCount: diff.modified.length,
      },
    });
  } catch (error) {
    throw new HTTPException(500, { message: 'Failed to update configuration' });
  }
});

/**
 * Add or update a single variable
 */
configRoutes.post('/io.exprsn.config.setVariable', authMiddleware, async (c) => {
  const userDid = c.get('did');
  const body = await c.req.json<{
    environment: string;
    key: string;
    value: string;
    description?: string;
  }>();

  const { environment, key, value, description } = body;

  if (!isValidEnvironment(environment) || !key) {
    throw new HTTPException(400, { message: 'Environment and key are required' });
  }

  try {
    const configData = await envConfigManager.readConfig(environment);
    const existing = configData.variables.find((v: EnvVariable) => v.key === key);

    let updatedVariables: EnvVariable[];
    let isNew = false;

    if (existing) {
      updatedVariables = configData.variables.map((v: EnvVariable) =>
        v.key === key
          ? {
              key: v.key,
              value,
              isSecret: v.isSecret,
              description: description || v.description,
              category: v.category,
            }
          : v
      );
    } else {
      // Determine if secret and category
      const isSecret = /password|secret|key|token|auth/i.test(key);
      updatedVariables = [
        ...configData.variables,
        {
          key,
          value,
          isSecret,
          description,
          category: 'general',
        },
      ];
      isNew = true;
    }

    const result = await envConfigManager.writeConfig(
      environment,
      updatedVariables,
      userDid
    );

    return c.json({
      success: result.success,
      version: result.version,
      isNew,
    });
  } catch (error) {
    throw new HTTPException(500, { message: 'Failed to set variable' });
  }
});

/**
 * Delete a variable
 */
configRoutes.post('/io.exprsn.config.deleteVariable', authMiddleware, async (c) => {
  const userDid = c.get('did');
  const body = await c.req.json<{
    environment: string;
    key: string;
  }>();

  const { environment, key } = body;

  if (!isValidEnvironment(environment) || !key) {
    throw new HTTPException(400, { message: 'Environment and key are required' });
  }

  try {
    const configData = await envConfigManager.readConfig(environment);
    const filteredVariables = configData.variables.filter((v: EnvVariable) => v.key !== key);

    if (filteredVariables.length === configData.variables.length) {
      throw new HTTPException(404, { message: 'Variable not found' });
    }

    const result = await envConfigManager.writeConfig(
      environment,
      filteredVariables,
      userDid
    );

    return c.json({
      success: result.success,
      version: result.version,
    });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    throw new HTTPException(500, { message: 'Failed to delete variable' });
  }
});

// ============================================================================
// Archives & Rollback
// ============================================================================

/**
 * List archives
 */
configRoutes.get('/io.exprsn.config.listArchives', authMiddleware, async (c) => {
  const env = c.req.query('environment');
  const envParam = isValidEnvironment(env) ? env : undefined;

  try {
    const archives = await envConfigManager.listArchives(envParam);

    return c.json({
      archives: archives.map((a: EnvArchive) => ({
        id: a.id,
        environment: a.environment,
        version: a.version,
        archivedAt: a.archivedAt,
        archivedBy: a.archivedBy,
        reason: a.reason,
        gitCommit: a.gitCommit,
        variableCount: a.variables.length,
      })),
    });
  } catch (error) {
    throw new HTTPException(500, { message: 'Failed to list archives' });
  }
});

/**
 * Get archive details
 */
configRoutes.get('/io.exprsn.config.getArchive', authMiddleware, async (c) => {
  const archiveId = c.req.query('archiveId');

  if (!archiveId) {
    throw new HTTPException(400, { message: 'Archive ID is required' });
  }

  try {
    const archive = await envConfigManager.getArchive(archiveId);

    if (!archive) {
      throw new HTTPException(404, { message: 'Archive not found' });
    }

    // Mask secrets
    const maskedVariables = archive.variables.map((v: EnvVariable) => ({
      ...v,
      value: v.isSecret ? '••••••••' : v.value,
    }));

    return c.json({
      ...archive,
      variables: maskedVariables,
    });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    throw new HTTPException(500, { message: 'Failed to get archive' });
  }
});

/**
 * Rollback to an archive
 */
configRoutes.post('/io.exprsn.config.rollback', authMiddleware, async (c) => {
  const userDid = c.get('did');
  const body = await c.req.json<{ archiveId: string }>();

  if (!body.archiveId) {
    throw new HTTPException(400, { message: 'Archive ID is required' });
  }

  try {
    const result = await envConfigManager.rollback(body.archiveId, userDid);

    return c.json({
      success: result.success,
      previousArchive: result.currentArchive
        ? {
            id: result.currentArchive.id,
            archivedAt: result.currentArchive.archivedAt,
          }
        : undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to rollback';
    throw new HTTPException(500, { message });
  }
});

// ============================================================================
// Promotion & Comparison
// ============================================================================

/**
 * Promote configuration from one environment to another
 */
configRoutes.post('/io.exprsn.config.promote', authMiddleware, async (c) => {
  const userDid = c.get('did');
  const body = await c.req.json<{
    fromEnvironment: string;
    toEnvironment: string;
    excludeKeys?: string[];
  }>();

  const { fromEnvironment, toEnvironment, excludeKeys } = body;

  if (!isValidEnvironment(fromEnvironment) || !isValidEnvironment(toEnvironment)) {
    throw new HTTPException(400, { message: 'Invalid environment' });
  }

  if (fromEnvironment === toEnvironment) {
    throw new HTTPException(400, { message: 'Cannot promote to same environment' });
  }

  // Validate promotion path (dev -> staging -> prod)
  const validPromotions: Record<Environment, Environment[]> = {
    development: ['staging'],
    staging: ['production'],
    production: [],
  };

  if (!validPromotions[fromEnvironment].includes(toEnvironment)) {
    throw new HTTPException(400, {
      message: `Cannot promote from ${fromEnvironment} to ${toEnvironment}. Valid path: development -> staging -> production`,
    });
  }

  try {
    const result = await envConfigManager.promoteConfig(
      fromEnvironment,
      toEnvironment,
      excludeKeys || [],
      userDid
    );

    return c.json({
      success: result.success,
      archive: result.archive
        ? {
            id: result.archive.id,
            archivedAt: result.archive.archivedAt,
          }
        : undefined,
      diff: {
        addedCount: result.diff.added.length,
        removedCount: result.diff.removed.length,
        modifiedCount: result.diff.modified.length,
        added: result.diff.added.map((v: EnvVariable) => v.key),
        removed: result.diff.removed.map((v: EnvVariable) => v.key),
        modified: result.diff.modified.map((m: { key: string }) => m.key),
      },
    });
  } catch (error) {
    throw new HTTPException(500, { message: 'Failed to promote configuration' });
  }
});

/**
 * Compare two environments
 */
configRoutes.get('/io.exprsn.config.compare', authMiddleware, async (c) => {
  const env1 = c.req.query('env1');
  const env2 = c.req.query('env2');

  if (!isValidEnvironment(env1) || !isValidEnvironment(env2)) {
    throw new HTTPException(400, { message: 'Both environments are required' });
  }

  try {
    const config1 = await envConfigManager.readConfig(env1);
    const config2 = await envConfigManager.readConfig(env2);

    const diff = envConfigManager.diffConfigs(config1, config2);

    return c.json({
      environments: [env1, env2],
      diff: {
        added: diff.added.map((v: EnvVariable) => ({
          key: v.key,
          category: v.category,
          isSecret: v.isSecret,
        })),
        removed: diff.removed.map((v: EnvVariable) => ({
          key: v.key,
          category: v.category,
          isSecret: v.isSecret,
        })),
        modified: diff.modified.map((m: { key: string }) => ({
          key: m.key,
        })),
      },
      summary: {
        addedCount: diff.added.length,
        removedCount: diff.removed.length,
        modifiedCount: diff.modified.length,
        totalDifferences: diff.added.length + diff.removed.length + diff.modified.length,
      },
    });
  } catch (error) {
    throw new HTTPException(500, { message: 'Failed to compare configurations' });
  }
});

// ============================================================================
// Validation & Git
// ============================================================================

/**
 * Validate configuration
 */
configRoutes.get('/io.exprsn.config.validate', authMiddleware, async (c) => {
  const env = c.req.query('environment');

  if (!isValidEnvironment(env)) {
    throw new HTTPException(400, { message: 'Environment is required' });
  }

  try {
    const result = await envConfigManager.validateConfig(env);

    return c.json({
      environment: env,
      valid: result.valid,
      errors: result.errors,
      warnings: result.warnings,
    });
  } catch (error) {
    throw new HTTPException(500, { message: 'Failed to validate configuration' });
  }
});

/**
 * Commit configuration changes to git
 */
configRoutes.post('/io.exprsn.config.commit', authMiddleware, async (c) => {
  const userDid = c.get('did');
  const body = await c.req.json<{
    environment: string;
    message: string;
  }>();

  const { environment, message } = body;

  if (!isValidEnvironment(environment) || !message) {
    throw new HTTPException(400, { message: 'Environment and message are required' });
  }

  try {
    const result = await envConfigManager.commitChanges(environment, message, userDid);

    return c.json({
      success: result.success,
      commit: result.commit,
    });
  } catch (error) {
    throw new HTTPException(500, { message: 'Failed to commit changes' });
  }
});

/**
 * Cleanup old archives
 */
configRoutes.post('/io.exprsn.config.cleanupArchives', authMiddleware, async (c) => {
  const keepCount = parseInt(c.req.query('keepCount') || '10', 10);

  try {
    const deletedCount = await envConfigManager.cleanupArchives(keepCount);

    return c.json({
      success: true,
      deletedCount,
    });
  } catch (error) {
    throw new HTTPException(500, { message: 'Failed to cleanup archives' });
  }
});

/**
 * Get current environment
 */
configRoutes.get('/io.exprsn.config.getCurrentEnvironment', async (c) => {
  return c.json({
    environment: envConfigManager.getCurrentEnvironment(),
  });
});

/**
 * Switch environment (runtime only, doesn't persist)
 */
configRoutes.post('/io.exprsn.config.switchEnvironment', authMiddleware, async (c) => {
  const body = await c.req.json<{ environment: string }>();

  if (!isValidEnvironment(body.environment)) {
    throw new HTTPException(400, { message: 'Invalid environment' });
  }

  envConfigManager.setCurrentEnvironment(body.environment);

  return c.json({
    success: true,
    environment: body.environment,
  });
});

export default configRoutes;
