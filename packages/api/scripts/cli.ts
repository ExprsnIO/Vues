/**
 * Exprsn Administration CLI
 * Run with: cd packages/api && npx tsx scripts/cli.ts
 */

import * as readline from 'readline';
import { readFile, writeFile, access, mkdir } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const MONOREPO_ROOT = resolve(ROOT, '../..');
const ENV_PATH = resolve(MONOREPO_ROOT, '.env');
const SSL_DIR = resolve(MONOREPO_ROOT, 'deploy/nginx/ssl');
const CERT_FILE = resolve(SSL_DIR, 'fullchain.pem');
const KEY_FILE = resolve(SSL_DIR, 'privkey.pem');
const SERVICE_NAME = 'exprsn';

// ---------------------------------------------------------------------------
// ANSI color helpers
// ---------------------------------------------------------------------------

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};

function success(msg: string) { console.log(`${C.green}✓${C.reset} ${msg}`); }
function error(msg: string)   { console.log(`${C.red}✗${C.reset} ${msg}`); }
function warn(msg: string)    { console.log(`${C.yellow}⚠${C.reset} ${msg}`); }
function info(msg: string)    { console.log(`${C.blue}ℹ${C.reset} ${msg}`); }
function dim(msg: string)     { console.log(`${C.dim}${msg}${C.reset}`); }

function header(text: string) {
  const line = '═'.repeat(text.length + 4);
  console.log(`\n${C.cyan}╔${line}╗${C.reset}`);
  console.log(`${C.cyan}║  ${C.bold}${text}${C.reset}${C.cyan}  ║${C.reset}`);
  console.log(`${C.cyan}╚${line}╝${C.reset}\n`);
}

function section(text: string) {
  console.log(`\n${C.bold}${C.blue}── ${text} ──${C.reset}`);
}

function table(rows: [string, string][], colWidth = 28) {
  for (const [label, value] of rows) {
    const pad = ' '.repeat(Math.max(0, colWidth - label.length));
    console.log(`  ${C.dim}${label}${C.reset}${pad}${value}`);
  }
}

// ---------------------------------------------------------------------------
// readline interface
// ---------------------------------------------------------------------------

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, (a) => resolve(a.trim())));
}

async function askPassword(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    const stdin = process.stdin;
    const wasRaw = (stdin as NodeJS.ReadStream).isRaw;
    (stdin as NodeJS.ReadStream).setRawMode?.(true);
    stdin.resume();
    let password = '';
    const onData = (ch: Buffer) => {
      const c = ch.toString('utf8');
      if (c === '\n' || c === '\r' || c === '\u0004') {
        stdin.removeListener('data', onData);
        (stdin as NodeJS.ReadStream).setRawMode?.(wasRaw ?? false);
        process.stdout.write('\n');
        resolve(password);
      } else if (c === '\u0003') {
        process.exit();
      } else if (c === '\u007f' || c === '\b') {
        if (password.length > 0) {
          password = password.slice(0, -1);
          process.stdout.write('\b \b');
        }
      } else {
        password += c;
        process.stdout.write('*');
      }
    };
    stdin.on('data', onData);
  });
}

async function confirm(prompt: string): Promise<boolean> {
  const ans = await ask(`${C.yellow}${prompt} (y/N):${C.reset} `);
  return ans.toLowerCase() === 'y' || ans.toLowerCase() === 'yes';
}

async function confirmDangerous(prompt: string): Promise<boolean> {
  warn(prompt);
  const ans = await ask(`  Type ${C.red}YES${C.reset} to confirm: `);
  return ans === 'YES';
}

function pause() {
  return ask(`\n${C.dim}Press Enter to continue...${C.reset}`);
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function generatePassword(length = 24): string {
  return crypto.randomBytes(length).toString('base64url').slice(0, length);
}

async function detectDockerCompose(): Promise<string> {
  try {
    await execAsync('docker compose version');
    return 'docker compose';
  } catch {
    try {
      await execAsync('docker-compose version');
      return 'docker-compose';
    } catch {
      return 'docker compose';
    }
  }
}

// ---------------------------------------------------------------------------
// Database import helper (offline-safe)
// ---------------------------------------------------------------------------

let _dbCache: { db: any; schema: any } | null = null;
let _dbChecked = false;

async function tryImportDb(): Promise<{ db: any; schema: any }> {
  if (_dbCache) return _dbCache;
  if (_dbChecked) throw new Error('PostgreSQL is not available. Start it with: pnpm docker:up (or docker compose up -d postgres)');
  try {
    const mod = await import('../src/db/index.js');
    _dbCache = { db: mod.db, schema: mod };
    return _dbCache;
  } catch (e) {
    _dbChecked = true;
    throw new Error('PostgreSQL is not available. Start it with: pnpm docker:up (or docker compose up -d postgres)');
  }
}

function requiresDb(label: string): string {
  return `${label} ${C.dim}(requires DB)${C.reset}`;
}

// ---------------------------------------------------------------------------
// .env file helpers
// ---------------------------------------------------------------------------

async function readEnv(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const content = await readFile(ENV_PATH, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1).trim();
      map.set(key, value);
    }
  } catch {
    // .env may not exist yet
  }
  return map;
}

async function writeEnv(map: Map<string, string>): Promise<void> {
  // Preserve comments and order from existing file where possible
  let existing = '';
  try { existing = await readFile(ENV_PATH, 'utf-8'); } catch { /* ok */ }

  const lines = existing ? existing.split('\n') : [];
  const written = new Set<string>();

  const output: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      output.push(line);
      continue;
    }
    const idx = trimmed.indexOf('=');
    if (idx === -1) { output.push(line); continue; }
    const key = trimmed.slice(0, idx).trim();
    if (map.has(key)) {
      output.push(`${key}=${map.get(key)}`);
      written.add(key);
    } else {
      output.push(line);
    }
  }

  // Append any new keys not already in the file
  const newKeys: string[] = [];
  for (const [k] of map) {
    if (!written.has(k)) newKeys.push(k);
  }
  if (newKeys.length > 0) {
    output.push('');
    output.push('# Added by Exprsn CLI');
    for (const k of newKeys) output.push(`${k}=${map.get(k)}`);
  }

  await writeFile(ENV_PATH, output.join('\n'), 'utf-8');
}

function maskValue(key: string, value: string): string {
  const sensitiveKeys = ['SECRET', 'KEY', 'PASSWORD', 'TOKEN', 'URL', 'HASH', 'PASS'];
  if (sensitiveKeys.some((s) => key.toUpperCase().includes(s))) {
    if (value.length <= 8) return '***';
    return value.slice(0, 4) + '****' + value.slice(-2);
  }
  return value;
}

// ---------------------------------------------------------------------------
// Service health checks (direct TCP / HTTP without running API required)
// ---------------------------------------------------------------------------

async function checkPostgres(url?: string): Promise<boolean> {
  try {
    const connStr = url || process.env.DATABASE_URL || 'postgresql://exprsn:exprsn_dev@localhost:5432/exprsn';
    const { default: postgres } = await import('postgres');
    const sql = postgres(connStr, { connect_timeout: 3, max: 1 });
    await sql`SELECT 1`;
    await sql.end();
    return true;
  } catch {
    return false;
  }
}

async function checkRedis(url?: string): Promise<boolean> {
  try {
    const { Redis } = await import('ioredis');
    const redis = new Redis(url || process.env.REDIS_URL || 'redis://localhost:6379', {
      connectTimeout: 3000,
      lazyConnect: true,
    });
    await redis.connect();
    await redis.ping();
    redis.disconnect();
    return true;
  } catch {
    return false;
  }
}

async function checkS3(env: Map<string, string>): Promise<boolean> {
  try {
    const endpoint = env.get('DO_SPACES_ENDPOINT') || 'http://localhost:9000';
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(endpoint, { signal: controller.signal });
    clearTimeout(t);
    return res.status < 500;
  } catch {
    return false;
  }
}

async function checkApi(): Promise<{ ok: boolean; status?: number }> {
  try {
    const port = process.env.PORT || '3002';
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`http://localhost:${port}/health`, { signal: controller.signal });
    clearTimeout(t);
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false };
  }
}

// ---------------------------------------------------------------------------
// Menu helpers
// ---------------------------------------------------------------------------

async function menu(items: string[], prompt = 'Choose an option'): Promise<number> {
  console.log('');
  items.forEach((item, i) => {
    console.log(`  ${C.cyan}${i + 1})${C.reset} ${item}`);
  });
  console.log('');
  while (true) {
    const ans = await ask(`${C.bold}${prompt}:${C.reset} `);
    const n = parseInt(ans, 10);
    if (!isNaN(n) && n >= 1 && n <= items.length) return n;
    error(`Enter a number between 1 and ${items.length}`);
  }
}

// ---------------------------------------------------------------------------
// 1. First-Time Setup
// ---------------------------------------------------------------------------

