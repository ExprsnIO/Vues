/**
 * Exprsn Administration CLI
 * Run with: cd packages/api && npx tsx scripts/cli.ts
 */

import * as readline from 'readline';
import { readFile, writeFile, access } from 'fs/promises';
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
    error('PostgreSQL is required. Start it with: pnpm docker:up');
    await pause();
    return;
  }

  if (!redisOk) {
    warn('Redis is not reachable. Some features (queues, caching) will be degraded.');
    const cont = await confirm('Continue anyway?');
    if (!cont) return;
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
      const { db }    = await import('../src/db/index.js');
      const schema    = await import('../src/db/schema.js');
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

  console.log('');
  success('First-time setup complete!');
  info(`Start the API with: pnpm --filter @exprsn/api dev`);
  await pause();
}

// ---------------------------------------------------------------------------
// 2. Environment Configuration
// ---------------------------------------------------------------------------

async function envConfig() {
  while (true) {
    header('Environment Configuration');
    const choice = await menu([
      'View all variables',
      'Edit a variable',
      'Add a new variable',
      'Validate configuration',
      'Back',
    ]);

    if (choice === 5) return;

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
        const { db }  = await import('../src/db/index.js');
        const schema  = await import('../src/db/schema.js');
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
        const { db }   = await import('../src/db/index.js');
        const schema   = await import('../src/db/schema.js');
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
        const { db }     = await import('../src/db/index.js');
        const schema     = await import('../src/db/schema.js');
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
        const { db }     = await import('../src/db/index.js');
        const schema     = await import('../src/db/schema.js');
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
        const { db }   = await import('../src/db/index.js');
        const schema   = await import('../src/db/schema.js');
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
        const { db }  = await import('../src/db/index.js');
        const schema  = await import('../src/db/schema.js');
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
        const { db }   = await import('../src/db/index.js');
        const schema   = await import('../src/db/schema.js');
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
        const { db }  = await import('../src/db/index.js');
        const schema  = await import('../src/db/schema.js');
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
        const { db }     = await import('../src/db/index.js');
        const schema     = await import('../src/db/schema.js');
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
      'Service Status',
      'Security',
      'Exit',
    ];
    items.forEach((item, i) => {
      if (i === 6) {
        console.log(`  ${C.dim}${i + 1}) ${item}${C.reset}`);
      } else {
        console.log(`  ${C.cyan}${i + 1})${C.reset} ${item}`);
      }
    });
    console.log('');
    const ans = await ask(`${C.bold}Choose an option:${C.reset} `);
    const n = parseInt(ans, 10);

    if (n === 7 || ans.toLowerCase() === 'q' || ans.toLowerCase() === 'exit') {
      console.log(`\n${C.dim}Goodbye.${C.reset}\n`);
      rl.close();
      process.exit(0);
    }

    if      (n === 1) await firstTimeSetup();
    else if (n === 2) await envConfig();
    else if (n === 3) await userManagement();
    else if (n === 4) await databaseOps();
    else if (n === 5) await serviceStatus();
    else if (n === 6) await security();
    else              error('Enter a number between 1 and 7');
  }
}

main().catch((e) => {
  error(String(e));
  rl.close();
  process.exit(1);
});
