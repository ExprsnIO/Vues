#!/usr/bin/env node

/**
 * @exprsn/env-generator CLI
 *
 * Usage:
 *   pnpm env:gen --env=production --auto-secrets --output=.env.production
 *   pnpm env:gen --env=development
 *   pnpm env:gen --validate=.env.production --env=production
 */

import { writeFileSync, readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { generateEnvFile, validateEnv } from './generator.js';
import type { Environment } from './schema.js';

function parseArgs(argv: string[]): Map<string, string> {
  const args = new Map<string, string>();
  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--')) {
      const eqIdx = arg.indexOf('=');
      if (eqIdx === -1) {
        args.set(arg.slice(2), 'true');
      } else {
        args.set(arg.slice(2, eqIdx), arg.slice(eqIdx + 1));
      }
    }
  }
  return args;
}

function printUsage() {
  console.log(`
@exprsn/env-generator — Environment File Generator

Usage:
  env-gen --env=<environment> [options]

Options:
  --env=<env>          Target environment: development, staging, production (required)
  --auto-secrets       Auto-generate secrets for sensitive variables
  --output=<path>      Output file path (default: environment-based)
  --categories=<list>  Comma-separated category names to include
  --no-comments        Omit comment headers
  --validate=<path>    Validate an existing .env file instead of generating
  --help               Show this help message
`);
}

function main() {
  const args = parseArgs(process.argv);

  if (args.has('help')) {
    printUsage();
    process.exit(0);
  }

  const env = (args.get('env') || 'development') as Environment;
  if (!['development', 'staging', 'production'].includes(env)) {
    console.error(`Invalid environment: ${env}. Must be development, staging, or production.`);
    process.exit(1);
  }

  // Validate mode
  const validatePath = args.get('validate');
  if (validatePath) {
    const filePath = resolve(validatePath);
    if (!existsSync(filePath)) {
      console.error(`File not found: ${filePath}`);
      process.exit(1);
    }
    const content = readFileSync(filePath, 'utf-8');
    const parsed: Record<string, string> = {};
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx === -1) continue;
      parsed[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
    }

    const result = validateEnv(parsed, env);
    if (result.valid) {
      console.log(`Environment file is valid for ${env}.`);
    } else {
      console.error(`Validation errors for ${env}:`);
      for (const err of result.errors) {
        console.error(`  - ${err}`);
      }
      process.exit(1);
    }
    return;
  }

  // Generate mode
  const defaultOutputPaths: Record<string, string> = {
    development: '.env',
    staging: '.env.staging',
    production: '.env.production',
  };

  const output = args.get('output') || defaultOutputPaths[env] || '.env';
  const outputPath = resolve(output);

  const result = generateEnvFile({
    environment: env,
    autoSecrets: args.get('auto-secrets') === 'true',
    categories: args.get('categories')?.split(','),
    comments: args.get('no-comments') !== 'true',
  });

  writeFileSync(outputPath, result.content, 'utf-8');
  console.log(`Generated ${env} environment file: ${outputPath}`);

  if (result.generated.length > 0) {
    console.log(`Auto-generated secrets: ${result.generated.join(', ')}`);
  }

  if (result.warnings.length > 0) {
    console.log('\nWarnings:');
    for (const w of result.warnings) {
      console.log(`  - ${w}`);
    }
  }
}

main();
