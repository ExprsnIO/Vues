/**
 * Environment Configuration Manager
 * Handles reading, writing, archiving, and rolling back dotenv configurations
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

export type Environment = 'development' | 'staging' | 'production';

export interface EnvVariable {
  key: string;
  value: string;
  isSecret: boolean;
  description?: string;
  category?: string;
}

export interface EnvConfig {
  environment: Environment;
  variables: EnvVariable[];
  lastModified: Date;
  lastModifiedBy?: string;
  version: string;
}

export interface EnvArchive {
  id: string;
  environment: Environment;
  version: string;
  variables: EnvVariable[];
  archivedAt: Date;
  archivedBy?: string;
  reason?: string;
  gitCommit?: string;
}

export interface ConfigDiff {
  added: EnvVariable[];
  removed: EnvVariable[];
  modified: { key: string; oldValue: string; newValue: string }[];
}

// Secret patterns - values matching these will be masked
const SECRET_PATTERNS = [
  /password/i,
  /secret/i,
  /key/i,
  /token/i,
  /credential/i,
  /auth/i,
  /private/i,
  /api_key/i,
  /apikey/i,
  /access_token/i,
  /refresh_token/i,
  /jwt/i,
  /encryption/i,
  /signing/i,
];

// Variable categories for organization
const CATEGORY_PATTERNS: Record<string, RegExp[]> = {
  database: [/^DB_/, /^DATABASE_/, /^POSTGRES_/, /^MYSQL_/, /^MONGO_/, /^REDIS_/],
  auth: [/^AUTH_/, /^JWT_/, /^OAUTH_/, /^SESSION_/],
  api: [/^API_/, /^NEXT_PUBLIC_API/],
  storage: [/^S3_/, /^STORAGE_/, /^UPLOAD_/, /^CDN_/],
  email: [/^SMTP_/, /^EMAIL_/, /^MAIL_/, /^SENDGRID_/],
  monitoring: [/^SENTRY_/, /^LOG_/, /^METRICS_/, /^TRACE_/],
  feature: [/^FEATURE_/, /^FLAG_/, /^ENABLE_/],
  external: [/^STRIPE_/, /^PAYPAL_/, /^TWILIO_/, /^AWS_/],
};

export class EnvConfigManager {
  private configDir: string;
  private archiveDir: string;
  private currentEnv: Environment;

  constructor(configDir?: string) {
    this.configDir = configDir || path.join(process.cwd(), '..');
    this.archiveDir = path.join(this.configDir, '.env-archives');
    this.currentEnv = (process.env.NODE_ENV as Environment) || 'development';

    // Ensure archive directory exists
    if (!fs.existsSync(this.archiveDir)) {
      fs.mkdirSync(this.archiveDir, { recursive: true });
    }
  }

  /**
   * Get the path to an environment file
   */
  private getEnvFilePath(env: Environment): string {
    const filename = env === 'development' ? '.env' : `.env.${env}`;
    return path.join(this.configDir, filename);
  }

  /**
   * Parse a dotenv file content into variables
   */
  private parseEnvFile(content: string): EnvVariable[] {
    const variables: EnvVariable[] = [];
    const lines = content.split('\n');

    let currentComment = '';

    for (const line of lines) {
      const trimmed = line.trim();

      // Collect comments as descriptions
      if (trimmed.startsWith('#')) {
        currentComment = trimmed.slice(1).trim();
        continue;
      }

      // Skip empty lines
      if (!trimmed || !trimmed.includes('=')) {
        currentComment = '';
        continue;
      }

      // Parse key=value
      const eqIndex = trimmed.indexOf('=');
      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();

      // Remove surrounding quotes
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      // Determine if it's a secret
      const isSecret = SECRET_PATTERNS.some((pattern) => pattern.test(key));

      // Determine category
      let category = 'general';
      for (const [cat, patterns] of Object.entries(CATEGORY_PATTERNS)) {
        if (patterns.some((pattern) => pattern.test(key))) {
          category = cat;
          break;
        }
      }

      variables.push({
        key,
        value,
        isSecret,
        description: currentComment || undefined,
        category,
      });

      currentComment = '';
    }

    return variables;
  }

  /**
   * Serialize variables to dotenv format
   */
  private serializeEnvFile(variables: EnvVariable[]): string {
    const lines: string[] = [];
    let lastCategory = '';

    // Sort by category then key
    const sorted = [...variables].sort((a, b) => {
      if (a.category !== b.category) {
        return (a.category || 'general').localeCompare(b.category || 'general');
      }
      return a.key.localeCompare(b.key);
    });

    for (const variable of sorted) {
      // Add category header
      if (variable.category && variable.category !== lastCategory) {
        if (lines.length > 0) lines.push('');
        lines.push(`# === ${variable.category.toUpperCase()} ===`);
        lastCategory = variable.category;
      }

      // Add description comment
      if (variable.description) {
        lines.push(`# ${variable.description}`);
      }

      // Add key=value
      const needsQuotes = variable.value.includes(' ') ||
                          variable.value.includes('#') ||
                          variable.value.includes('\n');
      const quotedValue = needsQuotes ? `"${variable.value}"` : variable.value;
      lines.push(`${variable.key}=${quotedValue}`);
    }

    return lines.join('\n') + '\n';
  }

  /**
   * Generate a version string
   */
  private generateVersion(): string {
    const now = new Date();
    return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}.${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  }

  /**
   * Get current git commit hash
   */
  private getGitCommit(): string | undefined {
    try {
      return execSync('git rev-parse HEAD', { cwd: this.configDir })
        .toString()
        .trim();
    } catch {
      return undefined;
    }
  }

  /**
   * Read environment configuration
   */
  async readConfig(env: Environment): Promise<EnvConfig> {
    const filePath = this.getEnvFilePath(env);

    if (!fs.existsSync(filePath)) {
      return {
        environment: env,
        variables: [],
        lastModified: new Date(),
        version: this.generateVersion(),
      };
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const stats = fs.statSync(filePath);
    const variables = this.parseEnvFile(content);

    return {
      environment: env,
      variables,
      lastModified: stats.mtime,
      version: this.generateVersion(),
    };
  }

  /**
   * Read all environment configurations
   */
  async readAllConfigs(): Promise<Record<Environment, EnvConfig>> {
    const envs: Environment[] = ['development', 'staging', 'production'];
    const configs: Record<Environment, EnvConfig> = {} as any;

    for (const env of envs) {
      configs[env] = await this.readConfig(env);
    }

    return configs;
  }

  /**
   * Archive current configuration before changes
   */
  async archiveConfig(
    env: Environment,
    reason?: string,
    archivedBy?: string
  ): Promise<EnvArchive> {
    const config = await this.readConfig(env);
    const archiveId = `${env}-${this.generateVersion()}`;

    const archive: EnvArchive = {
      id: archiveId,
      environment: env,
      version: config.version,
      variables: config.variables,
      archivedAt: new Date(),
      archivedBy,
      reason,
      gitCommit: this.getGitCommit(),
    };

    // Save archive
    const archivePath = path.join(this.archiveDir, `${archiveId}.json`);
    fs.writeFileSync(archivePath, JSON.stringify(archive, null, 2));

    // Also save the raw env file
    const envFilePath = this.getEnvFilePath(env);
    if (fs.existsSync(envFilePath)) {
      const rawArchivePath = path.join(this.archiveDir, `${archiveId}.env`);
      fs.copyFileSync(envFilePath, rawArchivePath);
    }

    return archive;
  }

  /**
   * Write environment configuration
   */
  async writeConfig(
    env: Environment,
    variables: EnvVariable[],
    modifiedBy?: string,
    autoArchive: boolean = true
  ): Promise<{ success: boolean; archive?: EnvArchive; version: string }> {
    const filePath = this.getEnvFilePath(env);

    // Archive current config first
    let archive: EnvArchive | undefined;
    if (autoArchive && fs.existsSync(filePath)) {
      archive = await this.archiveConfig(env, 'Pre-update archive', modifiedBy);
    }

    // Write new config
    const content = this.serializeEnvFile(variables);
    fs.writeFileSync(filePath, content);

    const version = this.generateVersion();

    return { success: true, archive, version };
  }

  /**
   * Get diff between two configurations
   */
  diffConfigs(oldConfig: EnvConfig, newConfig: EnvConfig): ConfigDiff {
    const oldMap = new Map(oldConfig.variables.map((v) => [v.key, v]));
    const newMap = new Map(newConfig.variables.map((v) => [v.key, v]));

    const added: EnvVariable[] = [];
    const removed: EnvVariable[] = [];
    const modified: { key: string; oldValue: string; newValue: string }[] = [];

    // Find added and modified
    for (const [key, newVar] of newMap) {
      const oldVar = oldMap.get(key);
      if (!oldVar) {
        added.push(newVar);
      } else if (oldVar.value !== newVar.value) {
        modified.push({
          key,
          oldValue: oldVar.value,
          newValue: newVar.value,
        });
      }
    }

    // Find removed
    for (const [key, oldVar] of oldMap) {
      if (!newMap.has(key)) {
        removed.push(oldVar);
      }
    }

    return { added, removed, modified };
  }

  /**
   * List available archives
   */
  async listArchives(env?: Environment): Promise<EnvArchive[]> {
    if (!fs.existsSync(this.archiveDir)) {
      return [];
    }

    const files = fs.readdirSync(this.archiveDir).filter((f) => f.endsWith('.json'));
    const archives: EnvArchive[] = [];

    for (const file of files) {
      const content = fs.readFileSync(path.join(this.archiveDir, file), 'utf-8');
      const archive: EnvArchive = JSON.parse(content);

      if (!env || archive.environment === env) {
        archives.push(archive);
      }
    }

    // Sort by date descending
    return archives.sort((a, b) =>
      new Date(b.archivedAt).getTime() - new Date(a.archivedAt).getTime()
    );
  }

  /**
   * Get a specific archive
   */
  async getArchive(archiveId: string): Promise<EnvArchive | null> {
    const archivePath = path.join(this.archiveDir, `${archiveId}.json`);

    if (!fs.existsSync(archivePath)) {
      return null;
    }

    const content = fs.readFileSync(archivePath, 'utf-8');
    return JSON.parse(content);
  }

  /**
   * Rollback to a previous archive
   */
  async rollback(
    archiveId: string,
    rolledBackBy?: string
  ): Promise<{ success: boolean; currentArchive?: EnvArchive }> {
    const archive = await this.getArchive(archiveId);

    if (!archive) {
      throw new Error(`Archive not found: ${archiveId}`);
    }

    // Archive current state before rollback
    const currentArchive = await this.archiveConfig(
      archive.environment,
      `Pre-rollback to ${archiveId}`,
      rolledBackBy
    );

    // Restore from archive
    await this.writeConfig(
      archive.environment,
      archive.variables,
      rolledBackBy,
      false // Don't auto-archive since we just did
    );

    return { success: true, currentArchive };
  }

  /**
   * Promote configuration from one environment to another
   */
  async promoteConfig(
    fromEnv: Environment,
    toEnv: Environment,
    excludeKeys: string[] = [],
    promotedBy?: string
  ): Promise<{ success: boolean; archive?: EnvArchive; diff: ConfigDiff }> {
    const fromConfig = await this.readConfig(fromEnv);
    const toConfig = await this.readConfig(toEnv);

    // Filter out excluded keys
    const promotedVariables = fromConfig.variables.filter(
      (v) => !excludeKeys.includes(v.key)
    );

    // Calculate diff
    const diff = this.diffConfigs(toConfig, {
      ...fromConfig,
      variables: promotedVariables,
    });

    // Archive target before promotion
    const archive = await this.archiveConfig(
      toEnv,
      `Pre-promotion from ${fromEnv}`,
      promotedBy
    );

    // Write promoted config
    await this.writeConfig(toEnv, promotedVariables, promotedBy, false);

    return { success: true, archive, diff };
  }

  /**
   * Validate configuration
   */
  async validateConfig(env: Environment): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const config = await this.readConfig(env);
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required variables per environment
    const requiredVars: Record<Environment, string[]> = {
      development: ['DATABASE_URL'],
      staging: ['DATABASE_URL', 'API_URL'],
      production: ['DATABASE_URL', 'API_URL', 'JWT_SECRET'],
    };

    const required = requiredVars[env] || [];
    const existingKeys = new Set(config.variables.map((v) => v.key));

    for (const key of required) {
      if (!existingKeys.has(key)) {
        errors.push(`Missing required variable: ${key}`);
      }
    }

    // Check for empty values on required vars
    for (const variable of config.variables) {
      if (required.includes(variable.key) && !variable.value) {
        errors.push(`Required variable has empty value: ${variable.key}`);
      }
    }

    // Warnings for secrets without proper format
    for (const variable of config.variables) {
      if (variable.isSecret && variable.value.length < 16) {
        warnings.push(`Secret "${variable.key}" appears too short (< 16 chars)`);
      }
    }

    // Check for development values in production
    if (env === 'production') {
      for (const variable of config.variables) {
        if (
          variable.value.includes('localhost') ||
          variable.value.includes('127.0.0.1') ||
          variable.value.includes('development')
        ) {
          warnings.push(`Variable "${variable.key}" contains development-like value`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Commit configuration changes to git
   */
  async commitChanges(
    env: Environment,
    message: string,
    committedBy?: string
  ): Promise<{ success: boolean; commit?: string }> {
    try {
      const filePath = this.getEnvFilePath(env);
      const relativePath = path.relative(this.configDir, filePath);

      // Stage the file
      execSync(`git add "${relativePath}"`, { cwd: this.configDir });

      // Commit
      const fullMessage = committedBy
        ? `${message}\n\nCommitted by: ${committedBy}`
        : message;
      execSync(`git commit -m "${fullMessage}"`, { cwd: this.configDir });

      // Get commit hash
      const commit = execSync('git rev-parse HEAD', { cwd: this.configDir })
        .toString()
        .trim();

      return { success: true, commit };
    } catch (error) {
      return { success: false };
    }
  }

  /**
   * Get current environment
   */
  getCurrentEnvironment(): Environment {
    return this.currentEnv;
  }

  /**
   * Set current environment (updates NODE_ENV)
   */
  setCurrentEnvironment(env: Environment): void {
    this.currentEnv = env;
    process.env.NODE_ENV = env;
  }

  /**
   * Delete old archives (keep last N per environment)
   */
  async cleanupArchives(keepCount: number = 10): Promise<number> {
    const archives = await this.listArchives();
    const byEnv: Record<Environment, EnvArchive[]> = {
      development: [],
      staging: [],
      production: [],
    };

    for (const archive of archives) {
      byEnv[archive.environment].push(archive);
    }

    let deletedCount = 0;

    for (const env of Object.keys(byEnv) as Environment[]) {
      const envArchives = byEnv[env];
      if (envArchives.length > keepCount) {
        const toDelete = envArchives.slice(keepCount);
        for (const archive of toDelete) {
          const jsonPath = path.join(this.archiveDir, `${archive.id}.json`);
          const envPath = path.join(this.archiveDir, `${archive.id}.env`);

          if (fs.existsSync(jsonPath)) fs.unlinkSync(jsonPath);
          if (fs.existsSync(envPath)) fs.unlinkSync(envPath);
          deletedCount++;
        }
      }
    }

    return deletedCount;
  }
}

export const envConfigManager = new EnvConfigManager();