async function firstTimeSetup() {
  header('First-Time Setup');

  // Step 1 — Prerequisites
  section('Step 1 of 5: Checking Prerequisites');
  const env = await readEnv();

  process.stdout.write('  Checking PostgreSQL... ');
  const dbOk = await checkPostgres(env.get('DATABASE_URL'));
  console.log(dbOk ? `${C.green}OK${C.reset}` : `${C.red}FAILED${C.reset}`);

  process.stdout.write('  Checking Redis...      ');
  const redisOk = await checkRedis(env.get('REDIS_URL'));
  console.log(redisOk ? `${C.green}OK${C.reset}` : `${C.red}FAILED${C.reset}`);

  process.stdout.write('  Checking S3/MinIO...   ');
  const s3Ok = await checkS3(env);
  console.log(s3Ok ? `${C.green}OK${C.reset}` : `${C.yellow}UNAVAILABLE${C.reset}`);

  if (!dbOk) {
    warn('PostgreSQL is not available. Steps requiring the database will be skipped.');
    info('You can configure environment, secrets, and services offline.');
    info('Start PostgreSQL later with: pnpm docker:up (or docker compose up -d postgres)');
    console.log('');
  }

  if (!redisOk) {
    warn('Redis is not reachable. Some features (queues, caching) will be degraded.');
    if (dbOk) {
      const cont = await confirm('Continue anyway?');
      if (!cont) return;
    }
  }

  // Step 2 — Generate secrets
  section('Step 2 of 5: Generating Secrets');

  let changed = false;
  if (!env.get('JWT_SECRET') || env.get('JWT_SECRET') === '') {
    const secret = crypto.randomBytes(32).toString('base64');
    env.set('JWT_SECRET', secret);
    success(`Generated JWT_SECRET`);
    changed = true;
  } else {
    info('JWT_SECRET already set — skipping');
  }

  if (!env.get('ENCRYPTION_KEY') || env.get('ENCRYPTION_KEY')?.startsWith('dev-encryption-key')) {
    const key = crypto.randomBytes(32).toString('hex');
    env.set('ENCRYPTION_KEY', key);
    success('Generated ENCRYPTION_KEY');
    changed = true;
  } else {
    info('ENCRYPTION_KEY already set — skipping');
  }

  if (!env.get('PREFETCH_AUTH_TOKEN') || env.get('PREFETCH_AUTH_TOKEN') === '') {
    const token = 'exp_' + crypto.randomBytes(24).toString('base64url');
    env.set('PREFETCH_AUTH_TOKEN', token);
    success('Generated PREFETCH_AUTH_TOKEN');
    changed = true;
  } else {
    info('PREFETCH_AUTH_TOKEN already set — skipping');
  }

  if (changed) {
    await writeEnv(env);
    success('Secrets written to .env');
  }

  // Step 3 — Create admin user
  section('Step 3 of 5: Create Admin User');

  if (!dbOk) {
    warn('Skipped — PostgreSQL not available. Run setup again after starting the database.');
  } else {
  console.log('  Enter details for the first admin account.\n');
  const handle = await ask(`  Handle (without @): `);
  const email  = await ask(`  Email: `);
  const pw1    = await askPassword(`  Password: `);
  const pw2    = await askPassword(`  Confirm Password: `);

  if (pw1 !== pw2) {
    error('Passwords do not match. Skipping user creation.');
  } else if (!handle || !email) {
    error('Handle and email are required. Skipping user creation.');
  } else {
    try {
      const { db, schema } = await tryImportDb();
      const bcrypt    = await import('bcryptjs');
      const { nanoid } = await import('nanoid');
      const { eq }    = await import('drizzle-orm');

      const did = `did:exprsn:${handle}`;
      const passwordHash = await bcrypt.default.hash(pw1, 12);

      // Check existing actorRepo
      const existing = await db.select().from(schema.actorRepos).where(eq(schema.actorRepos.handle, handle)).limit(1);
      if (existing.length > 0) {
        warn(`User @${handle} already exists in actorRepos — skipping creation`);
      } else {
        const keyPair = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
        const pubPem  = keyPair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
        const privPem = keyPair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

        await (db.insert(schema.actorRepos) as any).values({
          did,
          handle,
          email,
          passwordHash,
          signingKeyPublic: pubPem,
          signingKeyPrivate: privPem,
          status: 'active',
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        success(`Created PDS account: @${handle} (${did})`);

        // Also upsert into users table for the feed/social layer
        const userExists = await db.select().from(schema.users).where(eq(schema.users.did, did)).limit(1);
        if (userExists.length === 0) {
          await (db.insert(schema.users) as any).values({
            did,
            handle,
            displayName: handle,
            verified: false,
            followerCount: 0,
            followingCount: 0,
            videoCount: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
            indexedAt: new Date(),
          });
        }

        // Grant super_admin
        await (db.insert(schema.adminUsers) as any).values({
          id: nanoid(),
          userDid: did,
          role: 'super_admin',
          permissions: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        success(`Granted super_admin role to @${handle}`);
      }
    } catch (e) {
      error(`Failed to create user: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  } // end dbOk check for step 3

  // Step 4 — Service toggles
  section('Step 4 of 5: Service Configuration');
  const services: Array<[string, string]> = [
    ['PDS_ENABLED', 'AT Protocol Personal Data Server'],
    ['RELAY_ENABLED', 'Federation Relay / Firehose'],
  ];
  for (const [key, label] of services) {
    const current = env.get(key) ?? 'false';
    const enable = await confirm(`  Enable ${label}? (currently: ${current})`);
    env.set(key, enable ? 'true' : 'false');
  }
  await writeEnv(env);
  success('Service configuration saved');

  // Step 5 — DB migrations
  section('Step 5 of 5: Database Migrations');
  if (!dbOk) {
    warn('Skipped — PostgreSQL not available. Run migrations after starting the database:');
    info('  cd packages/api && npx drizzle-kit push --force');
  } else {
    const runMigrations = await confirm('  Run database migrations now (drizzle-kit push)?');
    if (runMigrations) {
      process.stdout.write('  Running drizzle-kit push... ');
      try {
        await execAsync('npx drizzle-kit push --force', { cwd: ROOT, env: { ...process.env } });
        console.log(`${C.green}done${C.reset}`);
        success('Schema pushed to database');
      } catch (e) {
        console.log(`${C.red}failed${C.reset}`);
        error(e instanceof Error ? e.message : String(e));
      }
    }
  }

  console.log('');
  success('First-time setup complete!');
  if (!dbOk) {
    info('Database steps were skipped. After starting PostgreSQL, run:');
    info('  pnpm admin   (then choose First-Time Setup again)');
  }
  info(`Start the API with: pnpm --filter @exprsn/api dev`);
  await pause();
}

// ---------------------------------------------------------------------------
// 2. Environment Configuration
// ---------------------------------------------------------------------------

interface EnvVarDef {
  key: string;
  label: string;
  default?: string;
  sensitive?: boolean;
  generator?: 'hex32' | 'hex16' | 'hex64' | 'prefetch';
  description: string;
}

interface EnvCategory {
  name: string;
  label: string;
  vars: EnvVarDef[];
}

const ENV_CATEGORIES: EnvCategory[] = [
  { name: 'core', label: 'Core Server', vars: [
    { key: 'NODE_ENV', label: 'Environment', default: 'production', description: 'production / development / staging' },
    { key: 'PORT', label: 'API Port', default: '3002', description: 'Port the API server listens on' },
    { key: 'HOST', label: 'Bind Address', default: '0.0.0.0', description: 'Host to bind to' },
    { key: 'APP_URL', label: 'App URL', default: 'https://exprsn.io', description: 'Public URL of the application' },
    { key: 'WEB_URL', label: 'Web URL', default: 'https://exprsn.io', description: 'Public URL of the web frontend' },
    { key: 'CORS_ORIGIN', label: 'CORS Origins', description: 'Comma-separated allowed origins' },
    { key: 'LOG_LEVEL', label: 'Log Level', default: 'info', description: 'debug / info / warn / error' },
  ]},
  { name: 'database', label: 'Database', vars: [
    { key: 'DATABASE_URL', label: 'PostgreSQL URL', sensitive: true, description: 'postgresql://user:pass@host:5432/db' },
  ]},
  { name: 'redis', label: 'Redis', vars: [
    { key: 'REDIS_URL', label: 'Redis URL', default: 'redis://localhost:6379', description: 'Redis connection string' },
  ]},
  { name: 'storage', label: 'Storage', vars: [
    { key: 'STORAGE_PROVIDER', label: 'Provider', default: 'local', description: 'local / s3 / spaces / azure' },
    { key: 'BLOB_STORAGE_TYPE', label: 'Blob Type', default: 'local', description: 'local / s3' },
    { key: 'LOCAL_STORAGE_PATH', label: 'Local Path', default: '/data/uploads', description: 'Local filesystem path' },
    { key: 'LOCAL_STORAGE_URL', label: 'Local URL', description: 'Public URL for local storage' },
    { key: 'DO_SPACES_ENDPOINT', label: 'DO Endpoint', description: 'DigitalOcean Spaces endpoint' },
    { key: 'DO_SPACES_REGION', label: 'DO Region', default: 'nyc3', description: 'DO Spaces region' },
    { key: 'DO_SPACES_BUCKET', label: 'DO Bucket', default: 'exprsn-uploads', description: 'DO Spaces bucket' },
    { key: 'DO_SPACES_KEY', label: 'DO Access Key', sensitive: true, description: 'DO Spaces access key' },
    { key: 'DO_SPACES_SECRET', label: 'DO Secret Key', sensitive: true, description: 'DO Spaces secret key' },
    { key: 'DO_SPACES_CDN', label: 'DO CDN URL', description: 'CDN URL for DO Spaces' },
    { key: 'S3_ENDPOINT', label: 'S3 Endpoint', description: 'S3-compatible endpoint URL' },
    { key: 'S3_ACCESS_KEY_ID', label: 'S3 Access Key', sensitive: true, description: 'S3 access key ID' },
    { key: 'S3_SECRET_ACCESS_KEY', label: 'S3 Secret Key', sensitive: true, description: 'S3 secret access key' },
    { key: 'S3_BUCKET', label: 'S3 Bucket', description: 'S3 bucket name' },
    { key: 'S3_REGION', label: 'S3 Region', description: 'S3 region' },
    { key: 'CDN_BASE_URL', label: 'CDN Base URL', description: 'CDN base URL for media' },
  ]},
  { name: 'security', label: 'Security', vars: [
    { key: 'JWT_SECRET', label: 'JWT Secret', sensitive: true, generator: 'hex32', description: 'JWT signing secret (auto-generate recommended)' },
    { key: 'ENCRYPTION_KEY', label: 'Encryption Key', sensitive: true, generator: 'hex16', description: 'AES encryption key (auto-generate recommended)' },
    { key: 'CA_ENCRYPTION_KEY', label: 'CA Encryption Key', sensitive: true, description: 'Certificate Authority encryption key' },
    { key: 'CA_ENABLED', label: 'CA Enabled', default: 'false', description: 'Enable internal Certificate Authority' },
    { key: 'TRUST_PROXY', label: 'Trust Proxy', default: 'true', description: 'Trust reverse proxy headers' },
  ]},
  { name: 'auth', label: 'Authentication', vars: [
    { key: 'AUTH_PROVIDER', label: 'Auth Provider', default: 'both', description: 'local / oauth / both' },
    { key: 'SESSION_TTL_HOURS', label: 'Session TTL (hrs)', default: '24', description: 'Session duration in hours' },
    { key: 'REFRESH_TTL_DAYS', label: 'Refresh TTL (days)', default: '30', description: 'Refresh token duration' },
    { key: 'MAX_SESSIONS', label: 'Max Sessions', default: '5', description: 'Max concurrent sessions per user' },
    { key: 'REQUIRE_EMAIL_VERIFICATION', label: 'Email Verification', default: 'false', description: 'Require email verification' },
    { key: 'MFA_ENABLED', label: 'MFA Enabled', default: 'false', description: 'Enable multi-factor auth' },
    { key: 'AUTH_RATE_LIMIT_PER_MINUTE', label: 'Auth Rate Limit', default: '10', description: 'Auth attempts per minute' },
    { key: 'DEV_AUTH_BYPASS', label: 'Dev Auth Bypass', default: 'false', description: 'Bypass auth in dev (NEVER in prod)' },
  ]},
  { name: 'oauth', label: 'OAuth / OIDC', vars: [
    { key: 'OAUTH_ENABLED', label: 'OAuth Enabled', default: 'true', description: 'Enable AT Protocol OAuth' },
    { key: 'OAUTH_CLIENT_ID', label: 'Client ID', description: 'OAuth client metadata URL' },
    { key: 'OAUTH_ISSUER', label: 'Issuer URL', description: 'OAuth issuer URL' },
    { key: 'OAUTH_ENCRYPTION_KEY', label: 'OAuth Enc Key', sensitive: true, generator: 'hex16', description: 'OAuth state encryption' },
    { key: 'OIDC_KEY_ENCRYPTION_SECRET', label: 'OIDC Secret', sensitive: true, generator: 'hex32', description: 'OIDC key encryption' },
    { key: 'NEXT_PUBLIC_OAUTH_CLIENT_ID', label: 'Public Client ID', description: 'Browser OAuth client ID' },
    { key: 'NEXT_PUBLIC_OAUTH_REDIRECT_URI', label: 'Redirect URI', description: 'OAuth redirect URI' },
  ]},
  { name: 'federation', label: 'Federation / AT Protocol', vars: [
    { key: 'PDS_ENABLED', label: 'PDS Enabled', default: 'true', description: 'Enable Personal Data Server' },
    { key: 'PDS_DOMAIN', label: 'PDS Domain', description: 'PDS domain name' },
    { key: 'PDS_ENDPOINT', label: 'PDS Endpoint', description: 'PDS XRPC endpoint URL' },
    { key: 'PDS_URL', label: 'PDS URL', default: 'https://public.api.bsky.app', description: 'Remote PDS URL' },
    { key: 'SERVICE_DID', label: 'Service DID', description: 'Platform service DID (did:web:...)' },
    { key: 'SERVICE_DOMAIN', label: 'Service Domain', description: 'Platform domain' },
    { key: 'DID_METHOD', label: 'DID Method', default: 'plc', description: 'plc / web / exprn' },
    { key: 'HANDLE_SUFFIX', label: 'Handle Suffix', description: 'Handle domain suffix' },
    { key: 'PLC_ENABLED', label: 'PLC Enabled', default: 'false', description: 'Run own PLC directory' },
    { key: 'PLC_MODE', label: 'PLC Mode', default: 'external', description: 'standalone / external' },
    { key: 'PLC_URL', label: 'PLC URL', default: 'https://plc.directory', description: 'PLC directory URL' },
    { key: 'PLC_DOMAIN', label: 'PLC Domain', default: 'plc.directory', description: 'PLC domain' },
    { key: 'RELAY_ENABLED', label: 'Relay Enabled', default: 'true', description: 'Enable firehose relay' },
    { key: 'RELAY_SOCKETIO', label: 'Relay Socket.IO', default: 'true', description: 'Enable Socket.IO relay' },
    { key: 'RELAY_WEBSOCKET', label: 'Relay WebSocket', default: 'true', description: 'Enable WebSocket relay' },
    { key: 'RELAY_JETSTREAM', label: 'Relay Jetstream', default: 'true', description: 'Enable Jetstream relay' },
    { key: 'RELAY_MAX_WS_SUBSCRIBERS', label: 'Max WS Subs', default: '1000', description: 'Max WebSocket subscribers' },
    { key: 'RELAY_MAX_JETSTREAM_SUBSCRIBERS', label: 'Max JS Subs', default: '5000', description: 'Max Jetstream subscribers' },
    { key: 'JETSTREAM_URL', label: 'Jetstream URL', default: 'wss://jetstream2.us-east.bsky.network/subscribe', description: 'Jetstream endpoint' },
    { key: 'FEDERATION_CONSUMER_ENABLED', label: 'Consumer Enabled', default: 'true', description: 'Enable federation consumer' },
  ]},
  { name: 'video', label: 'Video Processing', vars: [
    { key: 'RENDER_ENABLED', label: 'Render Enabled', default: 'true', description: 'Enable render pipeline' },
    { key: 'FFMPEG_PATH', label: 'FFmpeg Path', default: '/usr/bin/ffmpeg', description: 'Path to ffmpeg binary' },
    { key: 'FFPROBE_PATH', label: 'FFprobe Path', default: '/usr/bin/ffprobe', description: 'Path to ffprobe binary' },
    { key: 'VIDEO_PRESETS', label: 'Video Presets', default: '360p,480p,720p,1080p', description: 'Transcoding presets' },
    { key: 'GENERATE_ANIMATED_PREVIEW', label: 'Animated Preview', default: 'true', description: 'Generate animated previews' },
    { key: 'GPU_ENABLED', label: 'GPU Enabled', default: 'false', description: 'Enable GPU acceleration' },
    { key: 'MAX_CONCURRENT_RENDERS', label: 'Max Renders', default: '3', description: 'Max concurrent renders' },
    { key: 'RENDER_WORKER_CONCURRENCY', label: 'Worker Concurrency', default: '2', description: 'Render worker concurrency' },
    { key: 'RENDER_COOLDOWN_SECONDS', label: 'Render Cooldown', default: '10', description: 'Cooldown between renders (sec)' },
    { key: 'RENDER_TEMP_DIR', label: 'Render Temp Dir', default: '/tmp/renders', description: 'Temporary render directory' },
    { key: 'RENDER_OUTPUT_DIR', label: 'Render Output Dir', default: '/data/renders', description: 'Render output directory' },
    { key: 'TRANSCODE_WORKER_ENABLED', label: 'Transcode Worker', default: 'true', description: 'Enable transcode worker' },
    { key: 'TRANSCODE_WORKER_CONCURRENCY', label: 'Transcode Concurrency', default: '2', description: 'Transcode concurrency' },
    { key: 'WORKER_CONCURRENCY', label: 'Worker Concurrency', default: '2', description: 'General worker concurrency' },
  ]},
  { name: 'prefetch', label: 'Prefetch / Caching', vars: [
    { key: 'PREFETCH_ENABLED', label: 'Prefetch Enabled', default: 'true', description: 'Enable prefetch engine' },
    { key: 'PREFETCH_PRODUCER_ENABLED', label: 'Producer Enabled', default: 'true', description: 'Enable prefetch producer' },
    { key: 'PREFETCH_AUTH_TOKEN', label: 'Auth Token', sensitive: true, generator: 'prefetch', description: 'Prefetch worker token' },
    { key: 'PREFETCH_CONCURRENCY', label: 'Concurrency', default: '50', description: 'Prefetch concurrency' },
    { key: 'PREFETCH_DEFAULT_LIMIT', label: 'Default Limit', default: '20', description: 'Default prefetch limit' },
    { key: 'HOT_CACHE_TTL', label: 'Hot Cache TTL', default: '300000', description: 'Hot cache TTL (ms)' },
    { key: 'WARM_CACHE_TTL', label: 'Warm Cache TTL', default: '900000', description: 'Warm cache TTL (ms)' },
    { key: 'COLD_CACHE_TTL', label: 'Cold Cache TTL', default: '3600000', description: 'Cold cache TTL (ms)' },
  ]},
  { name: 'email', label: 'Email / SMTP', vars: [
    { key: 'SMTP_HOST', label: 'SMTP Host', default: 'localhost', description: 'SMTP server hostname' },
    { key: 'SMTP_PORT', label: 'SMTP Port', default: '587', description: 'SMTP server port' },
    { key: 'SMTP_USER', label: 'SMTP User', sensitive: true, description: 'SMTP username' },
    { key: 'SMTP_PASS', label: 'SMTP Password', sensitive: true, description: 'SMTP password' },
    { key: 'SMTP_SECURE', label: 'SMTP TLS', default: 'false', description: 'Use TLS for SMTP' },
    { key: 'EMAIL_FROM', label: 'From Address', default: 'noreply@exprsn.io', description: 'Sender email address' },
    { key: 'EMAIL_FROM_NAME', label: 'From Name', default: 'Exprsn', description: 'Sender display name' },
    { key: 'SUPPORT_EMAIL', label: 'Support Email', description: 'Support contact email' },
  ]},
  { name: 'monitoring', label: 'Monitoring', vars: [
    { key: 'METRICS_ENABLED', label: 'Metrics Enabled', default: 'true', description: 'Enable Prometheus metrics' },
    { key: 'GRAFANA_ADMIN_USER', label: 'Grafana User', default: 'admin', description: 'Grafana admin username' },
    { key: 'GRAFANA_ADMIN_PASSWORD', label: 'Grafana Password', sensitive: true, description: 'Grafana admin password' },
    { key: 'GRAFANA_ROOT_URL', label: 'Grafana URL', description: 'Grafana root URL' },
  ]},
  { name: 'branding', label: 'Branding / Admin', vars: [
    { key: 'PLATFORM_NAME', label: 'Platform Name', default: 'Exprsn.io', description: 'Platform display name' },
    { key: 'PLATFORM_ACCENT_COLOR', label: 'Accent Color', default: '#f83b85', description: 'Primary accent color (hex)' },
    { key: 'ADMIN_USERNAME', label: 'Admin Username', default: 'admin', description: 'Default admin username' },
    { key: 'ADMIN_EMAIL', label: 'Admin Email', description: 'Admin contact email' },
  ]},
  { name: 'push', label: 'Push Notifications', vars: [
    { key: 'APNS_BUNDLE_ID', label: 'APNS Bundle ID', default: 'io.exprsn.app', description: 'Apple push bundle ID' },
    { key: 'APNS_KEY_ID', label: 'APNS Key ID', description: 'Apple push key ID' },
    { key: 'APNS_TEAM_ID', label: 'APNS Team ID', description: 'Apple team ID' },
    { key: 'APNS_KEY_PATH', label: 'APNS Key Path', description: 'Path to .p8 key file' },
    { key: 'FIREBASE_PROJECT_ID', label: 'Firebase Project', description: 'Firebase project ID' },
    { key: 'FIREBASE_CLIENT_EMAIL', label: 'Firebase Email', description: 'Firebase client email' },
    { key: 'FIREBASE_PRIVATE_KEY', label: 'Firebase Key', sensitive: true, description: 'Firebase private key' },
    { key: 'NEXT_PUBLIC_VAPID_PUBLIC_KEY', label: 'VAPID Public Key', description: 'Web push VAPID key' },
  ]},
  { name: 'ai', label: 'AI / Moderation', vars: [
    { key: 'ANTHROPIC_API_KEY', label: 'Anthropic API Key', sensitive: true, description: 'Anthropic (Claude) API key' },
    { key: 'OPENAI_API_KEY', label: 'OpenAI API Key', sensitive: true, description: 'OpenAI API key' },
    { key: 'DEEPSEEK_API_KEY', label: 'DeepSeek API Key', sensitive: true, description: 'DeepSeek API key' },
  ]},
  { name: 'payments', label: 'Payments', vars: [
    { key: 'STRIPE_SECRET_KEY', label: 'Stripe Secret', sensitive: true, description: 'Stripe secret key' },
    { key: 'STRIPE_WEBHOOK_SECRET', label: 'Stripe Webhook', sensitive: true, description: 'Stripe webhook secret' },
    { key: 'PAYPAL_CLIENT_ID', label: 'PayPal Client ID', description: 'PayPal client ID' },
    { key: 'PAYPAL_CLIENT_SECRET', label: 'PayPal Secret', sensitive: true, description: 'PayPal client secret' },
  ]},
  { name: 'docker', label: 'Docker Service Credentials', vars: [
    { key: 'POSTGRES_USER', label: 'Postgres User', default: 'exprsn', description: 'PostgreSQL username' },
    { key: 'POSTGRES_PASSWORD', label: 'Postgres Password', sensitive: true, description: 'PostgreSQL password' },
    { key: 'MINIO_ROOT_USER', label: 'MinIO User', default: 'minioadmin', description: 'MinIO root user' },
    { key: 'MINIO_ROOT_PASSWORD', label: 'MinIO Password', sensitive: true, description: 'MinIO root password' },
    { key: 'RABBITMQ_DEFAULT_USER', label: 'RabbitMQ User', default: 'guest', description: 'RabbitMQ username' },
    { key: 'RABBITMQ_DEFAULT_PASS', label: 'RabbitMQ Password', sensitive: true, description: 'RabbitMQ password' },
    { key: 'OPENSEARCH_INITIAL_ADMIN_PASSWORD', label: 'OpenSearch Password', sensitive: true, description: 'OpenSearch admin password' },
  ]},
];

function generateSecretValue(generator: string): string {
  switch (generator) {
    case 'hex16': return crypto.randomBytes(16).toString('hex');
    case 'hex32': return crypto.randomBytes(32).toString('hex');
    case 'hex64': return crypto.randomBytes(64).toString('hex');
    case 'prefetch': return 'exp_' + crypto.randomBytes(24).toString('base64url');
    default: return crypto.randomBytes(32).toString('hex');
  }
}

async function envConfig() {
  while (true) {
    header('Environment Configuration');
    const choice = await menu([
      'View all variables',
      'Edit a variable',
      'Add a new variable',
      'Generate complete .env file',
      'Import .env template',
      'Validate configuration',
      'Back',
    ]);

    if (choice === 7) return;

    if (choice === 1) {
      // View all vars
      const env = await readEnv();
      console.log('');
      const rows: [string, string][] = [];
      for (const [k, v] of env) rows.push([k, maskValue(k, v)]);
      table(rows, 36);
      await pause();

    } else if (choice === 2) {
      // Edit a variable
      const env = await readEnv();
      const key = await ask('  Variable name: ');
      if (!env.has(key)) {
        error(`Variable ${key} not found. Use "Add a new variable" to create it.`);
        await pause();
        continue;
      }
      const current = env.get(key)!;
      info(`Current value: ${maskValue(key, current)}`);
      const isSensitive = ['SECRET', 'KEY', 'PASSWORD', 'TOKEN', 'HASH'].some((s) => key.toUpperCase().includes(s));
      const newVal = isSensitive
        ? await askPassword(`  New value: `)
        : await ask(`  New value: `);
      if (newVal !== '') {
        env.set(key, newVal);
        await writeEnv(env);
        success(`Updated ${key}`);
      } else {
        warn('No value entered — skipped');
      }
      await pause();

    } else if (choice === 3) {
      // Add new variable
      const env = await readEnv();
      const key = await ask('  Variable name: ');
      if (!key) { error('Name is required'); await pause(); continue; }
      const val = await ask('  Value: ');
      env.set(key, val);
      await writeEnv(env);
      success(`Added ${key}`);
      await pause();

    } else if (choice === 4) {
      // Generate complete .env file
      section('Generate Environment File');
      const envIdx = await menu(['Production', 'Development', 'Staging'], 'Target environment');
      const envNames = ['production', 'development', 'staging'];
      const targetEnv = envNames[envIdx - 1];
      const defaultPaths: Record<string, string> = {
        production: resolve(MONOREPO_ROOT, '.env.production'),
        development: resolve(MONOREPO_ROOT, '.env'),
        staging: resolve(MONOREPO_ROOT, '.env.staging'),
      };
      const pathInput = await ask(`  Output file (default: ${defaultPaths[targetEnv]}): `);
      const outputPath = pathInput || defaultPaths[targetEnv];

      const result = new Map<string, string>();

      for (const cat of ENV_CATEGORIES) {
        const include = await confirm(`  Configure ${C.bold}${cat.label}${C.reset}?`);
        if (!include) continue;
        console.log(`\n  ${C.dim}── ${cat.label} ──${C.reset}`);

        for (const v of cat.vars) {
          let defaultVal = v.default ?? '';
          if (targetEnv === 'production' && v.key === 'DEV_AUTH_BYPASS') defaultVal = 'false';
          if (targetEnv === 'production' && v.key === 'NODE_ENV') defaultVal = 'production';
          if (targetEnv === 'development' && v.key === 'NODE_ENV') defaultVal = 'development';
          if (targetEnv === 'staging' && v.key === 'NODE_ENV') defaultVal = 'staging';

          const defaultHint = defaultVal ? ` ${C.dim}(default: ${defaultVal})${C.reset}` : '';
          console.log(`  ${C.cyan}${v.label}${C.reset}: ${v.description}${defaultHint}`);

          if (v.generator) {
            const autoGen = await confirm(`    Auto-generate ${v.label}?`);
            if (autoGen) {
              const val = generateSecretValue(v.generator);
              result.set(v.key, val);
              success(`    Generated ${v.key}`);
              continue;
            }
          }

          let val: string;
          if (v.sensitive) {
            val = await askPassword(`    Value: `);
          } else {
            val = await ask(`    Value: `);
          }
          if (val) {
            result.set(v.key, val);
          } else if (defaultVal) {
            result.set(v.key, defaultVal);
            dim(`    Using default: ${defaultVal}`);
          }
        }
        console.log('');
      }

      if (result.size === 0) {
        warn('No variables configured');
        await pause();
        continue;
      }

      section('Summary');
      info(`${result.size} variables configured for ${targetEnv}`);
      const rows: [string, string][] = [];
      for (const [k, v] of result) rows.push([k, maskValue(k, v)]);
      table(rows, 38);

      const doWrite = await confirm(`\n  Write to ${outputPath}?`);
      if (doWrite) {
        const lines: string[] = [
          `# Exprsn ${targetEnv.charAt(0).toUpperCase() + targetEnv.slice(1)} Environment`,
          `# Generated by Exprsn CLI on ${new Date().toISOString().slice(0, 10)}`,
          '',
        ];
        let lastCat = '';
        for (const cat of ENV_CATEGORIES) {
          const catVars = cat.vars.filter((v) => result.has(v.key));
          if (catVars.length === 0) continue;
          if (lastCat !== cat.name) {
            lines.push(`# --- ${cat.label} ---`);
            lastCat = cat.name;
          }
          for (const v of catVars) {
            lines.push(`${v.key}=${result.get(v.key)}`);
          }
          lines.push('');
        }
        await writeFile(outputPath, lines.join('\n'), 'utf-8');
        success(`Written to ${outputPath}`);
      } else {
        info('Aborted');
      }
      await pause();

    } else if (choice === 5) {
      // Import .env template
      section('Import Template');
      const templatePath = await ask(`  Template file path (e.g. .env.production.example): `);
      if (!templatePath) { error('Path required'); await pause(); continue; }
      try {
        const fullPath = resolve(MONOREPO_ROOT, templatePath);
        const content = await readFile(fullPath, 'utf-8');
        const templateVars = new Map<string, string>();
        for (const line of content.split('\n')) {
          const t = line.trim();
          if (!t || t.startsWith('#')) continue;
          const idx = t.indexOf('=');
          if (idx === -1) continue;
          templateVars.set(t.slice(0, idx).trim(), t.slice(idx + 1).trim());
        }
        const env = await readEnv();
        let newCount = 0; let updateCount = 0;
        for (const [k, v] of templateVars) {
          if (!env.has(k)) { newCount++; } else if (env.get(k) !== v) { updateCount++; }
        }
        info(`Template has ${templateVars.size} variables: ${newCount} new, ${updateCount} different`);
        const doMerge = await confirm('  Merge into current .env?');
        if (doMerge) {
          for (const [k, v] of templateVars) env.set(k, v);
          await writeEnv(env);
          success(`Merged ${templateVars.size} variables`);
        }
      } catch (e) {
        error(`Failed to read template: ${e instanceof Error ? e.message : String(e)}`);
      }
      await pause();

    } else if (choice === 6) {
      // Validate
      const env = await readEnv();
      const required = [
        'DATABASE_URL', 'REDIS_URL', 'JWT_SECRET', 'ENCRYPTION_KEY',
        'PORT', 'APP_URL',
      ];
      const missing = required.filter((k) => !env.has(k) || !env.get(k));
      console.log('');
      if (missing.length === 0) {
        success('All required variables are set');
      } else {
        error(`Missing required variables:`);
        for (const k of missing) console.log(`    ${C.red}${k}${C.reset}`);
      }

      const encKey = env.get('ENCRYPTION_KEY') ?? '';
      if (encKey.startsWith('dev-encryption-key')) {
        warn('ENCRYPTION_KEY is still the default dev value — change for production');
      }
      const jwtSecret = env.get('JWT_SECRET') ?? '';
      if (jwtSecret.length < 32) {
        warn('JWT_SECRET should be at least 32 characters for security');
      }
      await pause();
    }
  }
}

// ---------------------------------------------------------------------------
// 3. User Management
// ---------------------------------------------------------------------------

async function userManagement() {
  while (true) {
    header('User Management');
    const choice = await menu([
      'List users',
      'Search by handle',
      'Create new user',
      'Set user role',
      'Reset user password',
      'Ban / Unban user',
      'Back',
    ]);

    if (choice === 7) return;

    if (choice === 1) {
      // List users
      try {
        const { db, schema } = await tryImportDb();
        const { desc } = await import('drizzle-orm');
        const offsetStr = await ask('  Page (0-based, default 0): ');
        const page = parseInt(offsetStr || '0', 10) || 0;
        const rows = await db.select({
          did: schema.users.did,
          handle: schema.users.handle,
          displayName: schema.users.displayName,
          videoCount: schema.users.videoCount,
          createdAt: schema.users.createdAt,
        }).from(schema.users).orderBy(desc(schema.users.createdAt)).limit(20).offset(page * 20);

        console.log('');
        if (rows.length === 0) { info('No users found'); } else {
          console.log(`  ${C.bold}${'Handle'.padEnd(24)}${'Display Name'.padEnd(24)}${'Videos'.padEnd(8)}${'Created'.padEnd(22)}${C.reset}`);
          dim('  ' + '─'.repeat(78));
          for (const u of rows) {
            const dn = (u.displayName ?? '—').slice(0, 22);
            const created = u.createdAt.toISOString().slice(0, 10);
            console.log(`  ${('@' + u.handle).padEnd(24)}${dn.padEnd(24)}${String(u.videoCount).padEnd(8)}${created}`);
          }
          info(`Showing page ${page} (20/page)`);
        }
      } catch (e) {
        error(e instanceof Error ? e.message : String(e));
      }
      await pause();

    } else if (choice === 2) {
      // Search
      const query = await ask('  Handle (partial match): ');
      try {
        const { db, schema } = await tryImportDb();
        const { like } = await import('drizzle-orm');
        const rows = await db.select().from(schema.users)
          .where(like(schema.users.handle, `%${query}%`)).limit(10);
        console.log('');
        if (rows.length === 0) { info('No users found'); } else {
          for (const u of rows) {
            console.log(`  ${C.cyan}@${u.handle}${C.reset}  ${C.dim}${u.did}${C.reset}  videos:${u.videoCount}`);
          }
        }
      } catch (e) {
        error(e instanceof Error ? e.message : String(e));
      }
      await pause();

    } else if (choice === 3) {
      // Create user
      const handle = await ask('  Handle (without @): ');
      const email  = await ask('  Email: ');
      const pw     = await askPassword('  Password: ');
      if (!handle || !email || !pw) { error('All fields required'); await pause(); continue; }
      try {
        const { db, schema } = await tryImportDb();
        const bcrypt     = await import('bcryptjs');
        const { nanoid } = await import('nanoid');
        const { eq }     = await import('drizzle-orm');

        const did = `did:exprsn:${handle}`;
        const passwordHash = await bcrypt.default.hash(pw, 12);
        const keyPair = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
        const pubPem  = keyPair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
        const privPem = keyPair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

        await (db.insert(schema.actorRepos) as any).values({
          did, handle, email, passwordHash,
          signingKeyPublic: pubPem, signingKeyPrivate: privPem,
          status: 'active', createdAt: new Date(), updatedAt: new Date(),
        });

        const userExists = await db.select().from(schema.users).where(eq(schema.users.did, did)).limit(1);
        if (userExists.length === 0) {
          await (db.insert(schema.users) as any).values({
            did, handle, displayName: handle, verified: false,
            followerCount: 0, followingCount: 0, videoCount: 0,
            createdAt: new Date(), updatedAt: new Date(), indexedAt: new Date(),
          });
        }
        success(`Created user @${handle} (${did})`);
      } catch (e) {
        error(e instanceof Error ? e.message : String(e));
      }
      await pause();

    } else if (choice === 4) {
      // Set role
      const handle = await ask('  Handle (without @): ');
      console.log('');
      const roleIdx = await menu(['super_admin', 'admin', 'moderator', 'support', 'Remove admin role'], 'Select role');
      try {
        const { db, schema } = await tryImportDb();
        const { nanoid } = await import('nanoid');
        const { eq }     = await import('drizzle-orm');

        const userRows = await db.select().from(schema.users)
          .where(eq(schema.users.handle, handle)).limit(1);
        if (userRows.length === 0) { error(`User @${handle} not found`); await pause(); continue; }
        const did = userRows[0].did;

        if (roleIdx === 5) {
          await db.delete(schema.adminUsers).where(eq(schema.adminUsers.userDid, did));
          success(`Removed admin role from @${handle}`);
        } else {
          const roles = ['super_admin', 'admin', 'moderator', 'support'];
          const role  = roles[roleIdx - 1];
          const existing = await db.select().from(schema.adminUsers)
            .where(eq(schema.adminUsers.userDid, did)).limit(1);
          if (existing.length > 0) {
            await (db.update(schema.adminUsers) as any)
              .set({ role, updatedAt: new Date() })
              .where(eq(schema.adminUsers.userDid, did));
          } else {
            await (db.insert(schema.adminUsers) as any).values({
              id: nanoid(), userDid: did, role, permissions: [],
              createdAt: new Date(), updatedAt: new Date(),
            });
          }
          success(`Set @${handle} as ${role}`);
        }
      } catch (e) {
        error(e instanceof Error ? e.message : String(e));
      }
      await pause();

    } else if (choice === 5) {
      // Reset password
      const handle = await ask('  Handle (without @): ');
      const newPw  = await askPassword('  New password: ');
      if (!newPw) { error('Password required'); await pause(); continue; }
      try {
        const { db, schema } = await tryImportDb();
        const bcrypt   = await import('bcryptjs');
        const { eq }   = await import('drizzle-orm');
        const hash = await bcrypt.default.hash(newPw, 12);
        await (db.update(schema.actorRepos) as any)
          .set({ passwordHash: hash, updatedAt: new Date() })
          .where(eq(schema.actorRepos.handle, handle));
        success(`Password updated for @${handle}`);
      } catch (e) {
        error(e instanceof Error ? e.message : String(e));
      }
      await pause();

    } else if (choice === 6) {
      // Ban / Unban
      const handle  = await ask('  Handle (without @): ');
      const banIdx  = await menu(['Ban user', 'Unban user'], 'Action');
      const newStatus = banIdx === 1 ? 'suspended' : 'active';
      try {
        const { db, schema } = await tryImportDb();
        const { eq }  = await import('drizzle-orm');
        await (db.update(schema.actorRepos) as any)
          .set({ status: newStatus, updatedAt: new Date() })
          .where(eq(schema.actorRepos.handle, handle));
        success(`@${handle} is now ${newStatus}`);
      } catch (e) {
        error(e instanceof Error ? e.message : String(e));
      }
      await pause();
    }
  }
}

// ---------------------------------------------------------------------------
// 4. Database Operations
// ---------------------------------------------------------------------------

async function databaseOps() {
  while (true) {
    header('Database Operations');
    const choice = await menu([
      'Check connection',
      'Show table row counts',
      'Run migrations (drizzle-kit push)',
      'Seed demo data',
      'Truncate ALL tables',
      'Back',
    ]);

    if (choice === 6) return;

    if (choice === 1) {
      const env = await readEnv();
      process.stdout.write('  PostgreSQL... ');
      const ok = await checkPostgres(env.get('DATABASE_URL'));
      console.log(ok ? `${C.green}Connected${C.reset}` : `${C.red}Failed${C.reset}`);
      process.stdout.write('  Redis...      ');
      const rok = await checkRedis(env.get('REDIS_URL'));
      console.log(rok ? `${C.green}Connected${C.reset}` : `${C.red}Failed${C.reset}`);
      await pause();

    } else if (choice === 2) {
      try {
        const { db, schema } = await tryImportDb();
        const { sql }  = await import('drizzle-orm');

        const tables: Array<[string, unknown]> = [
          ['users',             schema.users],
          ['actorRepos',        schema.actorRepos],
          ['videos',            schema.videos],
          ['likes',             schema.likes],
          ['comments',          schema.comments],
          ['follows',           schema.follows],
          ['sessions',          schema.sessions],
          ['adminUsers',        schema.adminUsers],
          ['contentReports',    schema.contentReports],
          ['uploadJobs',        schema.uploadJobs],
          ['sounds',            schema.sounds],
          ['hashtags',          schema.hashtags],
        ];

        console.log('');
        const rows: [string, string][] = [];
        for (const [name, tbl] of tables) {
          try {
            const res = await (db as any).select({ count: sql<number>`count(*)` }).from(tbl);
            rows.push([name, String(res[0]?.count ?? 0)]);
          } catch {
            rows.push([name, '—']);
          }
        }
        table(rows);
      } catch (e) {
        error(e instanceof Error ? e.message : String(e));
      }
      await pause();

    } else if (choice === 3) {
      process.stdout.write('  Running drizzle-kit push --force... ');
      try {
        await execAsync('npx drizzle-kit push --force', { cwd: ROOT });
        console.log(`${C.green}done${C.reset}`);
      } catch (e) {
        console.log(`${C.red}failed${C.reset}`);
        error(e instanceof Error ? e.message : String(e));
      }
      await pause();

    } else if (choice === 4) {
      info('Running seed script: scripts/seed.ts');
      try {
        const { stdout, stderr } = await execAsync('npx tsx scripts/seed.ts', { cwd: ROOT });
        if (stdout) process.stdout.write(stdout);
        if (stderr) process.stderr.write(stderr);
        success('Seed complete');
      } catch (e) {
        error(e instanceof Error ? e.message : String(e));
      }
      await pause();

    } else if (choice === 5) {
      const confirmed = await confirmDangerous('This will DELETE ALL DATA in every table. This cannot be undone.');
      if (!confirmed) { info('Aborted'); await pause(); continue; }
      try {
        const { db, schema } = await tryImportDb();
        const { sql } = await import('drizzle-orm');

        // Disable FK checks, truncate in safe order, re-enable
        await (db as any).execute(sql`SET session_replication_role = 'replica'`);
        const tables = [
          schema.moderationActions, schema.contentReports, schema.adminUsers,
          schema.sessions, schema.videoReactions, schema.commentReactions,
          schema.comments, schema.likes, schema.follows,
          schema.userInteractions, schema.videoViews, schema.videoHashtags,
          schema.trendingVideos, schema.videoEmbeddings, schema.uploadJobs,
          schema.videos, schema.hashtags, schema.trendingHashtags,
          schema.hashtagFollows, schema.sounds, schema.userSettings,
          schema.repoBlocks, schema.repoRecords, schema.repoCommits,
          schema.blobs, schema.actorRepos, schema.users,
        ];
        for (const tbl of tables) {
          try { await (db as any).delete(tbl); } catch { /* ignore */ }
        }
        await (db as any).execute(sql`SET session_replication_role = 'origin'`);
        success('All tables truncated');
      } catch (e) {
        error(e instanceof Error ? e.message : String(e));
      }
      await pause();
    }
  }
}

// ---------------------------------------------------------------------------
// 5. Service Status
// ---------------------------------------------------------------------------

async function serviceStatus() {
  header('Service Status');

  const env = await readEnv();

  section('Infrastructure');
  process.stdout.write('  PostgreSQL   ');
  const dbOk = await checkPostgres(env.get('DATABASE_URL'));
  console.log(dbOk ? `${C.green}● Connected${C.reset}` : `${C.red}● Unreachable${C.reset}`);

  process.stdout.write('  Redis        ');
  const redisOk = await checkRedis(env.get('REDIS_URL'));
  console.log(redisOk ? `${C.green}● Connected${C.reset}` : `${C.red}● Unreachable${C.reset}`);

  process.stdout.write('  S3 / MinIO   ');
  const s3Ok = await checkS3(env);
  console.log(s3Ok ? `${C.green}● Reachable${C.reset}` : `${C.yellow}● Unreachable${C.reset}`);

  process.stdout.write('  API server   ');
  const api = await checkApi();
  console.log(api.ok ? `${C.green}● Running (HTTP ${api.status})${C.reset}` : `${C.yellow}● Not running${C.reset}`);

  // BullMQ queue stats via Redis
  if (redisOk) {
    section('BullMQ Queues');
    try {
      const { Queue } = await import('bullmq');
      const redisUrl = env.get('REDIS_URL') || 'redis://localhost:6379';
      const [host, port] = (redisUrl.replace('redis://', '').split(':'));
      const conn = { host: host || 'localhost', port: parseInt(port || '6379', 10) };

      const queueNames = [
        'render-jobs', 'transcode-jobs', 'federation', 'notifications',
        'email', 'moderation', 'analytics',
      ];

      const rows: [string, string][] = [];
      for (const name of queueNames) {
        try {
          const q = new Queue(name, { connection: conn });
          const [waiting, active, completed, failed] = await Promise.all([
            q.getWaitingCount(), q.getActiveCount(),
            q.getCompletedCount(), q.getFailedCount(),
          ]);
          await q.close();
          rows.push([name, `wait:${waiting}  active:${active}  done:${completed}  fail:${failed}`]);
        } catch {
          rows.push([name, `${C.dim}unavailable${C.reset}`]);
        }
      }
      table(rows, 22);
    } catch (e) {
      warn('Could not fetch queue stats: ' + (e instanceof Error ? e.message : String(e)));
    }
  } else {
    warn('Redis unavailable — queue stats skipped');
  }

  await pause();
}

// ---------------------------------------------------------------------------
// 6. Security
// ---------------------------------------------------------------------------

async function security() {
  while (true) {
    header('Security');
    const choice = await menu([
      'Generate new JWT secret',
      'Generate prefetch worker token',
      'Generate setup token (one-time)',
      'Rotate encryption key',
      'View certificate status',
      'Back',
    ]);

    if (choice === 6) return;

    if (choice === 1) {
      const confirmed = await confirm('Generate and write a new JWT_SECRET to .env?');
      if (!confirmed) { await pause(); continue; }
      const secret = crypto.randomBytes(32).toString('base64');
      const env = await readEnv();
      env.set('JWT_SECRET', secret);
      await writeEnv(env);
      success('New JWT_SECRET written to .env');
      warn('All existing sessions are now invalid. Users must re-authenticate.');
      await pause();

    } else if (choice === 2) {
      const token = 'exp_' + crypto.randomBytes(24).toString('base64url');
      const env = await readEnv();
      env.set('PREFETCH_AUTH_TOKEN', token);
      await writeEnv(env);
      success('New PREFETCH_AUTH_TOKEN written to .env');
      console.log(`\n  ${C.bold}Token:${C.reset} ${C.cyan}${token}${C.reset}\n`);
      await pause();

    } else if (choice === 3) {
      const token = crypto.randomBytes(32).toString('hex');
      const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      console.log('');
      console.log(`  ${C.bold}One-time setup token (valid 24h):${C.reset}`);
      console.log(`  ${C.cyan}${token}${C.reset}`);
      console.log(`  ${C.dim}Expires: ${expires}${C.reset}`);
      info('This token is not persisted — copy it now.');
      await pause();

    } else if (choice === 4) {
      const confirmed = await confirmDangerous(
        'Rotating the encryption key will invalidate all encrypted payment credentials stored in the database.'
      );
      if (!confirmed) { info('Aborted'); await pause(); continue; }
      const newKey = crypto.randomBytes(32).toString('hex');
      const env = await readEnv();
      const old = env.get('ENCRYPTION_KEY');
      env.set('ENCRYPTION_KEY', newKey);
      await writeEnv(env);
      success('New ENCRYPTION_KEY written to .env');
      warn(`Old key was: ${old ? maskValue('ENCRYPTION_KEY', old) : '(not set)'}`);
      warn('Run: pnpm --filter @exprsn/api encrypt:credentials to re-encrypt stored data.');
      await pause();

    } else if (choice === 5) {
      try {
        const { db, schema } = await tryImportDb();
        const { desc }   = await import('drizzle-orm');

        // Check if table exists
        const certs = await (db as any).select({
          id: (schema as any).caEntityCertificates?.id,
          status: (schema as any).caEntityCertificates?.status,
          expiresAt: (schema as any).caEntityCertificates?.expiresAt,
        }).from((schema as any).caEntityCertificates)
          .orderBy(desc((schema as any).caEntityCertificates?.expiresAt))
          .limit(10);

        console.log('');
        if (!certs || certs.length === 0) {
          info('No certificates found in CA store');
        } else {
          const rows: [string, string][] = certs.map((c: any) => [
            c.id?.slice(0, 16) ?? '—',
            `${c.status ?? '—'}  expires: ${c.expiresAt?.toISOString?.()?.slice(0, 10) ?? '—'}`,
          ]);
          table(rows, 20);
        }
      } catch (e) {
        warn('CA certificate table unavailable: ' + (e instanceof Error ? e.message : String(e)));
      }
      await pause();
    }
  }
}

// ---------------------------------------------------------------------------
// 7. Docker Management
// ---------------------------------------------------------------------------

async function dockerManagement() {
  while (true) {
    header('Docker Management');
    const choice = await menu([
      'Container status',
      'Start containers',
      'Stop containers',
      'Restart a container',
      'View container logs',
      'Manage credentials',
      'Back',
    ]);

    if (choice === 7) return;

    const dc = await detectDockerCompose();

    if (choice === 1) {
      try {
        const { stdout } = await execAsync(`${dc} ps --format "table {{.Name}}\\t{{.Status}}\\t{{.Ports}}"`, { cwd: MONOREPO_ROOT });
        console.log('\n' + stdout);
      } catch (e) {
        // Fallback without format
        try {
          const { stdout } = await execAsync(`${dc} ps`, { cwd: MONOREPO_ROOT });
          console.log('\n' + stdout);
        } catch (e2) {
          error(e2 instanceof Error ? e2.message : String(e2));
        }
      }
      await pause();

    } else if (choice === 2) {
      const profileIdx = await menu([
        'Default services',
        'Include RabbitMQ',
        'Include GPU workers',
        'All profiles',
      ], 'Profile');
      const cmds: Record<number, string> = {
        1: `${dc} up -d`,
        2: `${dc} --profile rabbitmq up -d`,
        3: `${dc} --profile gpu up -d`,
        4: `${dc} --profile rabbitmq --profile gpu up -d`,
      };
      info(`Starting containers...`);
      try {
        const { stdout } = await execAsync(cmds[profileIdx], { cwd: MONOREPO_ROOT });
        if (stdout) console.log(stdout);
        success('Containers started');
      } catch (e) {
        error(e instanceof Error ? e.message : String(e));
      }
      await pause();

    } else if (choice === 3) {
      const confirmed = await confirm('Stop all containers?');
      if (!confirmed) { await pause(); continue; }
      try {
        await execAsync(`${dc} down`, { cwd: MONOREPO_ROOT });
        success('All containers stopped');
      } catch (e) {
        error(e instanceof Error ? e.message : String(e));
      }
      await pause();

    } else if (choice === 4) {
      const services = [
        'postgres', 'redis', 'opensearch', 'minio',
        'render-worker', 'prefetch-worker', 'mailhog', 'rabbitmq',
      ];
      const svcIdx = await menu(services, 'Select service');
      try {
        await execAsync(`${dc} restart ${services[svcIdx - 1]}`, { cwd: MONOREPO_ROOT });
        success(`Restarted ${services[svcIdx - 1]}`);
      } catch (e) {
        error(e instanceof Error ? e.message : String(e));
      }
      await pause();

    } else if (choice === 5) {
      const services = [
        'postgres', 'redis', 'opensearch', 'minio',
        'render-worker', 'prefetch-worker', 'mailhog', 'rabbitmq',
      ];
      const svcIdx = await menu(services, 'Select service');
      const lines = await ask('  Number of lines (default 50): ') || '50';
      try {
        const { stdout } = await execAsync(`${dc} logs --tail ${lines} ${services[svcIdx - 1]}`, { cwd: MONOREPO_ROOT });
        console.log('\n' + stdout);
      } catch (e) {
        error(e instanceof Error ? e.message : String(e));
      }
      await pause();

    } else if (choice === 6) {
      // Manage credentials sub-menu
      while (true) {
        section('Docker Service Credentials');
        const credChoice = await menu([
          'View all credentials',
          'Set PostgreSQL credentials',
          'Set MinIO credentials',
          'Set RabbitMQ credentials',
          'Set OpenSearch admin password',
          'Set Grafana admin credentials',
          'Generate random passwords for all',
          'Back',
        ]);

        if (credChoice === 8) break;

        const env = await readEnv();

        if (credChoice === 1) {
          console.log('');
          const credRows: [string, string][] = [
            ['PostgreSQL User', env.get('POSTGRES_USER') ?? 'exprsn (default)'],
            ['PostgreSQL Password', maskValue('PASSWORD', env.get('POSTGRES_PASSWORD') ?? '(not set)')],
            ['MinIO User', env.get('MINIO_ROOT_USER') ?? 'minioadmin (default)'],
            ['MinIO Password', maskValue('PASSWORD', env.get('MINIO_ROOT_PASSWORD') ?? '(not set)')],
            ['RabbitMQ User', env.get('RABBITMQ_DEFAULT_USER') ?? 'guest (default)'],
            ['RabbitMQ Password', maskValue('PASSWORD', env.get('RABBITMQ_DEFAULT_PASS') ?? '(not set)')],
            ['OpenSearch Password', maskValue('PASSWORD', env.get('OPENSEARCH_INITIAL_ADMIN_PASSWORD') ?? '(not set)')],
            ['Grafana User', env.get('GRAFANA_ADMIN_USER') ?? 'admin (default)'],
            ['Grafana Password', maskValue('PASSWORD', env.get('GRAFANA_ADMIN_PASSWORD') ?? '(not set)')],
          ];
          table(credRows, 28);
          await pause();

        } else if (credChoice === 2) {
          const user = await ask('  PostgreSQL username (default: exprsn): ') || 'exprsn';
          const pass = await askPassword('  PostgreSQL password: ');
          if (!pass) { error('Password required'); await pause(); continue; }
          env.set('POSTGRES_USER', user);
          env.set('POSTGRES_PASSWORD', pass);
          const dbUrl = `postgresql://${user}:${pass}@localhost:5432/exprsn`;
          env.set('DATABASE_URL', dbUrl);
          await writeEnv(env);
          success('PostgreSQL credentials updated');
          info(`DATABASE_URL also updated to: ${maskValue('URL', dbUrl)}`);
          warn('Recreate containers for changes to take effect: docker compose down && docker compose up -d');
          await pause();

        } else if (credChoice === 3) {
          const user = await ask('  MinIO root user (default: minioadmin): ') || 'minioadmin';
          const pass = await askPassword('  MinIO root password: ');
          if (!pass) { error('Password required'); await pause(); continue; }
          env.set('MINIO_ROOT_USER', user);
          env.set('MINIO_ROOT_PASSWORD', pass);
          env.set('DO_SPACES_KEY', user);
          env.set('DO_SPACES_SECRET', pass);
          await writeEnv(env);
          success('MinIO credentials updated (also synced to DO_SPACES_KEY/SECRET)');
          warn('Recreate containers for changes to take effect');
          await pause();

        } else if (credChoice === 4) {
          const user = await ask('  RabbitMQ user (default: guest): ') || 'guest';
          const pass = await askPassword('  RabbitMQ password: ');
          if (!pass) { error('Password required'); await pause(); continue; }
          env.set('RABBITMQ_DEFAULT_USER', user);
          env.set('RABBITMQ_DEFAULT_PASS', pass);
          env.set('RABBITMQ_URL', `amqp://${user}:${pass}@localhost:5672`);
          await writeEnv(env);
          success('RabbitMQ credentials updated');
          await pause();

        } else if (credChoice === 5) {
          const pass = await askPassword('  OpenSearch admin password: ');
          if (!pass) { error('Password required'); await pause(); continue; }
          env.set('OPENSEARCH_INITIAL_ADMIN_PASSWORD', pass);
          await writeEnv(env);
          success('OpenSearch admin password updated');
          await pause();

        } else if (credChoice === 6) {
          const user = await ask('  Grafana admin user (default: admin): ') || 'admin';
          const pass = await askPassword('  Grafana admin password: ');
          if (!pass) { error('Password required'); await pause(); continue; }
          env.set('GRAFANA_ADMIN_USER', user);
          env.set('GRAFANA_ADMIN_PASSWORD', pass);
          await writeEnv(env);
          success('Grafana credentials updated');
          await pause();

        } else if (credChoice === 7) {
          const confirmed = await confirm('Generate random passwords for PostgreSQL, MinIO, RabbitMQ, OpenSearch, and Grafana?');
          if (!confirmed) { await pause(); continue; }
          const pgPass = generatePassword();
          const minioPass = generatePassword();
          const rabbitPass = generatePassword();
          const osPass = 'Exprsn@' + generatePassword(16) + '!';
          const grafanaPass = generatePassword(16);

          env.set('POSTGRES_USER', 'exprsn');
          env.set('POSTGRES_PASSWORD', pgPass);
          env.set('DATABASE_URL', `postgresql://exprsn:${pgPass}@localhost:5432/exprsn`);
          env.set('MINIO_ROOT_USER', 'minioadmin');
          env.set('MINIO_ROOT_PASSWORD', minioPass);
          env.set('DO_SPACES_KEY', 'minioadmin');
          env.set('DO_SPACES_SECRET', minioPass);
          env.set('RABBITMQ_DEFAULT_USER', 'guest');
          env.set('RABBITMQ_DEFAULT_PASS', rabbitPass);
          env.set('OPENSEARCH_INITIAL_ADMIN_PASSWORD', osPass);
          env.set('GRAFANA_ADMIN_USER', 'admin');
          env.set('GRAFANA_ADMIN_PASSWORD', grafanaPass);
          await writeEnv(env);

          success('All credentials generated and saved');
          console.log('');
          table([
            ['PostgreSQL', `exprsn / ${pgPass}`],
            ['MinIO', `minioadmin / ${minioPass}`],
            ['RabbitMQ', `guest / ${rabbitPass}`],
            ['OpenSearch', osPass],
            ['Grafana', `admin / ${grafanaPass}`],
          ], 20);
          warn('\nSave these values now — they are masked in future views.');
          warn('Recreate containers for changes to take effect.');
          await pause();
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 8. Certificate Authority
// ---------------------------------------------------------------------------

async function certificateAuthority() {
  while (true) {
    header('Certificate Authority');
    const choice = await menu([
      'View root CA status',
      'Initialize root CA',
      'Create intermediate CA',
      'Issue entity certificate',
      'List certificates',
      'Revoke a certificate',
      'View certificate chain',
      'Export certificate (PEM)',
      'Back',
    ]);

    if (choice === 9) return;

    if (choice === 1) {
      try {
        const { db, schema } = await tryImportDb();
        const { desc } = await import('drizzle-orm');
        const roots = await db.select().from((schema as any).caRootCertificates)
          .orderBy(desc((schema as any).caRootCertificates.createdAt)).limit(1);
        if (!roots || roots.length === 0) {
          warn('No root CA initialized. Use "Initialize root CA" to create one.');
        } else {
          const root = roots[0] as any;
          section('Root CA Certificate');
          const daysLeft = Math.ceil(((root.expiresAt ?? root.notAfter)?.getTime() - Date.now()) / 86400000);
          table([
            ['ID', root.id ?? '—'],
            ['Common Name', root.commonName ?? root.subject ?? '—'],
            ['Serial', root.serialNumber ?? '—'],
            ['Fingerprint', (root.fingerprint ?? '—').slice(0, 40)],
            ['Valid From', (root.issuedAt ?? root.notBefore ?? root.createdAt)?.toISOString?.()?.slice(0, 10) ?? '—'],
            ['Valid Until', (root.expiresAt ?? root.notAfter)?.toISOString?.()?.slice(0, 10) ?? '—'],
            ['Days Remaining', String(daysLeft)],
            ['Status', root.status ?? 'active'],
          ], 24);
        }
      } catch (e) {
        warn('CA system unavailable: ' + (e instanceof Error ? e.message : String(e)));
        info('Ensure PostgreSQL is running and migrations are applied.');
      }
      await pause();

    } else if (choice === 2) {
      try {
        const { db, schema } = await tryImportDb();
        const existing = await db.select().from((schema as any).caRootCertificates).limit(1);
        if (existing && existing.length > 0) {
          const overwrite = await confirmDangerous('A root CA already exists. Regenerating will invalidate ALL issued certificates.');
          if (!overwrite) { await pause(); continue; }
        }

        const cn = await ask('  Common Name (default: Exprsn Root CA): ') || 'Exprsn Root CA';
        const org = await ask('  Organization (default: Exprsn): ') || 'Exprsn';
        const country = await ask('  Country (default: US): ') || 'US';
        const keyIdx = await menu(['RSA 2048', 'RSA 4096'], 'Key size');
        const keySize = keyIdx === 1 ? 2048 : 4096;
        const validityStr = await ask('  Validity days (default: 7300 = 20 years): ') || '7300';
        const validityDays = parseInt(validityStr, 10) || 7300;

        info('Generating root CA certificate...');
        const { CertificateManager } = await import('../src/services/ca/CertificateManager.js');
        const mgr = new CertificateManager();
        const root = await (mgr as any).initializeRootCA?.({
          commonName: cn, organization: org, country, keySize, validityDays,
        }) ?? await (mgr as any).ensureRootCA?.({
          commonName: cn, organization: org, country, keySize, validityDays,
        });
        success(`Root CA created: ${root?.id ?? root?.fingerprint ?? 'OK'}`);
      } catch (e) {
        error('Failed to create root CA: ' + (e instanceof Error ? e.message : String(e)));
      }
      await pause();

    } else if (choice === 3) {
      try {
        const cn = await ask('  Common Name (default: Exprsn Intermediate CA): ') || 'Exprsn Intermediate CA';
        const org = await ask('  Organization (default: Exprsn): ') || 'Exprsn';
        const validityStr = await ask('  Validity days (default: 3650 = 10 years): ') || '3650';
        const validityDays = parseInt(validityStr, 10) || 3650;

        info('Creating intermediate CA...');
        const { CertificateManager } = await import('../src/services/ca/CertificateManager.js');
        const mgr = new CertificateManager();
        const intermediate = await (mgr as any).createIntermediateCA({
          commonName: cn, organization: org, validityDays,
        });
        success(`Intermediate CA created: ${intermediate?.id ?? 'OK'}`);
      } catch (e) {
        error('Failed: ' + (e instanceof Error ? e.message : String(e)));
      }
      await pause();

    } else if (choice === 4) {
      try {
        const typeIdx = await menu(['Client', 'Server', 'Code Signing'], 'Certificate type');
        const types = ['client', 'server', 'code-signing'];
        const certType = types[typeIdx - 1];
        const cn = await ask('  Common Name: ');
        if (!cn) { error('Common Name required'); await pause(); continue; }
        const org = await ask('  Organization (optional): ');
        let email = '';
        let sans = '';
        if (certType === 'client') {
          email = await ask('  Email: ');
        }
        if (certType === 'server') {
          sans = await ask('  Subject Alt Names (comma-separated DNS/IPs): ');
        }
        const validityStr = await ask('  Validity days (default: 365): ') || '365';
        const validityDays = parseInt(validityStr, 10) || 365;

        info('Issuing certificate...');
        const { CertificateManager } = await import('../src/services/ca/CertificateManager.js');
        const mgr = new CertificateManager();
        const cert = await (mgr as any).issueEntityCertificate({
          commonName: cn,
          type: certType,
          organization: org || undefined,
          email: email || undefined,
          subjectAltNames: sans ? sans.split(',').map((s: string) => s.trim()) : undefined,
          validityDays,
        });
        success(`Certificate issued: ${cert?.id ?? 'OK'}`);
        if (cert?.fingerprint) info(`Fingerprint: ${cert.fingerprint}`);
      } catch (e) {
        error('Failed: ' + (e instanceof Error ? e.message : String(e)));
      }
      await pause();

    } else if (choice === 5) {
      try {
        const { db, schema } = await tryImportDb();
        const { desc } = await import('drizzle-orm');
        const certs = await db.select().from((schema as any).caEntityCertificates)
          .orderBy(desc((schema as any).caEntityCertificates.createdAt)).limit(20);
        console.log('');
        if (!certs || certs.length === 0) {
          info('No entity certificates found');
        } else {
          console.log(`  ${C.bold}${'ID'.padEnd(12)}${'Common Name'.padEnd(28)}${'Type'.padEnd(14)}${'Status'.padEnd(10)}${'Expires'.padEnd(12)}${C.reset}`);
          dim('  ' + '─'.repeat(76));
          for (const c of certs as any[]) {
            const id = (c.id ?? '—').slice(0, 10);
            const cn = (c.commonName ?? c.subject ?? '—').slice(0, 26);
            const type = (c.type ?? c.certificateType ?? '—').slice(0, 12);
            const status = c.status ?? 'active';
            const expires = (c.expiresAt ?? c.notAfter)?.toISOString?.()?.slice(0, 10) ?? '—';
            console.log(`  ${id.padEnd(12)}${cn.padEnd(28)}${type.padEnd(14)}${status.padEnd(10)}${expires}`);
          }
        }
      } catch (e) {
        warn('CA table unavailable: ' + (e instanceof Error ? e.message : String(e)));
      }
      await pause();

    } else if (choice === 6) {
      const certId = await ask('  Certificate ID: ');
      if (!certId) { error('ID required'); await pause(); continue; }
      const confirmed = await confirmDangerous('Revoke this certificate? This cannot be undone.');
      if (!confirmed) { await pause(); continue; }
      try {
        const reasonIdx = await menu([
          'Unspecified', 'Key compromise', 'CA compromise',
          'Affiliation changed', 'Superseded', 'Cessation of operation',
        ], 'Revocation reason');
        const reasons = ['unspecified', 'keyCompromise', 'cACompromise', 'affiliationChanged', 'superseded', 'cessationOfOperation'];
        const { CertificateManager } = await import('../src/services/ca/CertificateManager.js');
        const mgr = new CertificateManager();
        await (mgr as any).revokeCertificate(certId, reasons[reasonIdx - 1]);
        success(`Certificate ${certId} revoked`);
      } catch (e) {
        error('Failed: ' + (e instanceof Error ? e.message : String(e)));
      }
      await pause();

    } else if (choice === 7) {
      const certId = await ask('  Entity certificate ID: ');
      if (!certId) { error('ID required'); await pause(); continue; }
      try {
        const { db, schema } = await tryImportDb();
        const { eq } = await import('drizzle-orm');

        const entity = await db.select().from((schema as any).caEntityCertificates)
          .where(eq((schema as any).caEntityCertificates.id, certId)).limit(1);
        if (!entity || entity.length === 0) { error('Certificate not found'); await pause(); continue; }
        const e = entity[0] as any;

        console.log('');
        console.log(`  ${C.cyan}Root CA${C.reset}`);
        const roots = await db.select().from((schema as any).caRootCertificates).limit(1);
        if (roots.length > 0) {
          const r = roots[0] as any;
          console.log(`    └─ CN: ${r.commonName ?? r.subject ?? '—'}`);
          console.log(`       Valid: ${(r.issuedAt ?? r.createdAt)?.toISOString?.()?.slice(0, 10)} → ${(r.expiresAt ?? r.notAfter)?.toISOString?.()?.slice(0, 10)}`);
        }

        if (e.issuerId || e.intermediateId) {
          const intermediates = await db.select().from((schema as any).caIntermediateCertificates).limit(5);
          const issuer = intermediates.find((i: any) => i.id === (e.issuerId ?? e.intermediateId));
          if (issuer) {
            console.log(`  ${C.cyan}  └─ Intermediate CA${C.reset}`);
            console.log(`       CN: ${(issuer as any).commonName ?? '—'}`);
          }
        }

        console.log(`  ${C.cyan}    └─ Entity Certificate${C.reset}`);
        console.log(`       CN: ${e.commonName ?? e.subject ?? '—'}`);
        console.log(`       Type: ${e.type ?? e.certificateType ?? '—'}`);
        console.log(`       Status: ${e.status ?? 'active'}`);
        console.log(`       Valid: ${(e.issuedAt ?? e.createdAt)?.toISOString?.()?.slice(0, 10)} → ${(e.expiresAt ?? e.notAfter)?.toISOString?.()?.slice(0, 10)}`);
      } catch (e) {
        error('Failed: ' + (e instanceof Error ? e.message : String(e)));
      }
      await pause();

    } else if (choice === 8) {
      const certId = await ask('  Certificate ID: ');
      if (!certId) { error('ID required'); await pause(); continue; }
      try {
        const { db, schema } = await tryImportDb();
        const { eq } = await import('drizzle-orm');
        const certs = await db.select().from((schema as any).caEntityCertificates)
          .where(eq((schema as any).caEntityCertificates.id, certId)).limit(1);
        if (!certs || certs.length === 0) { error('Certificate not found'); await pause(); continue; }
        const cert = certs[0] as any;
        const formatIdx = await menu(['PEM (certificate only)', 'PEM (full chain)'], 'Export format');
        const outPath = await ask('  Output file path (default: ./cert.pem): ') || './cert.pem';
        const fullPath = resolve(MONOREPO_ROOT, outPath);

        let content = cert.certificate ?? cert.pem ?? '';
        if (formatIdx === 2) {
          const roots = await db.select().from((schema as any).caRootCertificates).limit(1);
          if (roots.length > 0) {
            content += '\n' + ((roots[0] as any).certificate ?? (roots[0] as any).pem ?? '');
          }
        }
        await writeFile(fullPath, content, 'utf-8');
        success(`Exported to ${fullPath}`);
      } catch (e) {
        error('Failed: ' + (e instanceof Error ? e.message : String(e)));
      }
      await pause();
    }
  }
}

// ---------------------------------------------------------------------------
// 9. TLS / HTTPS Certificates
// ---------------------------------------------------------------------------

async function tlsCertificates() {
  while (true) {
    header('TLS / HTTPS Certificates');
    const choice = await menu([
      'View current TLS certificate',
      'Generate self-signed certificate',
      'Generate with internal CA',
      "Let's Encrypt (certbot)",
      'Deploy certificate to nginx',
      'Check certificate expiry',
      'Back',
    ]);

    if (choice === 7) return;

    if (choice === 1) {
      try {
        await access(CERT_FILE);
        const { stdout } = await execAsync(`openssl x509 -in "${CERT_FILE}" -noout -subject -issuer -dates -ext subjectAltName 2>/dev/null`);
        section('Current TLS Certificate');
        console.log(stdout);
      } catch {
        warn(`No TLS certificate found at ${SSL_DIR}/`);
      }
      await pause();

    } else if (choice === 2) {
      const domain = await ask('  Domain name (default: localhost): ') || 'localhost';
      const extraDomains = await ask('  Additional domains (comma-separated, optional): ');
      const org = await ask('  Organization (default: Exprsn): ') || 'Exprsn';
      const validityStr = await ask('  Validity days (default: 365): ') || '365';
      const keyIdx = await menu(['RSA 2048', 'RSA 4096', 'ECDSA P-256', 'ECDSA P-384'], 'Key type');

      await mkdir(SSL_DIR, { recursive: true });

      let sanList = `DNS:${domain},DNS:localhost,IP:127.0.0.1`;
      if (extraDomains) {
        for (const d of extraDomains.split(',')) {
          const trimmed = d.trim();
          if (trimmed) sanList += `,DNS:${trimmed}`;
        }
      }
      sanList += `,DNS:*.${domain}`;

      let keyArg: string;
      if (keyIdx <= 2) {
        keyArg = `rsa:${keyIdx === 1 ? 2048 : 4096}`;
      } else {
        const curve = keyIdx === 3 ? 'prime256v1' : 'secp384r1';
        keyArg = `ec -pkeyopt ec_paramgen_curve:${curve}`;
      }

      const cmd = `openssl req -x509 -newkey ${keyArg} -sha256 -days ${validityStr} -nodes ` +
        `-keyout "${KEY_FILE}" -out "${CERT_FILE}" ` +
        `-subj "/CN=${domain}/O=${org}" ` +
        `-addext "subjectAltName=${sanList}" 2>&1`;

      info('Generating self-signed TLS certificate...');
      try {
        await execAsync(cmd);
        success(`Certificate written to ${CERT_FILE}`);
        success(`Private key written to ${KEY_FILE}`);
        const { stdout } = await execAsync(`openssl x509 -in "${CERT_FILE}" -noout -subject -dates 2>/dev/null`);
        console.log(stdout);
      } catch (e) {
        error('OpenSSL failed: ' + (e instanceof Error ? e.message : String(e)));
      }
      await pause();

    } else if (choice === 3) {
      try {
        const domain = await ask('  Domain name: ');
        if (!domain) { error('Domain required'); await pause(); continue; }
        const sans = await ask('  Additional SANs (comma-separated, optional): ');
        const validityStr = await ask('  Validity days (default: 365): ') || '365';

        info('Generating server certificate from internal CA...');
        const { CertificateManager } = await import('../src/services/ca/CertificateManager.js');
        const mgr = new CertificateManager();

        const sanList = [domain];
        if (sans) sanList.push(...sans.split(',').map((s: string) => s.trim()));

        const cert = await (mgr as any).issueEntityCertificate({
          commonName: domain,
          type: 'server',
          subjectAltNames: sanList,
          validityDays: parseInt(validityStr, 10) || 365,
        });

        await mkdir(SSL_DIR, { recursive: true });

        // Write certificate chain
        let chain = cert.certificate ?? cert.pem ?? '';
        // Append root CA cert for full chain
        const { db, schema } = await tryImportDb();
        const roots = await db.select().from((schema as any).caRootCertificates).limit(1);
        if (roots.length > 0) {
          chain += '\n' + ((roots[0] as any).certificate ?? (roots[0] as any).pem ?? '');
        }

        await writeFile(CERT_FILE, chain, 'utf-8');
        await writeFile(KEY_FILE, cert.privateKey ?? cert.key ?? '', 'utf-8');
        success(`Full chain written to ${CERT_FILE}`);
        success(`Private key written to ${KEY_FILE}`);
      } catch (e) {
        error('Failed: ' + (e instanceof Error ? e.message : String(e)));
        info('Ensure the root CA is initialized first (Certificate Authority > Initialize root CA)');
      }
      await pause();

    } else if (choice === 4) {
      const leChoice = await menu([
        'Obtain new certificate (standalone)',
        'Obtain new certificate (webroot)',
        'Renew all certificates',
        'Back',
      ], "Let's Encrypt");

      if (leChoice === 4) continue;

      if (leChoice === 1) {
        const domain = await ask('  Domain: ');
        const email = await ask('  Email for notifications: ');
        if (!domain || !email) { error('Domain and email required'); await pause(); continue; }
        const extraDomains = await ask('  Additional domains (comma-separated, optional): ');
        let domainArgs = `-d ${domain}`;
        if (extraDomains) {
          for (const d of extraDomains.split(',')) {
            const trimmed = d.trim();
            if (trimmed) domainArgs += ` -d ${trimmed}`;
          }
        }
        info('Running certbot (may require sudo)...');
        try {
          const { stdout } = await execAsync(
            `sudo certbot certonly --standalone ${domainArgs} --agree-tos --email ${email} --non-interactive 2>&1`
          );
          console.log(stdout);
          // Link certs
          await mkdir(SSL_DIR, { recursive: true });
          await execAsync(`sudo ln -sf /etc/letsencrypt/live/${domain}/fullchain.pem "${CERT_FILE}"`);
          await execAsync(`sudo ln -sf /etc/letsencrypt/live/${domain}/privkey.pem "${KEY_FILE}"`);
          success('Certificate obtained and linked');
        } catch (e) {
          error('Certbot failed: ' + (e instanceof Error ? e.message : String(e)));
          info('Ensure port 80 is open and DNS points to this server');
        }
      } else if (leChoice === 2) {
        const domain = await ask('  Domain: ');
        const email = await ask('  Email: ');
        const webroot = await ask('  Webroot path (default: /var/www/certbot): ') || '/var/www/certbot';
        if (!domain || !email) { error('Domain and email required'); await pause(); continue; }
        info('Running certbot...');
        try {
          const { stdout } = await execAsync(
            `sudo certbot certonly --webroot -w ${webroot} -d ${domain} --agree-tos --email ${email} --non-interactive 2>&1`
          );
          console.log(stdout);
          await mkdir(SSL_DIR, { recursive: true });
          await execAsync(`sudo ln -sf /etc/letsencrypt/live/${domain}/fullchain.pem "${CERT_FILE}"`);
          await execAsync(`sudo ln -sf /etc/letsencrypt/live/${domain}/privkey.pem "${KEY_FILE}"`);
          success('Certificate obtained and linked');
        } catch (e) {
          error('Certbot failed: ' + (e instanceof Error ? e.message : String(e)));
        }
      } else if (leChoice === 3) {
        info('Renewing certificates...');
        try {
          const { stdout } = await execAsync('sudo certbot renew --quiet 2>&1');
          if (stdout) console.log(stdout);
          success('Renewal complete');
        } catch (e) {
          error('Renewal failed: ' + (e instanceof Error ? e.message : String(e)));
        }
      }
      await pause();

    } else if (choice === 5) {
      const certPath = await ask('  Path to certificate file: ');
      const keyPath = await ask('  Path to private key file: ');
      if (!certPath || !keyPath) { error('Both paths required'); await pause(); continue; }
      try {
        // Validate cert
        await execAsync(`openssl x509 -in "${certPath}" -noout 2>&1`);
        // Validate key
        await execAsync(`openssl rsa -in "${keyPath}" -check -noout 2>&1 || openssl ec -in "${keyPath}" -check -noout 2>&1`);
        // Check moduli match
        const { stdout: certMod } = await execAsync(`openssl x509 -in "${certPath}" -noout -modulus 2>/dev/null | openssl md5`);
        const { stdout: keyMod } = await execAsync(`openssl rsa -in "${keyPath}" -noout -modulus 2>/dev/null | openssl md5`);
        if (certMod.trim() !== keyMod.trim()) {
          warn('Certificate and key moduli do not match — they may not be a pair');
          const cont = await confirm('Continue anyway?');
          if (!cont) { await pause(); continue; }
        }

        await mkdir(SSL_DIR, { recursive: true });
        await execAsync(`cp "${certPath}" "${CERT_FILE}"`);
        await execAsync(`cp "${keyPath}" "${KEY_FILE}"`);
        success('Certificate deployed to nginx SSL directory');

        const reload = await confirm('Reload nginx now?');
        if (reload) {
          const dc = await detectDockerCompose();
          try {
            await execAsync(`${dc} exec nginx nginx -s reload`, { cwd: MONOREPO_ROOT });
            success('nginx reloaded');
          } catch {
            warn('nginx reload failed — container may not be running');
          }
        }
      } catch (e) {
        error('Validation failed: ' + (e instanceof Error ? e.message : String(e)));
      }
      await pause();

    } else if (choice === 6) {
      try {
        await access(CERT_FILE);
        const { stdout: dates } = await execAsync(`openssl x509 -in "${CERT_FILE}" -noout -dates 2>/dev/null`);
        const { stdout: subject } = await execAsync(`openssl x509 -in "${CERT_FILE}" -noout -subject 2>/dev/null`);
        console.log('\n' + subject.trim());
        console.log(dates.trim());

        try {
          await execAsync(`openssl x509 -in "${CERT_FILE}" -noout -checkend 2592000 2>/dev/null`);
          success('Certificate valid for more than 30 days');
        } catch {
          warn('Certificate expires within 30 days — consider renewal');
        }

        try {
          await execAsync(`openssl x509 -in "${CERT_FILE}" -noout -checkend 604800 2>/dev/null`);
        } catch {
          error('Certificate expires within 7 days!');
        }
      } catch {
        warn(`No TLS certificate found at ${SSL_DIR}/`);
      }
      await pause();
    }
  }
}

// ---------------------------------------------------------------------------
// 10. System Service
// ---------------------------------------------------------------------------

async function systemService() {
  const platform = process.platform;
  const isLinux = platform === 'linux';
  const isMac = platform === 'darwin';

  while (true) {
    header('System Service');
    info(`Platform: ${platform} (${isLinux ? 'systemd' : isMac ? 'launchd' : 'unsupported'})`);

    const choice = await menu([
      'Generate service file',
      'Install service',
      'Start service',
      'Stop service',
      'Restart service',
      'Service status',
      'Enable auto-start',
      'Disable auto-start',
      'View service logs',
      'Uninstall service',
      'Back',
    ]);

    if (choice === 11) return;

    if (choice === 1) {
      const user = await ask(`  Run as user (default: ${process.env.USER ?? 'root'}): `) || process.env.USER || 'root';
      const workDir = await ask(`  Working directory (default: ${MONOREPO_ROOT}): `) || MONOREPO_ROOT;
      const startCmd = await ask('  Start command (default: node packages/api/dist/index.js): ') || 'node packages/api/dist/index.js';
      const envFile = await ask(`  Env file (default: ${workDir}/.env): `) || `${workDir}/.env`;

      if (isLinux) {
        const unit = `[Unit]
Description=Exprsn Platform
Documentation=https://github.com/exprsn/exprsn
After=network.target postgresql.service redis.service
Wants=postgresql.service redis.service

[Service]
Type=simple
User=${user}
Group=${user}
WorkingDirectory=${workDir}
EnvironmentFile=${envFile}
ExecStart=${startCmd}
ExecReload=/bin/kill -HUP $MAINPID
Restart=on-failure
RestartSec=5
LimitNOFILE=65536
LimitNPROC=4096
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${SERVICE_NAME}
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=${workDir}/data ${workDir}/logs
PrivateTmp=true

[Install]
WantedBy=multi-user.target
`;
        const outPath = resolve(MONOREPO_ROOT, 'deploy', `${SERVICE_NAME}.service`);
        await mkdir(resolve(MONOREPO_ROOT, 'deploy'), { recursive: true });
        await writeFile(outPath, unit, 'utf-8');
        success(`Systemd unit written to ${outPath}`);
        console.log(`\n${C.dim}${unit}${C.reset}`);
      } else if (isMac) {
        const cmdParts = startCmd.split(' ');
        const argsXml = cmdParts.map((p: string) => `    <string>${p}</string>`).join('\n');
        const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>io.exprsn.api</string>
  <key>ProgramArguments</key>
  <array>
${argsXml}
  </array>
  <key>WorkingDirectory</key>
  <string>${workDir}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/var/log/exprsn/stdout.log</string>
  <key>StandardErrorPath</key>
  <string>/var/log/exprsn/stderr.log</string>
  <key>ThrottleInterval</key>
  <integer>5</integer>
</dict>
</plist>
`;
        const outPath = resolve(MONOREPO_ROOT, 'deploy', 'io.exprsn.api.plist');
        await mkdir(resolve(MONOREPO_ROOT, 'deploy'), { recursive: true });
        await writeFile(outPath, plist, 'utf-8');
        success(`Launchd plist written to ${outPath}`);
        console.log(`\n${C.dim}${plist}${C.reset}`);
      } else {
        warn('Unsupported platform for service generation');
      }
      await pause();

    } else if (choice === 2) {
      const confirmed = await confirmDangerous('Install the system service? This requires root/sudo permissions.');
      if (!confirmed) { await pause(); continue; }
      try {
        if (isLinux) {
          const src = resolve(MONOREPO_ROOT, 'deploy', `${SERVICE_NAME}.service`);
          await access(src);
          await execAsync(`sudo cp "${src}" /etc/systemd/system/${SERVICE_NAME}.service`);
          await execAsync('sudo systemctl daemon-reload');
          success('Systemd service installed and daemon reloaded');
        } else if (isMac) {
          const src = resolve(MONOREPO_ROOT, 'deploy', 'io.exprsn.api.plist');
          await access(src);
          await execAsync('sudo mkdir -p /var/log/exprsn');
          await execAsync(`sudo cp "${src}" /Library/LaunchDaemons/io.exprsn.api.plist`);
          success('Launchd plist installed');
        }
      } catch (e) {
        error('Install failed: ' + (e instanceof Error ? e.message : String(e)));
        info('Ensure the service file has been generated first (option 1)');
      }
      await pause();

    } else if (choice === 3) {
      try {
        if (isLinux) {
          await execAsync(`sudo systemctl start ${SERVICE_NAME}`);
          success('Service started');
        } else if (isMac) {
          await execAsync('sudo launchctl kickstart system/io.exprsn.api');
          success('Service started');
        }
      } catch (e) {
        error('Start failed: ' + (e instanceof Error ? e.message : String(e)));
      }
      await pause();

    } else if (choice === 4) {
      try {
        if (isLinux) {
          await execAsync(`sudo systemctl stop ${SERVICE_NAME}`);
          success('Service stopped');
        } else if (isMac) {
          await execAsync('sudo launchctl kill SIGTERM system/io.exprsn.api');
          success('Service stopped');
        }
      } catch (e) {
        error('Stop failed: ' + (e instanceof Error ? e.message : String(e)));
      }
      await pause();

    } else if (choice === 5) {
      try {
        if (isLinux) {
          await execAsync(`sudo systemctl restart ${SERVICE_NAME}`);
          success('Service restarted');
        } else if (isMac) {
          await execAsync('sudo launchctl kickstart -k system/io.exprsn.api');
          success('Service restarted');
        }
      } catch (e) {
        error('Restart failed: ' + (e instanceof Error ? e.message : String(e)));
      }
      await pause();

    } else if (choice === 6) {
      try {
        if (isLinux) {
          const { stdout } = await execAsync(`systemctl status ${SERVICE_NAME} --no-pager 2>&1 || true`);
          console.log('\n' + stdout);
        } else if (isMac) {
          const { stdout } = await execAsync('sudo launchctl print system/io.exprsn.api 2>&1 || true');
          console.log('\n' + stdout);
        }
      } catch (e) {
        error('Status check failed: ' + (e instanceof Error ? e.message : String(e)));
      }
      await pause();

    } else if (choice === 7) {
      try {
        if (isLinux) {
          await execAsync(`sudo systemctl enable ${SERVICE_NAME}`);
          success('Auto-start enabled');
        } else if (isMac) {
          await execAsync('sudo launchctl enable system/io.exprsn.api');
          success('Auto-start enabled');
        }
      } catch (e) {
        error('Failed: ' + (e instanceof Error ? e.message : String(e)));
      }
      await pause();

    } else if (choice === 8) {
      try {
        if (isLinux) {
          await execAsync(`sudo systemctl disable ${SERVICE_NAME}`);
          success('Auto-start disabled');
        } else if (isMac) {
          await execAsync('sudo launchctl disable system/io.exprsn.api');
          success('Auto-start disabled');
        }
      } catch (e) {
        error('Failed: ' + (e instanceof Error ? e.message : String(e)));
      }
      await pause();

    } else if (choice === 9) {
      const lines = await ask('  Number of lines (default: 50): ') || '50';
      try {
        if (isLinux) {
          const { stdout } = await execAsync(`journalctl -u ${SERVICE_NAME} --no-pager -n ${lines} 2>&1 || true`);
          console.log('\n' + stdout);
        } else if (isMac) {
          try {
            const { stdout } = await execAsync(`tail -n ${lines} /var/log/exprsn/stdout.log 2>&1`);
            console.log('\n' + stdout);
          } catch {
            warn('No log file found at /var/log/exprsn/stdout.log');
          }
        }
      } catch (e) {
        error('Failed: ' + (e instanceof Error ? e.message : String(e)));
      }
      await pause();

    } else if (choice === 10) {
      const confirmed = await confirmDangerous('Uninstall the system service? This will stop and remove the service.');
      if (!confirmed) { await pause(); continue; }
      try {
        if (isLinux) {
          await execAsync(`sudo systemctl stop ${SERVICE_NAME} 2>/dev/null || true`);
          await execAsync(`sudo systemctl disable ${SERVICE_NAME} 2>/dev/null || true`);
          await execAsync(`sudo rm -f /etc/systemd/system/${SERVICE_NAME}.service`);
          await execAsync('sudo systemctl daemon-reload');
          success('Systemd service uninstalled');
        } else if (isMac) {
          await execAsync('sudo launchctl kill SIGTERM system/io.exprsn.api 2>/dev/null || true');
          await execAsync('sudo launchctl disable system/io.exprsn.api 2>/dev/null || true');
          await execAsync('sudo rm -f /Library/LaunchDaemons/io.exprsn.api.plist');
          success('Launchd service uninstalled');
        }
      } catch (e) {
        error('Uninstall failed: ' + (e instanceof Error ? e.message : String(e)));
      }
      await pause();
    }
  }
}

// ---------------------------------------------------------------------------
// Main menu loop
// ---------------------------------------------------------------------------

async function main() {
  console.clear();
  console.log(`\n${C.cyan}╔══════════════════════════════════════╗${C.reset}`);
  console.log(`${C.cyan}║   ${C.bold}     Exprsn Administration      ${C.reset}${C.cyan}   ║${C.reset}`);
  console.log(`${C.cyan}╚══════════════════════════════════════╝${C.reset}`);

  // Load .env into process.env for DB/Redis imports that read from env
  try {
    const content = await readFile(ENV_PATH, 'utf-8');
    for (const line of content.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const idx = t.indexOf('=');
      if (idx === -1) continue;
      const k = t.slice(0, idx).trim();
      const v = t.slice(idx + 1).trim();
      if (!process.env[k]) process.env[k] = v;
    }
  } catch { /* .env may not exist */ }

  // --setup flag: jump straight to first-time setup
  if (process.argv.includes('--setup')) {
    await firstTimeSetup();
    rl.close();
    process.exit(0);
  }

  while (true) {
    console.log('');
    const items = [
      'First-Time Setup',
      'Environment Configuration',
      'User Management',
      'Database Operations',
      'Docker Management',
      'Certificate Authority',
      'TLS / HTTPS Certificates',
      'System Service',
      'Service Status',
      'Security',
      'Exit',
    ];
    items.forEach((item, i) => {
      if (i === items.length - 1) {
        console.log(`  ${C.dim}${i + 1}) ${item}${C.reset}`);
      } else {
        console.log(`  ${C.cyan}${i + 1})${C.reset} ${item}`);
      }
    });
    console.log('');
    const ans = await ask(`${C.bold}Choose an option:${C.reset} `);
    const n = parseInt(ans, 10);

    if (n === 11 || ans.toLowerCase() === 'q' || ans.toLowerCase() === 'exit') {
      console.log(`\n${C.dim}Goodbye.${C.reset}\n`);
      rl.close();
      process.exit(0);
    }

    if      (n === 1)  await firstTimeSetup();
    else if (n === 2)  await envConfig();
    else if (n === 3)  await userManagement();
    else if (n === 4)  await databaseOps();
    else if (n === 5)  await dockerManagement();
    else if (n === 6)  await certificateAuthority();
    else if (n === 7)  await tlsCertificates();
    else if (n === 8)  await systemService();
    else if (n === 9)  await serviceStatus();
    else if (n === 10) await security();
    else               error('Enter a number between 1 and 11');
  }
}

main().catch((e) => {
  error(String(e));
  rl.close();
  process.exit(1);
});
