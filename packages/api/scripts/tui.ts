#!/usr/bin/env tsx
/**
 * Exprsn Administration TUI
 *
 * A full terminal UI for managing a running Exprsn instance via the HTTP API.
 * Run with:  cd packages/api && npx tsx scripts/tui.ts
 *   or:      pnpm --filter @exprsn/api tui
 *   or:      pnpm tui
 *
 * Flags:
 *   --url <url>    API base URL (default: http://localhost:3002)
 */

import * as readline from 'readline';
import { readFile, writeFile, access, mkdir } from 'fs/promises';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const CONFIG_DIR = join(homedir(), '.exprsn');
const CONFIG_PATH = join(CONFIG_DIR, 'tui.json');

interface TuiConfig {
  apiUrl: string;
  accessToken?: string;
  refreshToken?: string;
  handle?: string;
  did?: string;
  role?: string;
}

let config: TuiConfig = {
  apiUrl: 'http://localhost:3002',
};

async function loadConfig(): Promise<void> {
  // CLI flag takes priority
  const urlIdx = process.argv.indexOf('--url');
  if (urlIdx !== -1 && process.argv[urlIdx + 1]) {
    config.apiUrl = process.argv[urlIdx + 1];
  }

  try {
    const raw = await readFile(CONFIG_PATH, 'utf-8');
    const saved = JSON.parse(raw) as Partial<TuiConfig>;
    config = { ...config, ...saved };
    if (urlIdx !== -1 && process.argv[urlIdx + 1]) {
      config.apiUrl = process.argv[urlIdx + 1];
    }
  } catch {
    // No saved config
  }
}

async function saveConfig(): Promise<void> {
  try {
    await mkdir(CONFIG_DIR, { recursive: true });
  } catch { /* exists */ }
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

// ---------------------------------------------------------------------------
// ANSI color helpers
// ---------------------------------------------------------------------------

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
};

function success(msg: string) { console.log(`  ${C.green}✓${C.reset} ${msg}`); }
function error(msg: string)   { console.log(`  ${C.red}✗${C.reset} ${msg}`); }
function warn(msg: string)    { console.log(`  ${C.yellow}⚠${C.reset} ${msg}`); }
function info(msg: string)    { console.log(`  ${C.blue}ℹ${C.reset} ${msg}`); }
function dim(msg: string)     { console.log(`  ${C.dim}${msg}${C.reset}`); }

function header(text: string) {
  const line = '═'.repeat(text.length + 4);
  console.log(`\n${C.cyan}╔${line}╗${C.reset}`);
  console.log(`${C.cyan}║  ${C.bold}${text}${C.reset}${C.cyan}  ║${C.reset}`);
  console.log(`${C.cyan}╚${line}╝${C.reset}\n`);
}

function section(text: string) {
  console.log(`\n  ${C.bold}${C.blue}── ${text} ──${C.reset}`);
}

function statusBadge(status: string): string {
  const map: Record<string, string> = {
    active:    `${C.bgGreen}${C.white} ACTIVE ${C.reset}`,
    healthy:   `${C.bgGreen}${C.white} HEALTHY ${C.reset}`,
    running:   `${C.bgGreen}${C.white} RUNNING ${C.reset}`,
    connected: `${C.bgGreen}${C.white} CONNECTED ${C.reset}`,
    enabled:   `${C.bgGreen}${C.white} ENABLED ${C.reset}`,
    good:      `${C.bgGreen}${C.white} GOOD ${C.reset}`,
    warning:   `${C.bgYellow}${C.white} WARNING ${C.reset}`,
    degraded:  `${C.bgYellow}${C.white} DEGRADED ${C.reset}`,
    muted:     `${C.bgYellow}${C.white} MUTED ${C.reset}`,
    suspended: `${C.bgRed}${C.white} SUSPENDED ${C.reset}`,
    banned:    `${C.bgRed}${C.white} BANNED ${C.reset}`,
    inactive:  `${C.dim} INACTIVE ${C.reset}`,
    revoked:   `${C.bgRed}${C.white} REVOKED ${C.reset}`,
    expired:   `${C.bgRed}${C.white} EXPIRED ${C.reset}`,
    disabled:  `${C.dim} DISABLED ${C.reset}`,
    pending:   `${C.bgBlue}${C.white} PENDING ${C.reset}`,
  };
  return map[status?.toLowerCase()] || `${C.dim} ${status?.toUpperCase() || 'UNKNOWN'} ${C.reset}`;
}

function table(rows: [string, string][], colWidth = 28) {
  for (const [label, value] of rows) {
    const pad = ' '.repeat(Math.max(0, colWidth - label.length));
    console.log(`    ${C.dim}${label}${C.reset}${pad}${value}`);
  }
}

function dataTable(headers: string[], rows: string[][], colWidths?: number[]) {
  const widths = colWidths || headers.map((h, i) => {
    const maxData = rows.reduce((max, r) => Math.max(max, stripAnsi(r[i] || '').length), 0);
    return Math.max(h.length, maxData) + 2;
  });

  // Header
  const headerLine = headers.map((h, i) => h.padEnd(widths[i])).join('');
  console.log(`    ${C.bold}${headerLine}${C.reset}`);
  console.log(`    ${C.dim}${'─'.repeat(widths.reduce((s, w) => s + w, 0))}${C.reset}`);

  // Rows
  for (const row of rows) {
    const line = row.map((cell, i) => {
      const plain = stripAnsi(cell);
      const ansiExtra = cell.length - plain.length;
      return cell.padEnd(widths[i] + ansiExtra);
    }).join('');
    console.log(`    ${line}`);
  }
}

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

function truncate(str: string, len: number): string {
  if (!str) return '';
  return str.length > len ? str.slice(0, len - 1) + '…' : str;
}

function formatDate(d: string | Date | null | undefined): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toISOString().slice(0, 16).replace('T', ' ');
}

function formatDateShort(d: string | Date | null | undefined): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toISOString().slice(0, 10);
}

function relativeTime(d: string | Date | null | undefined): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDateShort(date);
}

function formatNumber(n: number | null | undefined): string {
  if (n == null) return '0';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
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
  const ans = await ask(`  ${C.yellow}${prompt} (y/N):${C.reset} `);
  return ans.toLowerCase() === 'y' || ans.toLowerCase() === 'yes';
}

async function confirmDangerous(prompt: string): Promise<boolean> {
  warn(prompt);
  const ans = await ask(`    Type ${C.red}YES${C.reset} to confirm: `);
  return ans === 'YES';
}

function pause() {
  return ask(`\n  ${C.dim}Press Enter to continue...${C.reset}`);
}

async function menu(items: string[], prompt = 'Choose an option'): Promise<number> {
  console.log('');
  items.forEach((item, i) => {
    const num = String(i + 1).padStart(2, ' ');
    if (item === 'Back' || item === 'Exit' || item === 'Logout & Exit') {
      console.log(`  ${C.dim}${num}) ${item}${C.reset}`);
    } else {
      console.log(`  ${C.cyan}${num})${C.reset} ${item}`);
    }
  });
  console.log('');
  while (true) {
    const ans = await ask(`  ${C.bold}${prompt}:${C.reset} `);
    if (ans.toLowerCase() === 'b' || ans.toLowerCase() === 'back') return items.length;
    if (ans.toLowerCase() === 'q' || ans.toLowerCase() === 'quit') return items.length;
    const n = parseInt(ans, 10);
    if (!isNaN(n) && n >= 1 && n <= items.length) return n;
    error(`Enter a number between 1 and ${items.length}, or 'b' to go back`);
  }
}

// ---------------------------------------------------------------------------
// HTTP API client
// ---------------------------------------------------------------------------

async function api(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  endpoint: string,
  body?: Record<string, unknown>,
  queryParams?: Record<string, string>,
): Promise<{ ok: boolean; status: number; data: any }> {
  let url = `${config.apiUrl}/xrpc/${endpoint}`;
  if (queryParams) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(queryParams)) {
      if (v !== undefined && v !== null && v !== '') params.set(k, v);
    }
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (config.accessToken) {
    headers['Authorization'] = `Bearer ${config.accessToken}`;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    let data: any;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    return { ok: res.ok, status: res.status, data };
  } catch (e: any) {
    if (e.name === 'AbortError') {
      return { ok: false, status: 0, data: { error: 'Timeout', message: 'Request timed out' } };
    }
    return { ok: false, status: 0, data: { error: 'NetworkError', message: e.message } };
  }
}

function apiGet(endpoint: string, params?: Record<string, string>) {
  return api('GET', endpoint, undefined, params);
}

function apiPost(endpoint: string, body?: Record<string, unknown>) {
  return api('POST', endpoint, body);
}

function apiPut(endpoint: string, body?: Record<string, unknown>) {
  return api('PUT', endpoint, body);
}

function apiDelete(endpoint: string, params?: Record<string, string>) {
  return api('DELETE', endpoint, undefined, params);
}

/** Resolve a handle (or DID) input to a DID. Returns null if not found. */
async function resolveDid(input: string): Promise<{ did: string; handle: string } | null> {
  if (input.startsWith('did:')) {
    const res = await apiGet('io.exprsn.admin.users.get', { did: input });
    if (res.ok) return { did: res.data.did, handle: res.data.handle };
    return null;
  }
  const search = await apiGet('io.exprsn.admin.users.list', { q: input.replace('@', ''), limit: '1' });
  if (search.ok && search.data.users?.[0]) {
    return { did: search.data.users[0].did, handle: search.data.users[0].handle };
  }
  return null;
}

function handleApiError(res: { ok: boolean; status: number; data: any }, context: string) {
  if (res.status === 401) {
    error(`Authentication failed — session may have expired. Use 'Login' from the main menu.`);
  } else if (res.status === 403) {
    error(`Permission denied: ${res.data?.message || 'insufficient permissions for this action'}`);
  } else if (res.status === 0) {
    error(`Cannot reach API at ${config.apiUrl} — is the server running?`);
  } else {
    error(`${context}: ${res.data?.message || res.data?.error || `HTTP ${res.status}`}`);
  }
}

// ---------------------------------------------------------------------------
// Connection & Auth
// ---------------------------------------------------------------------------

async function checkConnection(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${config.apiUrl}/health`, { signal: controller.signal });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
}

async function login(): Promise<boolean> {
  section('Login to Exprsn');
  console.log('');
  const identifier = await ask(`  ${C.bold}Handle or email:${C.reset} `);
  const password = await askPassword(`  ${C.bold}Password:${C.reset} `);

  if (!identifier || !password) {
    error('Both handle and password are required');
    return false;
  }

  const res = await apiPost('io.exprsn.auth.createSession', { identifier, password });
  if (!res.ok) {
    handleApiError(res, 'Login failed');
    return false;
  }

  config.accessToken = res.data.accessJwt;
  config.refreshToken = res.data.refreshJwt;
  config.handle = res.data.handle;
  config.did = res.data.did;
  await saveConfig();

  // Check admin access
  const session = await apiGet('io.exprsn.admin.getSession');
  if (!session.ok) {
    error('You do not have admin access. Contact a super_admin to grant you a role.');
    config.accessToken = undefined;
    config.refreshToken = undefined;
    await saveConfig();
    return false;
  }

  config.role = session.data.admin?.role;
  await saveConfig();

  success(`Logged in as ${C.bold}@${config.handle}${C.reset} (${config.role})`);
  return true;
}

function connectionBanner() {
  const serverLabel = config.apiUrl === 'http://localhost:3002'
    ? `${C.dim}localhost:3002${C.reset}`
    : `${C.yellow}${config.apiUrl}${C.reset}`;
  const userLabel = config.handle
    ? `${C.green}@${config.handle}${C.reset} ${C.dim}(${config.role || '?'})${C.reset}`
    : `${C.red}not logged in${C.reset}`;
  console.log(`  ${C.dim}Server:${C.reset} ${serverLabel}  ${C.dim}│${C.reset}  ${C.dim}User:${C.reset} ${userLabel}`);
}

// ---------------------------------------------------------------------------
// 1. Dashboard
// ---------------------------------------------------------------------------

async function dashboard() {
  header('Dashboard');

  // Fetch dashboard data
  const [statsRes, healthRes] = await Promise.all([
    apiGet('io.exprsn.admin.analytics.dashboard'),
    (async () => {
      try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(`${config.apiUrl}/health`, { signal: controller.signal });
        clearTimeout(t);
        return { ok: res.ok, data: await res.json() };
      } catch {
        return { ok: false, data: null };
      }
    })(),
  ]);

  if (healthRes.ok && healthRes.data) {
    section('System Health');
    const h = healthRes.data;
    table([
      ['Status', statusBadge(h.status)],
      ['Version', h.version || '—'],
      ['Uptime', h.uptime || '—'],
    ]);

    if (h.components) {
      console.log('');
      const compRows: string[][] = [];
      for (const [name, comp] of Object.entries(h.components as Record<string, any>)) {
        compRows.push([name, statusBadge(comp.status || comp)]);
      }
      for (const [name, status] of compRows) {
        console.log(`      ${name.padEnd(20)} ${status}`);
      }
    }
  }

  if (statsRes.ok && statsRes.data) {
    const s = statsRes.data;
    section('Platform Statistics');
    table([
      ['Total Users', formatNumber(s.totalUsers ?? s.users?.total)],
      ['Total Videos', formatNumber(s.totalVideos ?? s.videos?.total)],
      ['Total Views', formatNumber(s.totalViews ?? s.views?.total)],
      ['Active Today', formatNumber(s.activeToday ?? s.users?.activeToday)],
      ['New Users (7d)', formatNumber(s.newUsers7d ?? s.users?.new7d)],
      ['New Videos (7d)', formatNumber(s.newVideos7d ?? s.videos?.new7d)],
    ]);

    if (s.moderation) {
      section('Moderation');
      table([
        ['Pending Reports', formatNumber(s.moderation.pendingReports)],
        ['Queue Size', formatNumber(s.moderation.queueSize)],
        ['Open Appeals', formatNumber(s.moderation.openAppeals)],
      ]);
    }

    if (s.storage) {
      section('Storage');
      table([
        ['Used', s.storage.used || '—'],
        ['Videos Size', s.storage.videosSize || '—'],
      ]);
    }
  } else if (!statsRes.ok) {
    handleApiError(statsRes, 'Failed to load dashboard');
  }

  await pause();
}

// ---------------------------------------------------------------------------
// 2. User Management
// ---------------------------------------------------------------------------

async function userManagement() {
  while (true) {
    header('User Management');
    const choice = await menu([
      'List users',
      'Search users',
      'View user details',
      'Reset / set user password',
      'Update user profile',
      'Force logout user',
      'Sanction user (warn/mute/suspend/ban)',
      'Remove sanction',
      'Moderation history',
      'Verify / Unverify user',
      'View user sessions & tokens',
      'Admin team & roles  →',
      'Domain groups       →',
      'Domain roles        →',
      'Bulk actions         →',
      'Back',
    ]);

    if (choice === 16) return;

    if (choice === 1) {
      // List users
      const sortChoice = await menu(['Recent', 'Most followers', 'Most videos'], 'Sort by');
      const sortMap = ['recent', 'followers', 'videos'];
      const sort = sortMap[sortChoice - 1] || 'recent';

      const res = await apiGet('io.exprsn.admin.users.list', { sort, limit: '20' });
      if (!res.ok) { handleApiError(res, 'Failed to list users'); await pause(); continue; }

      section('Users');
      const rows = (res.data.users || []).map((u: any) => [
        `${C.cyan}@${truncate(u.handle, 18)}${C.reset}`,
        truncate(u.displayName || '—', 18),
        statusBadge(u.status || 'active'),
        formatNumber(u.followerCount),
        formatNumber(u.videoCount),
        relativeTime(u.createdAt),
      ]);
      dataTable(['Handle', 'Name', 'Status', 'Followers', 'Videos', 'Joined'], rows, [22, 20, 14, 12, 10, 14]);
      info(`Showing ${rows.length} users`);
      await pause();

    } else if (choice === 2) {
      // Search
      const query = await ask('  Search query: ');
      if (!query) continue;

      const res = await apiGet('io.exprsn.admin.users.list', { q: query, limit: '20' });
      if (!res.ok) { handleApiError(res, 'Search failed'); await pause(); continue; }

      const users = res.data.users || [];
      if (users.length === 0) { info('No users found'); await pause(); continue; }

      for (const u of users) {
        console.log(`  ${C.cyan}@${u.handle}${C.reset}  ${u.displayName || ''}  ${statusBadge(u.status || 'active')}  ${C.dim}${u.did}${C.reset}`);
      }
      await pause();

    } else if (choice === 3) {
      // View user details
      const input = await ask('  User DID or handle: ');
      if (!input) continue;

      const resolved = await resolveDid(input);
      if (!resolved) { error('User not found'); await pause(); continue; }

      const [detailRes, accountRes, memberRes] = await Promise.all([
        apiGet('io.exprsn.admin.users.get', { did: resolved.did }),
        apiGet('io.exprsn.admin.users.getAccountInfo', { did: resolved.did }),
        apiGet('io.exprsn.admin.users.getMemberships', { did: resolved.did }),
      ]);

      if (!detailRes.ok) { handleApiError(detailRes, 'Failed to load user'); await pause(); continue; }

      const u = detailRes.data;
      section(`User: @${u.handle}`);
      table([
        ['DID', u.did],
        ['Display Name', u.displayName || '—'],
        ['Handle', u.handle],
        ['Verified', u.verified ? `${C.green}Yes${C.reset}` : 'No'],
        ['Followers', formatNumber(u.followerCount)],
        ['Following', formatNumber(u.followingCount)],
        ['Videos', formatNumber(u.videoCount)],
        ['Created', formatDate(u.createdAt)],
        ['Status', statusBadge(u.status || 'active')],
      ]);

      if (accountRes.ok && accountRes.data.account) {
        const acct = accountRes.data.account;
        section('Account Info');
        table([
          ['Email', acct.email || '—'],
          ['Has Password', acct.hasPassword ? 'Yes' : 'No'],
          ['Account Status', acct.status || '—'],
          ['Active Sessions', String(acct.activeSessions ?? '—')],
        ]);
      }

      if (memberRes.ok) {
        const m = memberRes.data;
        if (m.domains?.length > 0) {
          section('Domain Memberships');
          for (const d of m.domains) console.log(`    ${C.cyan}${d.name || d.domainId}${C.reset}  ${C.dim}role: ${d.role || '—'}${C.reset}`);
        }
        if (m.organizations?.length > 0) {
          section('Organizations');
          for (const o of m.organizations) console.log(`    ${C.cyan}${o.name || o.orgId}${C.reset}  ${C.dim}role: ${o.role || '—'}${C.reset}`);
        }
        if (m.groups?.length > 0) {
          section('Groups');
          for (const g of m.groups) console.log(`    ${C.cyan}${g.name || g.groupId}${C.reset}`);
        }
      }

      if (u.sanctions?.length > 0) {
        section('Active Sanctions');
        for (const s of u.sanctions) {
          console.log(`    ${statusBadge(s.sanctionType)}  ${C.dim}${s.reason || 'No reason'}${C.reset}  ${C.dim}expires: ${s.expiresAt ? formatDate(s.expiresAt) : 'never'}${C.reset}`);
        }
      }

      if (u.recentVideos?.length > 0) {
        section('Recent Videos');
        for (const v of u.recentVideos.slice(0, 5)) {
          console.log(`    ${C.dim}${v.uri?.slice(0, 24) || '—'}${C.reset}  ${truncate(v.caption || '—', 40)}  ${formatDateShort(v.createdAt)}`);
        }
      }
      await pause();

    } else if (choice === 4) {
      // Reset / set password
      const input = await ask('  Handle or DID: ');
      if (!input) continue;

      const resolved = await resolveDid(input);
      if (!resolved) { error('User not found'); await pause(); continue; }

      console.log(`\n  Target: ${C.cyan}@${resolved.handle}${C.reset} (${resolved.did})`);
      const action = await menu([
        'Reset password (generate temporary)',
        'Set specific password',
        'Back',
      ], 'Action');

      if (action === 3) continue;

      if (action === 1) {
        if (!await confirm(`Reset password for @${resolved.handle}? All sessions will be invalidated.`)) continue;

        const res = await apiPost('io.exprsn.admin.users.resetPassword', { did: resolved.did });
        if (res.ok) {
          success('Password reset!');
          console.log(`\n    ${C.bold}Temporary password:${C.reset} ${C.cyan}${res.data.temporaryPassword}${C.reset}`);
          warn('User must change this password on next login.');
          info(`Sessions invalidated: all`);
        } else {
          handleApiError(res, 'Password reset failed');
        }
      } else {
        const newPw = await askPassword('  New password (min 8 chars): ');
        if (!newPw || newPw.length < 8) { error('Password must be at least 8 characters'); await pause(); continue; }
        const confirmPw = await askPassword('  Confirm password: ');
        if (newPw !== confirmPw) { error('Passwords do not match'); await pause(); continue; }

        const res = await apiPost('io.exprsn.admin.users.setPassword', { did: resolved.did, password: newPw });
        if (res.ok) success(`Password set for @${resolved.handle}`);
        else handleApiError(res, 'Failed to set password');
      }
      await pause();

    } else if (choice === 5) {
      // Update user profile
      const input = await ask('  Handle or DID: ');
      if (!input) continue;

      const resolved = await resolveDid(input);
      if (!resolved) { error('User not found'); await pause(); continue; }

      // Show current info
      const current = await apiGet('io.exprsn.admin.users.get', { did: resolved.did });
      if (current.ok) {
        console.log(`\n  Current profile for ${C.cyan}@${resolved.handle}${C.reset}:`);
        table([
          ['Display Name', current.data.displayName || '—'],
          ['Bio', truncate(current.data.bio || current.data.description || '—', 50)],
          ['Verified', current.data.verified ? 'Yes' : 'No'],
        ]);
      }

      console.log(`\n  ${C.dim}Leave blank to keep current value${C.reset}`);
      const displayName = await ask('  New display name: ');
      const bio = await ask('  New bio: ');
      const verifyStr = await ask('  Verified (true/false, Enter to skip): ');

      const updates: Record<string, unknown> = { did: resolved.did };
      if (displayName) updates.displayName = displayName;
      if (bio) updates.bio = bio;
      if (verifyStr === 'true') updates.verified = true;
      if (verifyStr === 'false') updates.verified = false;

      if (Object.keys(updates).length <= 1) { info('No changes made'); await pause(); continue; }

      const res = await apiPost('io.exprsn.admin.users.update', updates);
      if (res.ok) success(`Profile updated for @${resolved.handle}`);
      else handleApiError(res, 'Update failed');
      await pause();

    } else if (choice === 6) {
      // Force logout
      const input = await ask('  Handle or DID: ');
      if (!input) continue;

      const resolved = await resolveDid(input);
      if (!resolved) { error('User not found'); await pause(); continue; }

      if (!await confirm(`Force logout @${resolved.handle}? All sessions will be invalidated.`)) continue;

      const res = await apiPost('io.exprsn.admin.users.forceLogout', { did: resolved.did });
      if (res.ok) {
        success(`@${resolved.handle} logged out`);
        info(`Sessions invalidated: ${res.data.sessionsInvalidated ?? 'all'}`);
      } else {
        handleApiError(res, 'Force logout failed');
      }
      await pause();

    } else if (choice === 7) {
      // Sanction user
      const input = await ask('  Handle or DID: ');
      if (!input) continue;

      const resolved = await resolveDid(input);
      if (!resolved) { error('User not found'); await pause(); continue; }

      console.log(`\n  Target: ${C.cyan}@${resolved.handle}${C.reset} (${resolved.did})`);
      const typeIdx = await menu(['Warning', 'Mute', 'Suspend', 'Ban'], 'Sanction type');
      const types = ['warning', 'mute', 'suspend', 'ban'];
      const sanctionType = types[typeIdx - 1];

      const reason = await ask('  Reason: ');
      let expiresAt: string | undefined;
      if (sanctionType !== 'ban') {
        const dur = await ask('  Duration in hours (empty = permanent): ');
        if (dur && !isNaN(parseInt(dur))) {
          expiresAt = new Date(Date.now() + parseInt(dur) * 3600000).toISOString();
        }
      }

      if (!await confirm(`Apply ${sanctionType} to @${resolved.handle}?`)) continue;

      const res = await apiPost('io.exprsn.admin.users.sanction', {
        userDid: resolved.did,
        sanctionType,
        reason: reason || undefined,
        expiresAt: expiresAt || undefined,
      });
      if (res.ok) success(`${sanctionType} applied to @${resolved.handle}`);
      else handleApiError(res, 'Sanction failed');
      await pause();

    } else if (choice === 8) {
      // Remove sanction
      const input = await ask('  Handle or DID: ');
      if (!input) continue;

      const resolved = await resolveDid(input);
      if (!resolved) { error('User not found'); await pause(); continue; }

      const detailRes = await apiGet('io.exprsn.admin.users.get', { did: resolved.did });
      if (!detailRes.ok) { handleApiError(detailRes, 'Failed to load user'); await pause(); continue; }

      const sanctions = detailRes.data.sanctions || [];
      if (sanctions.length === 0) { info(`No active sanctions for @${resolved.handle}`); await pause(); continue; }

      console.log('');
      sanctions.forEach((s: any, i: number) => {
        console.log(`  ${i + 1}) ${statusBadge(s.sanctionType)}  ${s.reason || 'No reason'}  ${C.dim}expires: ${s.expiresAt ? formatDate(s.expiresAt) : 'never'}${C.reset}  ${C.dim}id: ${s.id}${C.reset}`);
      });

      const idx = await ask('\n  Sanction # to remove: ');
      const sanction = sanctions[parseInt(idx) - 1];
      if (!sanction) { error('Invalid selection'); await pause(); continue; }

      const removeReason = await ask('  Reason for removal (optional): ');

      const res = await apiPost('io.exprsn.admin.users.removeSanction', {
        sanctionId: sanction.id,
        reason: removeReason || undefined,
      });
      if (res.ok) success('Sanction removed');
      else handleApiError(res, 'Failed to remove sanction');
      await pause();

    } else if (choice === 9) {
      // Moderation history
      const input = await ask('  Handle or DID: ');
      if (!input) continue;

      const resolved = await resolveDid(input);
      if (!resolved) { error('User not found'); await pause(); continue; }

      const res = await apiGet('io.exprsn.admin.users.moderationHistory', { userDid: resolved.did, limit: '20' });
      if (!res.ok) { handleApiError(res, 'Failed to load moderation history'); await pause(); continue; }

      section(`Moderation History: @${resolved.handle}`);

      const d = res.data;
      if (d.counts) {
        table([
          ['Total Sanctions', formatNumber(d.counts.totalSanctions)],
          ['Active Sanctions', formatNumber(d.counts.activeSanctions)],
          ['Moderation Actions', formatNumber(d.counts.moderationActions)],
        ]);
      }

      if (d.activeSanctions?.length > 0) {
        section('Active Sanctions');
        for (const s of d.activeSanctions) {
          console.log(`    ${statusBadge(s.sanctionType)}  ${s.reason || '—'}  ${C.dim}since ${formatDate(s.createdAt)}  expires: ${s.expiresAt ? formatDate(s.expiresAt) : 'never'}${C.reset}`);
        }
      }

      const history = d.sanctions || d.moderationActions || [];
      if (history.length > 0) {
        section('History');
        for (const h of history.slice(0, 15)) {
          const action = h.action || h.sanctionType || '?';
          console.log(`    ${C.dim}${formatDate(h.createdAt)}${C.reset}  ${statusBadge(action)}  ${truncate(h.reason || h.note || '—', 40)}  ${C.dim}by ${h.adminHandle || h.adminId || '?'}${C.reset}`);
        }
      }
      await pause();

    } else if (choice === 10) {
      // Verify/Unverify
      const input = await ask('  Handle or DID: ');
      if (!input) continue;

      const resolved = await resolveDid(input);
      if (!resolved) { error('User not found'); await pause(); continue; }

      const action = await menu(['Verify', 'Unverify'], 'Action');
      const verified = action === 1;

      const res = await apiPost('io.exprsn.admin.users.update', {
        did: resolved.did,
        verified,
      });
      if (res.ok) success(`@${resolved.handle} is now ${verified ? 'verified' : 'unverified'}`);
      else handleApiError(res, 'Update failed');
      await pause();

    } else if (choice === 11) {
      // View sessions & tokens
      const input = await ask('  Handle or DID: ');
      if (!input) continue;

      const resolved = await resolveDid(input);
      if (!resolved) { error('User not found'); await pause(); continue; }

      const [sessRes, tokRes, certRes] = await Promise.all([
        apiGet('io.exprsn.admin.users.sessions', { did: resolved.did }),
        apiGet('io.exprsn.admin.users.tokens', { did: resolved.did }),
        apiGet('io.exprsn.admin.users.certificates', { did: resolved.did }),
      ]);

      section(`Sessions & Tokens: @${resolved.handle}`);

      if (sessRes.ok) {
        const sessions = sessRes.data.sessions || [];
        console.log(`\n    ${C.bold}Active Sessions (${sessions.length}):${C.reset}`);
        if (sessions.length === 0) { dim('    No active sessions'); }
        for (const s of sessions) {
          console.log(`      ${C.dim}${s.id?.slice(0, 12) || '—'}${C.reset}  ${s.ip || '—'}  ${C.dim}${truncate(s.userAgent || '', 30)}${C.reset}  ${relativeTime(s.createdAt)}`);
        }
      }

      if (tokRes.ok) {
        const tokens = tokRes.data.tokens || [];
        console.log(`\n    ${C.bold}API Tokens (${tokens.length}):${C.reset}`);
        if (tokens.length === 0) { dim('    No API tokens'); }
        for (const t of tokens) {
          console.log(`      ${statusBadge(t.status || 'active')} ${t.name || t.id}  ${C.dim}last used: ${relativeTime(t.lastUsedAt)}${C.reset}`);
        }
      }

      if (certRes.ok) {
        const certs = certRes.data.certificates || [];
        console.log(`\n    ${C.bold}Certificates (${certs.length}):${C.reset}`);
        if (certs.length === 0) { dim('    No certificates'); }
        for (const c of certs) {
          console.log(`      ${statusBadge(c.status || 'active')} ${c.commonName || c.id}  ${C.dim}type: ${c.certType || '?'}  expires: ${formatDateShort(c.notAfter)}${C.reset}`);
        }
      }
      await pause();

    } else if (choice === 12) {
      // Admin team & roles submenu
      await adminTeamManagement();

    } else if (choice === 13) {
      // Domain groups submenu
      await domainGroupManagement();

    } else if (choice === 14) {
      // Domain roles submenu
      await domainRoleManagement();

    } else if (choice === 15) {
      // Bulk actions submenu
      await bulkActions();
    }
  }
}

// ---------------------------------------------------------------------------
// 2a. Admin Team Management (sub-menu)
// ---------------------------------------------------------------------------

async function adminTeamManagement() {
  while (true) {
    header('Admin Team Management');
    const choice = await menu([
      'List admin team',
      'Set admin role',
      'Remove admin role',
      'View admin permissions',
      'Back',
    ]);

    if (choice === 5) return;

    if (choice === 1) {
      // List admin team
      const res = await apiGet('io.exprsn.admin.users.listAdmins');
      if (!res.ok) {
        const teamRes = await apiGet('io.exprsn.admin.team.list');
        if (!teamRes.ok) { handleApiError(res, 'Failed to list admins'); await pause(); continue; }
        const admins = teamRes.data.admins || teamRes.data.team || [];
        section('Admin Team');
        for (const a of admins) {
          console.log(`  ${C.cyan}@${a.handle || a.userDid || '?'}${C.reset}  ${statusBadge(a.role)}  ${C.dim}since ${formatDateShort(a.createdAt)}${C.reset}`);
        }
        await pause();
        continue;
      }
      const admins = res.data.admins || res.data.users || [];
      section('Admin Team');
      if (admins.length === 0) { info('No admins found'); }
      for (const a of admins) {
        console.log(`  ${C.cyan}@${a.handle || '?'}${C.reset}  ${statusBadge(a.role)}  ${C.dim}${a.did || a.userDid}${C.reset}  ${C.dim}last login: ${relativeTime(a.lastLoginAt)}${C.reset}`);
      }
      await pause();

    } else if (choice === 2) {
      // Set admin role
      const input = await ask('  Handle or DID: ');
      if (!input) continue;

      const resolved = await resolveDid(input);
      if (!resolved) { error('User not found'); await pause(); continue; }

      console.log(`\n  Target: ${C.cyan}@${resolved.handle}${C.reset}`);
      const roleIdx = await menu(['super_admin', 'admin', 'moderator', 'support'], 'Role');
      const roles = ['super_admin', 'admin', 'moderator', 'support'];
      const role = roles[roleIdx - 1];

      if (role === 'super_admin' && !await confirmDangerous(`Grant super_admin to @${resolved.handle}? This gives full system access.`)) continue;

      const res = await apiPost('io.exprsn.admin.users.setRole', { handle: resolved.handle, role });
      if (res.ok) success(`@${resolved.handle} set as ${role}`);
      else handleApiError(res, 'Failed to set role');
      await pause();

    } else if (choice === 3) {
      // Remove admin role
      const input = await ask('  Handle or DID: ');
      if (!input) continue;

      const resolved = await resolveDid(input);
      if (!resolved) { error('User not found'); await pause(); continue; }

      if (!await confirm(`Remove admin access from @${resolved.handle}?`)) continue;

      const res = await apiPost('io.exprsn.admin.users.removeRole', { handle: resolved.handle });
      if (res.ok) success(`Admin role removed from @${resolved.handle}`);
      else handleApiError(res, 'Failed to remove role');
      await pause();

    } else if (choice === 4) {
      // View available permissions
      const res = await apiGet('io.exprsn.admin.settings.auth.getAvailablePermissions');
      if (!res.ok) { handleApiError(res, 'Failed to load permissions'); await pause(); continue; }

      section('Available Admin Permissions');
      const perms = res.data.permissions || [];
      const categories = res.data.categories || [];

      if (categories.length > 0) {
        for (const cat of categories) {
          console.log(`\n    ${C.bold}${cat.name || cat.category || cat}${C.reset}`);
          const catPerms = perms.filter((p: any) => p.category === (cat.id || cat.category || cat));
          for (const p of catPerms) {
            console.log(`      ${C.cyan}${p.key || p.id}${C.reset}  ${C.dim}${p.description || ''}${C.reset}`);
          }
        }
      } else {
        for (const p of perms) {
          const perm = typeof p === 'string' ? p : (p.key || p.id || p);
          console.log(`    ${C.cyan}${perm}${C.reset}  ${C.dim}${p.description || ''}${C.reset}`);
        }
      }
      await pause();
    }
  }
}

// ---------------------------------------------------------------------------
// 2b. Domain Group Management (sub-menu)
// ---------------------------------------------------------------------------

async function domainGroupManagement() {
  while (true) {
    header('Domain Groups');

    // Prompt for domain ID at the top of each loop
    const domainId = await ask('  Domain ID (or "back" to return): ');
    if (!domainId || domainId === 'back' || domainId === 'b') return;

    const choice = await menu([
      'List groups',
      'View group details',
      'Create group',
      'Update group',
      'Delete group',
      'Manage group members',
      'Back',
    ]);

    if (choice === 7) return;

    if (choice === 1) {
      // List groups
      const res = await apiGet('io.exprsn.admin.domains.groups.list', { domainId, includeDefault: 'true', limit: '50' });
      if (!res.ok) { handleApiError(res, 'Failed to list groups'); await pause(); continue; }

      const groups = res.data.groups || [];
      section(`Groups in domain: ${domainId}`);
      if (groups.length === 0) { info('No groups found'); await pause(); continue; }

      const rows = groups.map((g: any) => [
        g.isDefault ? `${C.yellow}${g.name}${C.reset}` : `${C.cyan}${g.name}${C.reset}`,
        truncate(g.description || '—', 24),
        formatNumber(g.memberCount),
        g.isDefault ? `${C.dim}system${C.reset}` : 'custom',
        formatDateShort(g.createdAt),
      ]);
      dataTable(['Name', 'Description', 'Members', 'Type', 'Created'], rows, [20, 26, 10, 10, 12]);
      if (res.data.total) info(`Total: ${res.data.total}`);
      await pause();

    } else if (choice === 2) {
      // View group
      const groupId = await ask('  Group ID: ');
      if (!groupId) continue;

      const res = await apiGet('io.exprsn.admin.domains.groups.get', { groupId });
      if (!res.ok) { handleApiError(res, 'Failed to load group'); await pause(); continue; }

      const g = res.data;
      section(`Group: ${g.name}`);
      table([
        ['ID', g.id],
        ['Domain', g.domainId || domainId],
        ['Name', g.name],
        ['Description', g.description || '—'],
        ['Members', formatNumber(g.memberCount)],
        ['Default', g.isDefault ? 'Yes (system)' : 'No'],
        ['Created', formatDate(g.createdAt)],
      ]);

      if (g.permissions && Object.keys(g.permissions).length > 0) {
        section('Permissions');
        for (const [key, val] of Object.entries(g.permissions)) {
          console.log(`    ${C.cyan}${key}${C.reset}: ${String(val)}`);
        }
      }

      if (g.assignedRoles?.length > 0) {
        section('Assigned Roles');
        for (const r of g.assignedRoles) {
          console.log(`    ${C.cyan}${r.name || r.id || r}${C.reset}  ${C.dim}${r.displayName || ''}${C.reset}`);
        }
      }
      await pause();

    } else if (choice === 3) {
      // Create group
      section('Create Group');
      const name = await ask('  Group name: ');
      if (!name) continue;
      const description = await ask('  Description (optional): ');
      const isDefaultStr = await ask('  Set as default group for new users? (y/N): ');
      const isDefault = isDefaultStr.toLowerCase() === 'y';

      // Ask for role assignments
      const rolesRes = await apiGet('io.exprsn.admin.domain.roles.list', { domainId, limit: '50' });
      let roleIds: string[] | undefined;
      if (rolesRes.ok && rolesRes.data.roles?.length > 0) {
        const roles = rolesRes.data.roles;
        console.log('\n  Available roles:');
        roles.forEach((r: any, i: number) => {
          console.log(`    ${i + 1}) ${r.displayName || r.name}  ${C.dim}(${r.name})${C.reset}`);
        });
        const roleInput = await ask('  Assign roles (comma-separated #s, or Enter to skip): ');
        if (roleInput) {
          roleIds = roleInput.split(',').map((s: string) => {
            const idx = parseInt(s.trim()) - 1;
            return roles[idx]?.id;
          }).filter(Boolean);
        }
      }

      const res = await apiPost('io.exprsn.admin.domains.groups.create', {
        domainId,
        name,
        description: description || undefined,
        isDefault,
        roleIds: roleIds?.length ? roleIds : undefined,
      });

      if (res.ok) {
        success(`Group "${name}" created`);
        if (res.data.id) info(`ID: ${res.data.id}`);
      } else {
        handleApiError(res, 'Failed to create group');
      }
      await pause();

    } else if (choice === 4) {
      // Update group
      const groupId = await ask('  Group ID: ');
      if (!groupId) continue;

      // Show current
      const current = await apiGet('io.exprsn.admin.domains.groups.get', { groupId });
      if (current.ok) {
        console.log(`\n  Current: ${C.bold}${current.data.name}${C.reset}  ${C.dim}${current.data.description || ''}${C.reset}`);
      }

      console.log(`  ${C.dim}Leave blank to keep current value${C.reset}`);
      const name = await ask('  New name: ');
      const description = await ask('  New description: ');

      const updates: Record<string, unknown> = { groupId };
      if (name) updates.name = name;
      if (description) updates.description = description;

      if (Object.keys(updates).length <= 1) { info('No changes made'); await pause(); continue; }

      const res = await apiPost('io.exprsn.admin.domains.groups.update', updates);
      if (res.ok) success('Group updated');
      else handleApiError(res, 'Failed to update group');
      await pause();

    } else if (choice === 5) {
      // Delete group
      const groupId = await ask('  Group ID: ');
      if (!groupId) continue;

      if (!await confirmDangerous(`Delete group "${groupId}"? Members will be removed from the group.`)) continue;

      const res = await apiPost('io.exprsn.admin.domains.groups.delete', { groupId, domainId });
      if (res.ok) success('Group deleted');
      else handleApiError(res, 'Failed to delete group');
      await pause();

    } else if (choice === 6) {
      // Manage members
      const groupId = await ask('  Group ID: ');
      if (!groupId) continue;

      while (true) {
        const memberRes = await apiGet('io.exprsn.admin.domains.groups.members.list', { groupId, limit: '50' });
        if (!memberRes.ok) { handleApiError(memberRes, 'Failed to list members'); await pause(); break; }

        const members = memberRes.data.members || [];
        section(`Group Members (${members.length})`);
        if (members.length === 0) { info('No members'); }
        for (const m of members) {
          console.log(`    ${C.cyan}@${m.handle || m.userDid || '?'}${C.reset}  ${C.dim}${m.displayName || ''}${C.reset}  ${C.dim}joined: ${relativeTime(m.joinedAt || m.createdAt)}${C.reset}`);
        }

        const action = await menu(['Add member', 'Remove member', 'Back'], 'Action');
        if (action === 3) break;

        if (action === 1) {
          const memberInput = await ask('  Handle or DID to add: ');
          if (!memberInput) continue;
          const memberResolved = await resolveDid(memberInput);
          if (!memberResolved) { error('User not found'); continue; }

          const addRes = await apiPost('io.exprsn.admin.domains.groups.members.add', { groupId, userDid: memberResolved.did });
          if (addRes.ok) success(`@${memberResolved.handle} added to group`);
          else handleApiError(addRes, 'Failed to add member');

        } else if (action === 2) {
          const memberInput = await ask('  Handle or DID to remove: ');
          if (!memberInput) continue;
          const memberResolved = await resolveDid(memberInput);
          if (!memberResolved) { error('User not found'); continue; }

          const removeRes = await apiPost('io.exprsn.admin.domains.groups.members.remove', { groupId, userDid: memberResolved.did });
          if (removeRes.ok) success(`@${memberResolved.handle} removed from group`);
          else handleApiError(removeRes, 'Failed to remove member');
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 2c. Domain Role Management (sub-menu)
// ---------------------------------------------------------------------------

async function domainRoleManagement() {
  while (true) {
    header('Domain Roles');

    const domainId = await ask('  Domain ID (or "back" to return): ');
    if (!domainId || domainId === 'back' || domainId === 'b') return;

    const choice = await menu([
      'List roles',
      'View role details',
      'Create role',
      'Update role',
      'Delete role',
      'View permission catalog',
      'Back',
    ]);

    if (choice === 7) return;

    if (choice === 1) {
      // List roles
      const res = await apiGet('io.exprsn.admin.domain.roles.list', { domainId, includeSystem: 'true', limit: '50' });
      if (!res.ok) { handleApiError(res, 'Failed to list roles'); await pause(); continue; }

      const roles = res.data.roles || [];
      section(`Roles in domain: ${domainId}`);
      if (roles.length === 0) { info('No roles found'); await pause(); continue; }

      const rows = roles.map((r: any) => [
        r.isSystem ? `${C.yellow}${r.name}${C.reset}` : `${C.cyan}${r.name}${C.reset}`,
        truncate(r.displayName || '—', 20),
        String(r.priority ?? '—'),
        r.isSystem ? `${C.dim}system${C.reset}` : 'custom',
        formatNumber(r.permissions?.length ?? 0) + ' perms',
        formatDateShort(r.createdAt),
      ]);
      dataTable(['Name', 'Display Name', 'Priority', 'Type', 'Permissions', 'Created'], rows, [18, 22, 10, 10, 12, 12]);
      if (res.data.total) info(`Total: ${res.data.total}`);
      await pause();

    } else if (choice === 2) {
      // View role details
      const roleId = await ask('  Role ID: ');
      if (!roleId) continue;

      const res = await apiGet('io.exprsn.admin.domain.roles.get', { roleId });
      if (!res.ok) { handleApiError(res, 'Failed to load role'); await pause(); continue; }

      const r = res.data;
      section(`Role: ${r.displayName || r.name}`);
      table([
        ['ID', r.id],
        ['Name', r.name],
        ['Display Name', r.displayName || '—'],
        ['Description', r.description || '—'],
        ['Domain', r.domainId || domainId],
        ['Priority', String(r.priority ?? '—')],
        ['System Role', r.isSystem ? 'Yes (cannot edit/delete)' : 'No'],
        ['Created', formatDate(r.createdAt)],
        ['Updated', formatDate(r.updatedAt)],
      ]);

      if (r.permissions?.length > 0) {
        section('Permissions');
        for (const p of r.permissions) {
          console.log(`    ${C.cyan}${typeof p === 'string' ? p : p.key || p.id}${C.reset}`);
        }
      } else {
        dim('    No permissions assigned');
      }
      await pause();

    } else if (choice === 3) {
      // Create role
      section('Create Role');
      const name = await ask('  Role name (lowercase, alphanumeric, hyphens, underscores): ');
      if (!name) continue;
      if (!/^[a-z0-9_-]+$/.test(name)) { error('Name must be lowercase alphanumeric with hyphens/underscores only'); await pause(); continue; }

      const displayName = await ask('  Display name: ');
      const description = await ask('  Description (optional): ');
      const priorityStr = await ask('  Priority (number, higher = more authority, default 0): ');
      const priority = priorityStr ? parseInt(priorityStr) : 0;

      // Show permission catalog for selection
      const catalogRes = await apiGet('io.exprsn.admin.domain.permissions.catalog');
      let permissions: string[] = [];
      if (catalogRes.ok) {
        const allPerms = catalogRes.data.permissions || [];
        const categories = catalogRes.data.categories || [];

        if (categories.length > 0) {
          console.log('\n  Available permissions by category:');
          let idx = 1;
          const permList: { key: string; label: string }[] = [];
          for (const cat of categories) {
            console.log(`\n    ${C.bold}${cat.name || cat.category || cat}${C.reset}`);
            const catPerms = allPerms.filter((p: any) => p.category === (cat.id || cat.category || cat));
            for (const p of catPerms) {
              const key = typeof p === 'string' ? p : (p.key || p.id);
              console.log(`      ${C.dim}${String(idx).padStart(3)})${C.reset} ${key}  ${C.dim}${p.description || ''}${C.reset}`);
              permList.push({ key, label: p.description || '' });
              idx++;
            }
          }
          const permInput = await ask('\n  Select permissions (comma-separated #s, or Enter for none): ');
          if (permInput) {
            permissions = permInput.split(',').map((s: string) => {
              const i = parseInt(s.trim()) - 1;
              return permList[i]?.key;
            }).filter(Boolean);
          }
        } else if (allPerms.length > 0) {
          console.log('\n  Available permissions:');
          allPerms.forEach((p: any, i: number) => {
            const key = typeof p === 'string' ? p : (p.key || p.id);
            console.log(`    ${i + 1}) ${key}`);
          });
          const permInput = await ask('\n  Select permissions (comma-separated #s, or Enter for none): ');
          if (permInput) {
            permissions = permInput.split(',').map((s: string) => {
              const i = parseInt(s.trim()) - 1;
              const p = allPerms[i];
              return typeof p === 'string' ? p : (p.key || p.id);
            }).filter(Boolean);
          }
        }
      }

      const res = await apiPost('io.exprsn.admin.domain.roles.create', {
        domainId,
        name,
        displayName: displayName || name,
        description: description || undefined,
        priority,
        permissions: permissions.length > 0 ? permissions : undefined,
      });

      if (res.ok) {
        success(`Role "${displayName || name}" created`);
        if (res.data.id || res.data.role?.id) info(`ID: ${res.data.id || res.data.role?.id}`);
      } else {
        handleApiError(res, 'Failed to create role');
      }
      await pause();

    } else if (choice === 4) {
      // Update role
      const roleId = await ask('  Role ID: ');
      if (!roleId) continue;

      // Show current
      const current = await apiGet('io.exprsn.admin.domain.roles.get', { roleId });
      if (!current.ok) { handleApiError(current, 'Failed to load role'); await pause(); continue; }

      if (current.data.isSystem) {
        error('Cannot update system roles');
        await pause();
        continue;
      }

      console.log(`\n  Current: ${C.bold}${current.data.displayName || current.data.name}${C.reset}`);
      console.log(`  ${C.dim}Leave blank to keep current value${C.reset}`);

      const displayName = await ask('  New display name: ');
      const description = await ask('  New description: ');
      const priorityStr = await ask(`  New priority (current: ${current.data.priority ?? 0}): `);

      const updates: Record<string, unknown> = { roleId };
      if (displayName) updates.displayName = displayName;
      if (description) updates.description = description;
      if (priorityStr && !isNaN(parseInt(priorityStr))) updates.priority = parseInt(priorityStr);

      // Optionally update permissions
      const updatePerms = await confirm('Update permissions?');
      if (updatePerms) {
        const catalogRes = await apiGet('io.exprsn.admin.domain.permissions.catalog');
        if (catalogRes.ok) {
          const allPerms = catalogRes.data.permissions || [];
          const currentPerms = new Set((current.data.permissions || []).map((p: any) => typeof p === 'string' ? p : p.key));

          console.log('\n  Permissions (* = currently assigned):');
          const permList: string[] = [];
          allPerms.forEach((p: any, i: number) => {
            const key = typeof p === 'string' ? p : (p.key || p.id);
            const marker = currentPerms.has(key) ? `${C.green}*${C.reset}` : ' ';
            console.log(`    ${marker} ${i + 1}) ${key}`);
            permList.push(key);
          });
          const permInput = await ask('\n  New permissions (comma-separated #s): ');
          if (permInput) {
            updates.permissions = permInput.split(',').map((s: string) => {
              const idx = parseInt(s.trim()) - 1;
              return permList[idx];
            }).filter(Boolean);
          }
        }
      }

      if (Object.keys(updates).length <= 1) { info('No changes made'); await pause(); continue; }

      const res = await apiPut('io.exprsn.admin.domain.roles.update', updates);
      if (res.ok) success('Role updated');
      else handleApiError(res, 'Failed to update role');
      await pause();

    } else if (choice === 5) {
      // Delete role
      const roleId = await ask('  Role ID: ');
      if (!roleId) continue;

      // Check if system role
      const check = await apiGet('io.exprsn.admin.domain.roles.get', { roleId });
      if (check.ok && check.data.isSystem) {
        error('Cannot delete system roles');
        await pause();
        continue;
      }

      const roleName = check.ok ? (check.data.displayName || check.data.name) : roleId;
      if (!await confirmDangerous(`Delete role "${roleName}"? Users with this role will lose its permissions.`)) continue;

      const res = await apiDelete('io.exprsn.admin.domain.roles.delete', { roleId });
      if (res.ok) success('Role deleted');
      else handleApiError(res, 'Failed to delete role');
      await pause();

    } else if (choice === 6) {
      // Permission catalog
      const res = await apiGet('io.exprsn.admin.domain.permissions.catalog');
      if (!res.ok) { handleApiError(res, 'Failed to load permission catalog'); await pause(); continue; }

      section('Domain Permission Catalog');
      const perms = res.data.permissions || [];
      const categories = res.data.categories || [];

      if (categories.length > 0) {
        for (const cat of categories) {
          console.log(`\n    ${C.bold}${cat.name || cat.category || cat}${C.reset}`);
          const catPerms = perms.filter((p: any) => p.category === (cat.id || cat.category || cat));
          for (const p of catPerms) {
            const key = typeof p === 'string' ? p : (p.key || p.id);
            console.log(`      ${C.cyan}${key}${C.reset}  ${C.dim}${p.description || ''}${C.reset}`);
          }
        }
      } else {
        for (const p of perms) {
          const key = typeof p === 'string' ? p : (p.key || p.id);
          console.log(`    ${C.cyan}${key}${C.reset}  ${C.dim}${typeof p === 'object' ? (p.description || '') : ''}${C.reset}`);
        }
      }

      info(`Total: ${res.data.total ?? perms.length} permissions`);
      await pause();
    }
  }
}

// ---------------------------------------------------------------------------
// 2d. Bulk Actions (sub-menu)
// ---------------------------------------------------------------------------

async function bulkActions() {
  while (true) {
    header('Bulk User Actions');
    const choice = await menu([
      'Bulk sanction',
      'Bulk verify / unverify',
      'Bulk reset passwords',
      'Bulk force logout',
      'Bulk delete users',
      'Back',
    ]);

    if (choice === 6) return;

    // Common: collect user DIDs
    info('Enter handles or DIDs, one per line. Empty line when done.');
    const userDids: string[] = [];
    const resolvedHandles: string[] = [];
    while (true) {
      const input = await ask(`  ${C.dim}(${userDids.length} selected)${C.reset} User: `);
      if (!input) break;

      const resolved = await resolveDid(input);
      if (!resolved) { error(`User "${input}" not found — skipped`); continue; }
      if (userDids.includes(resolved.did)) { warn(`@${resolved.handle} already in list — skipped`); continue; }
      userDids.push(resolved.did);
      resolvedHandles.push(resolved.handle);
      success(`Added @${resolved.handle}`);
    }

    if (userDids.length === 0) { info('No users selected'); await pause(); continue; }

    console.log(`\n  ${C.bold}Selected ${userDids.length} user(s):${C.reset} ${resolvedHandles.map(h => `@${h}`).join(', ')}`);

    if (choice === 1) {
      // Bulk sanction
      const typeIdx = await menu(['Warning', 'Mute', 'Suspend', 'Ban'], 'Sanction type');
      const types = ['warning', 'mute', 'suspend', 'ban'];
      const sanctionType = types[typeIdx - 1];
      const reason = await ask('  Reason: ');
      let expiresAt: string | undefined;
      if (sanctionType !== 'ban') {
        const dur = await ask('  Duration in hours (empty = permanent): ');
        if (dur && !isNaN(parseInt(dur))) expiresAt = new Date(Date.now() + parseInt(dur) * 3600000).toISOString();
      }

      // Preview
      const preview = await apiPost('io.exprsn.admin.users.bulkActionPreview', { userDids, action: 'sanction', sanctionType });
      if (preview.ok && preview.data.preview?.warnings?.length > 0) {
        warn('Warnings:');
        for (const w of preview.data.preview.warnings) console.log(`    ${C.yellow}${w}${C.reset}`);
      }

      if (!await confirm(`Apply ${sanctionType} to ${userDids.length} users?`)) continue;

      const res = await apiPost('io.exprsn.admin.users.bulkSanction', {
        userDids,
        sanctionType,
        reason: reason || undefined,
        expiresAt,
      });
      if (res.ok) {
        success(`Bulk sanction complete: ${res.data.summary?.succeeded ?? '?'} succeeded, ${res.data.summary?.failed ?? 0} failed`);
      } else {
        handleApiError(res, 'Bulk sanction failed');
      }

    } else if (choice === 2) {
      // Bulk verify
      const action = await menu(['Verify all', 'Unverify all'], 'Action');
      const verified = action === 1;
      const reason = await ask('  Reason (optional): ');

      if (!await confirm(`${verified ? 'Verify' : 'Unverify'} ${userDids.length} users?`)) continue;

      const res = await apiPost('io.exprsn.admin.users.bulkVerify', { userDids, verified, reason: reason || undefined });
      if (res.ok) success(`Bulk ${verified ? 'verify' : 'unverify'} complete: ${res.data.summary?.succeeded ?? '?'} succeeded`);
      else handleApiError(res, 'Bulk verify failed');

    } else if (choice === 3) {
      // Bulk reset passwords
      if (!await confirmDangerous(`Reset passwords for ${userDids.length} users? All sessions will be invalidated.`)) continue;

      const res = await apiPost('io.exprsn.admin.users.bulkResetPassword', { userDids });
      if (res.ok) {
        success(`Passwords reset for ${res.data.summary?.succeeded ?? '?'} users`);
        const results = res.data.results || [];
        section('Temporary Passwords');
        for (const r of results) {
          if (r.temporaryPassword) {
            console.log(`    ${C.cyan}@${r.handle || r.did?.slice(0, 20) || '?'}${C.reset}: ${C.bold}${r.temporaryPassword}${C.reset}`);
          }
        }
        warn('Users must change these passwords on next login.');
      } else {
        handleApiError(res, 'Bulk password reset failed');
      }

    } else if (choice === 4) {
      // Bulk force logout
      if (!await confirm(`Force logout ${userDids.length} users?`)) continue;

      const res = await apiPost('io.exprsn.admin.users.bulkForceLogout', { userDids });
      if (res.ok) {
        success(`Force logout complete: ${res.data.summary?.totalSessionsInvalidated ?? '?'} sessions invalidated`);
      } else {
        handleApiError(res, 'Bulk force logout failed');
      }

    } else if (choice === 5) {
      // Bulk delete
      const reason = await ask('  Reason: ');
      const deleteType = await menu(['Soft delete (deactivate)', 'Hard delete (permanent)'], 'Delete type');
      const hardDelete = deleteType === 2;

      if (hardDelete) {
        if (!await confirmDangerous(`PERMANENTLY DELETE ${userDids.length} users? This CANNOT be undone.`)) continue;
      } else {
        if (!await confirm(`Soft-delete ${userDids.length} users?`)) continue;
      }

      const res = await apiPost('io.exprsn.admin.users.bulkDelete', { userDids, reason, hardDelete });
      if (res.ok) success(`Bulk delete complete: ${res.data.summary?.succeeded ?? '?'} succeeded`);
      else handleApiError(res, 'Bulk delete failed');
    }

    await pause();
  }
}

// ---------------------------------------------------------------------------
// 3. Content & Moderation
// ---------------------------------------------------------------------------

async function moderation() {
  while (true) {
    header('Content & Moderation');
    const choice = await menu([
      'Moderation overview',
      'Review moderation queue',
      'View content reports',
      'View appeals',
      'Manage featured content',
      'View recent videos',
      'Back',
    ]);

    if (choice === 7) return;

    if (choice === 1) {
      // Overview
      const res = await apiGet('io.exprsn.admin.moderation.getStats');
      if (!res.ok) { handleApiError(res, 'Failed to load moderation stats'); await pause(); continue; }

      const s = res.data;
      section('Moderation Overview');
      table([
        ['Pending Items', formatNumber(s.pendingCount ?? s.pending)],
        ['Reviewed Today', formatNumber(s.reviewedToday)],
        ['Approved Today', formatNumber(s.approvedToday)],
        ['Rejected Today', formatNumber(s.rejectedToday)],
        ['Open Appeals', formatNumber(s.openAppeals ?? s.appeals)],
        ['Auto-Flagged', formatNumber(s.autoFlagged)],
      ]);

      if (s.riskBreakdown) {
        section('Risk Distribution');
        for (const [level, count] of Object.entries(s.riskBreakdown)) {
          console.log(`    ${level.padEnd(15)} ${formatNumber(count as number)}`);
        }
      }
      await pause();

    } else if (choice === 2) {
      // Queue
      const res = await apiGet('io.exprsn.admin.moderation.getQueue', { limit: '15' });
      if (!res.ok) { handleApiError(res, 'Failed to load queue'); await pause(); continue; }

      const items = res.data.items || res.data.queue || [];
      section('Moderation Queue');
      if (items.length === 0) { info('Queue is empty!'); await pause(); continue; }

      items.forEach((item: any, i: number) => {
        console.log(`  ${C.cyan}${String(i + 1).padStart(2)})${C.reset} ${statusBadge(item.status || 'pending')} ${truncate(item.contentUri || item.uri || item.id, 30)}  ${C.dim}risk: ${item.riskScore ?? '?'}${C.reset}  ${relativeTime(item.createdAt)}`);
      });

      const actionIdx = await ask('\n  Enter # to review (or Enter to skip): ');
      if (!actionIdx) continue;

      const item = items[parseInt(actionIdx) - 1];
      if (!item) { error('Invalid selection'); continue; }

      console.log(`\n  ${C.bold}Content:${C.reset} ${item.contentUri || item.uri || item.id}`);
      if (item.reason) console.log(`  ${C.bold}Reason:${C.reset} ${item.reason}`);
      if (item.details) console.log(`  ${C.bold}Details:${C.reset} ${typeof item.details === 'string' ? item.details : JSON.stringify(item.details)}`);

      const decision = await menu(['Approve', 'Reject', 'Escalate', 'Skip'], 'Decision');
      if (decision === 4) continue;

      const actions = ['approve', 'reject', 'escalate'];
      const action = actions[decision - 1];
      const note = await ask('  Note (optional): ');

      const reviewRes = await apiPost('io.exprsn.admin.moderation.review', {
        itemId: item.id,
        action,
        note: note || undefined,
      });
      if (reviewRes.ok) success(`Item ${action}d`);
      else handleApiError(reviewRes, 'Review failed');

    } else if (choice === 3) {
      // Reports
      const res = await apiGet('io.exprsn.admin.reports.get', { limit: '15' });
      if (!res.ok) { handleApiError(res, 'Failed to load reports'); await pause(); continue; }

      const reports = res.data.reports || [];
      section('Content Reports');
      if (reports.length === 0) { info('No reports'); await pause(); continue; }

      for (const r of reports) {
        console.log(`  ${statusBadge(r.status || 'pending')} ${C.dim}${r.id?.slice(0, 12)}${C.reset}  ${truncate(r.reason || r.reportType || '—', 30)}  by ${C.cyan}${r.reporterDid?.slice(0, 20) || '?'}${C.reset}  ${relativeTime(r.createdAt)}`);
      }
      await pause();

    } else if (choice === 4) {
      // Appeals
      const res = await apiGet('io.exprsn.admin.moderation.getQueue', { status: 'appealed', limit: '15' });
      if (!res.ok) { handleApiError(res, 'Failed to load appeals'); await pause(); continue; }

      const appeals = res.data.items || res.data.appeals || [];
      section('Appeals');
      if (appeals.length === 0) { info('No open appeals'); await pause(); continue; }

      for (const a of appeals) {
        console.log(`  ${statusBadge(a.status || 'pending')} ${C.dim}${a.id?.slice(0, 12)}${C.reset}  ${truncate(a.appealReason || a.reason || '—', 40)}  ${relativeTime(a.createdAt)}`);
      }
      await pause();

    } else if (choice === 5) {
      // Featured content
      const res = await apiGet('io.exprsn.admin.featured.list');
      if (!res.ok) { handleApiError(res, 'Failed to load featured content'); await pause(); continue; }

      const featured = res.data.featured || res.data.items || [];
      section('Featured Content');
      if (featured.length === 0) { info('No featured content'); }
      for (const f of featured) {
        console.log(`  ${f.uri || f.contentUri || f.id}  ${C.dim}${f.title || truncate(f.caption || '', 30)}${C.reset}`);
      }
      await pause();

    } else if (choice === 6) {
      // Recent videos
      const res = await apiGet('io.exprsn.admin.videos.list', { limit: '20', sort: 'recent' });
      if (!res.ok) { handleApiError(res, 'Failed to load videos'); await pause(); continue; }

      const videos = res.data.videos || [];
      section('Recent Videos');
      const rows = videos.map((v: any) => [
        truncate(v.caption || '—', 30),
        `${C.cyan}@${truncate(v.handle || '?', 14)}${C.reset}`,
        formatNumber(v.viewCount || v.views),
        statusBadge(v.moderationStatus || v.status || 'active'),
        relativeTime(v.createdAt),
      ]);
      dataTable(['Caption', 'Author', 'Views', 'Status', 'Posted'], rows, [32, 18, 8, 14, 14]);
      await pause();
    }
  }
}

// ---------------------------------------------------------------------------
// 4. Certificate Authority
// ---------------------------------------------------------------------------

async function certificateAuthority() {
  while (true) {
    header('Certificate Authority');
    const choice = await menu([
      'CA overview & stats',
      'Initialize root CA',
      'List root CAs',
      'Create intermediate CA',
      'List intermediate CAs',
      'Issue entity certificate',
      'List all certificates',
      'Revoke certificate',
      'View expiring certificates',
      'Generate CRL',
      'CRL list',
      'OCSP status',
      'Verify certificate',
      'Back',
    ]);

    if (choice === 14) return;

    if (choice === 1) {
      // Stats
      const res = await apiGet('io.exprsn.ca.admin.getStats');
      if (!res.ok) { handleApiError(res, 'Failed to load CA stats'); await pause(); continue; }

      section('Certificate Authority Statistics');
      const s = res.data;
      table([
        ['Total Certificates', formatNumber(s.total ?? s.totalCertificates)],
        ['Active', formatNumber(s.active ?? s.activeCertificates)],
        ['Revoked', formatNumber(s.revoked ?? s.revokedCertificates)],
        ['Expired', formatNumber(s.expired ?? s.expiredCertificates)],
        ['Root CAs', formatNumber(s.rootCAs ?? s.roots)],
        ['Intermediate CAs', formatNumber(s.intermediateCAs ?? s.intermediates)],
        ['CRLs Generated', formatNumber(s.crlCount)],
      ]);
      await pause();

    } else if (choice === 2) {
      // Initialize root CA
      section('Initialize Root Certificate Authority');
      console.log('');
      const commonName = await ask('  Common Name (e.g., Exprsn Root CA): ');
      if (!commonName) continue;
      const organization = await ask('  Organization (optional): ');
      const validityYears = await ask('  Validity years (default: 10): ');

      if (!await confirmDangerous(`Initialize root CA "${commonName}"? This is a critical operation.`)) continue;

      const res = await apiPost('io.exprsn.admin.ca.roots.initialize', {
        commonName,
        organization: organization || undefined,
        validityYears: validityYears ? parseInt(validityYears) : 10,
      });

      if (res.ok) {
        success('Root CA initialized!');
        if (res.data.id) info(`ID: ${res.data.id}`);
        if (res.data.serialNumber) info(`Serial: ${res.data.serialNumber}`);
        if (res.data.fingerprint) info(`Fingerprint: ${res.data.fingerprint}`);
      } else {
        handleApiError(res, 'Failed to initialize root CA');
      }
      await pause();

    } else if (choice === 3) {
      // List root CAs
      const res = await apiGet('io.exprsn.admin.ca.roots.list');
      if (!res.ok) { handleApiError(res, 'Failed to list root CAs'); await pause(); continue; }

      const roots = res.data.roots || [];
      section('Root Certificate Authorities');
      if (roots.length === 0) {
        warn('No root CA found. Use "Initialize root CA" to create one.');
      } else {
        for (const ca of roots) {
          console.log(`  ${statusBadge(ca.status || 'active')} ${C.bold}${ca.commonName || ca.subject || ca.id}${C.reset}`);
          if (ca.serialNumber) dim(`    Serial: ${ca.serialNumber}`);
          if (ca.fingerprint) dim(`    Fingerprint: ${ca.fingerprint}`);
          if (ca.notAfter) dim(`    Expires: ${formatDate(ca.notAfter)}`);
        }
      }
      await pause();

    } else if (choice === 4) {
      // Create intermediate CA
      section('Create Intermediate Certificate Authority');
      console.log('');
      const commonName = await ask('  Common Name (e.g., Exprsn Signing CA): ');
      if (!commonName) continue;
      const organization = await ask('  Organization (optional): ');
      const validityYears = await ask('  Validity years (default: 5): ');

      const res = await apiPost('io.exprsn.admin.ca.intermediates.create', {
        commonName,
        organization: organization || undefined,
        validityYears: validityYears ? parseInt(validityYears) : 5,
      });

      if (res.ok) {
        success('Intermediate CA created!');
        if (res.data.id) info(`ID: ${res.data.id}`);
        if (res.data.serialNumber) info(`Serial: ${res.data.serialNumber}`);
      } else {
        handleApiError(res, 'Failed to create intermediate CA');
      }
      await pause();

    } else if (choice === 5) {
      // List intermediate CAs
      const res = await apiGet('io.exprsn.admin.ca.intermediates.list');
      if (!res.ok) { handleApiError(res, 'Failed to list CAs'); await pause(); continue; }

      const intermediates = res.data.intermediates || [];
      section('Intermediate Certificate Authorities');
      if (intermediates.length === 0) { info('No intermediate CAs found'); }
      for (const ca of intermediates) {
        console.log(`  ${statusBadge(ca.status || 'active')} ${C.bold}${ca.commonName || ca.subject || ca.id}${C.reset}`);
        if (ca.serialNumber) dim(`    Serial: ${ca.serialNumber}`);
        if (ca.notAfter) dim(`    Expires: ${formatDate(ca.notAfter)}`);
      }
      await pause();

    } else if (choice === 6) {
      // Issue certificate
      section('Issue Entity Certificate');
      console.log('');
      const commonName = await ask('  Common Name: ');
      if (!commonName) continue;

      const typeIdx = await menu(['Client', 'Server', 'Code Signing'], 'Certificate type');
      const certTypes = ['client', 'server', 'code_signing'];
      const certType = certTypes[typeIdx - 1];

      const email = await ask('  Email (optional): ');
      const validityDays = await ask('  Validity days (default: 365): ');

      // Get available issuers
      const issuersRes = await apiGet('io.exprsn.admin.ca.issuers.list');
      let issuerId: string | undefined;
      if (issuersRes.ok && issuersRes.data.issuers?.length > 0) {
        console.log('\n  Available issuers:');
        const issuers = issuersRes.data.issuers;
        issuers.forEach((iss: any, i: number) => {
          console.log(`    ${i + 1}) ${iss.subject || iss.id} (${iss.type})`);
        });
        const issIdx = await ask('  Issuer # (Enter for default): ');
        if (issIdx) issuerId = issuers[parseInt(issIdx) - 1]?.id;
      }

      const res = await apiPost('io.exprsn.admin.ca.certificates.issue', {
        commonName,
        certType,
        email: email || undefined,
        issuerId,
        validityDays: validityDays ? parseInt(validityDays) : 365,
      });

      if (res.ok) {
        success('Certificate issued!');
        if (res.data.id) info(`ID: ${res.data.id}`);
        if (res.data.serialNumber) info(`Serial: ${res.data.serialNumber}`);
        if (res.data.fingerprint) info(`Fingerprint: ${res.data.fingerprint}`);
        if (res.data.privateKey) {
          warn('Private key was returned — store it securely!');
          const show = await confirm('Show private key?');
          if (show) console.log(`\n${res.data.privateKey}\n`);
        }
      } else {
        handleApiError(res, 'Failed to issue certificate');
      }
      await pause();

    } else if (choice === 7) {
      // List all certificates
      const statusFilter = await ask('  Filter by status (active/revoked/expired, Enter for all): ');
      const typeFilter = await ask('  Filter by type (client/server/code_signing, Enter for all): ');

      const params: Record<string, string> = { limit: '20' };
      if (statusFilter) params.status = statusFilter;
      if (typeFilter) params.type = typeFilter;

      const res = await apiGet('io.exprsn.admin.ca.certificates.list', params);
      if (!res.ok) { handleApiError(res, 'Failed to list certificates'); await pause(); continue; }

      const certs = res.data.certificates || [];
      section('Certificates');
      if (certs.length === 0) { info('No certificates found'); await pause(); continue; }

      const rows = certs.map((cert: any) => [
        truncate(cert.subject || cert.commonName || cert.id, 24),
        cert.type || cert.certType || '—',
        statusBadge(cert.status || 'active'),
        cert.serialNumber?.slice(0, 12) || '—',
        formatDateShort(cert.notAfter),
      ]);
      dataTable(['Subject', 'Type', 'Status', 'Serial', 'Expires'], rows, [26, 14, 14, 14, 12]);

      if (res.data.total) info(`Total: ${res.data.total}`);
      await pause();

    } else if (choice === 8) {
      // Revoke
      const certId = await ask('  Certificate ID: ');
      if (!certId) continue;
      const reason = await ask('  Reason (optional): ');

      if (!await confirm(`Revoke certificate ${certId}?`)) continue;

      const res = await apiPost('io.exprsn.admin.ca.certificates.revoke', {
        certificateId: certId,
        reason: reason || 'unspecified',
      });
      if (res.ok) success('Certificate revoked');
      else handleApiError(res, 'Revocation failed');
      await pause();

    } else if (choice === 9) {
      // Expiring
      const days = await ask('  Days until expiry (default: 30): ');
      const res = await apiGet('io.exprsn.admin.ca.certificates.expiring', { days: days || '30' });
      if (!res.ok) { handleApiError(res, 'Failed to load expiring certs'); await pause(); continue; }

      const certs = res.data.certificates || [];
      section('Expiring Certificates');
      if (certs.length === 0) { success('No certificates expiring soon!'); await pause(); continue; }

      for (const cert of certs) {
        const daysLeft = cert.daysRemaining ?? Math.ceil((new Date(cert.notAfter).getTime() - Date.now()) / 86400000);
        const urgency = daysLeft <= 7 ? C.red : daysLeft <= 14 ? C.yellow : C.dim;
        console.log(`  ${urgency}${daysLeft}d${C.reset}  ${cert.commonName || cert.subject || cert.id}  ${C.dim}${cert.serialNumber?.slice(0, 12) || ''}${C.reset}`);
      }
      await pause();

    } else if (choice === 10) {
      // Generate CRL
      if (!await confirm('Generate a new Certificate Revocation List?')) continue;

      const res = await apiPost('io.exprsn.admin.ca.crl.generate', {});
      if (res.ok) {
        success('CRL generated');
        if (res.data.id) info(`CRL ID: ${res.data.id}`);
      } else {
        handleApiError(res, 'CRL generation failed');
      }
      await pause();

    } else if (choice === 11) {
      // CRL list
      const res = await apiGet('io.exprsn.admin.ca.crl.list');
      if (!res.ok) { handleApiError(res, 'Failed to list CRLs'); await pause(); continue; }

      const crls = res.data.crls || [];
      section('Certificate Revocation Lists');
      if (crls.length === 0) { info('No CRLs found'); }
      for (const crl of crls) {
        console.log(`  ${C.dim}${crl.id || '—'}${C.reset}  entries: ${crl.entryCount ?? '?'}  next update: ${formatDate(crl.nextUpdate)}`);
      }
      await pause();

    } else if (choice === 12) {
      // OCSP
      const res = await apiGet('io.exprsn.admin.ca.ocsp.status');
      if (!res.ok) { handleApiError(res, 'Failed to get OCSP status'); await pause(); continue; }

      section('OCSP Responder');
      const s = res.data;
      table([
        ['Enabled', s.enabled ? `${C.green}Yes${C.reset}` : `${C.red}No${C.reset}`],
        ['Total Requests', formatNumber(s.totalRequests)],
        ['Requests Today', formatNumber(s.requestsToday)],
        ['Cache Hit Rate', s.cacheHitRate != null ? `${(s.cacheHitRate * 100).toFixed(1)}%` : '—'],
      ]);

      const toggle = await confirm(`${s.enabled ? 'Disable' : 'Enable'} OCSP responder?`);
      if (toggle) {
        const toggleRes = await apiPost('io.exprsn.admin.ca.ocsp.toggle', { enabled: !s.enabled });
        if (toggleRes.ok) success(`OCSP responder ${!s.enabled ? 'enabled' : 'disabled'}`);
        else handleApiError(toggleRes, 'Toggle failed');
      }
      await pause();

    } else if (choice === 13) {
      // Verify
      console.log('  Paste PEM certificate (end with an empty line):');
      let pem = '';
      let line = '';
      while (true) {
        line = await ask('  ');
        if (line === '' && pem.includes('END CERTIFICATE')) break;
        pem += line + '\n';
      }

      const res = await apiPost('io.exprsn.admin.ca.certificates.verify', { certificatePem: pem.trim() });
      if (!res.ok) { handleApiError(res, 'Verification failed'); await pause(); continue; }

      section('Verification Result');
      const v = res.data;
      if (v.valid) {
        success('Certificate is VALID');
      } else {
        error(`Certificate is INVALID: ${v.reason || 'unknown'}`);
      }
      if (v.certificate) {
        table([
          ['Common Name', v.certificate.commonName || v.certificate.subject?.commonName || '—'],
          ['Issuer', v.certificate.issuer || '—'],
          ['Serial', v.certificate.serialNumber || '—'],
          ['Not Before', formatDate(v.certificate.notBefore)],
          ['Not After', formatDate(v.certificate.notAfter)],
          ['Is CA', String(v.certificate.isCA ?? '—')],
        ]);
      }
      await pause();
    }
  }
}

// ---------------------------------------------------------------------------
// 5. Domains & Organizations
// ---------------------------------------------------------------------------

async function domainsAndOrgs() {
  while (true) {
    header('Domains & Organizations');
    const choice = await menu([
      'List domains',
      'View domain details',
      'Create domain',
      'Delete domain',
      'List organizations',
      'View organization details',
      'Create organization',
      'Back',
    ]);

    if (choice === 8) return;

    if (choice === 1) {
      const res = await apiGet('io.exprsn.admin.domains.get', { limit: '20' });
      if (!res.ok) { handleApiError(res, 'Failed to list domains'); await pause(); continue; }

      const domainList = res.data.domains || [];
      section('Domains');
      if (domainList.length === 0) { info('No domains'); await pause(); continue; }

      const rows = domainList.map((d: any) => [
        `${C.cyan}${truncate(d.name || d.domain || d.id, 24)}${C.reset}`,
        statusBadge(d.status || 'active'),
        formatNumber(d.userCount ?? d.users),
        formatDateShort(d.createdAt),
      ]);
      dataTable(['Domain', 'Status', 'Users', 'Created'], rows, [28, 14, 10, 14]);
      await pause();

    } else if (choice === 2) {
      const domainId = await ask('  Domain ID or name: ');
      if (!domainId) continue;

      const res = await apiGet('io.exprsn.admin.domains.get', { id: domainId });
      if (!res.ok) { handleApiError(res, 'Failed to load domain'); await pause(); continue; }

      const d = res.data;
      section(`Domain: ${d.name || d.domain || d.id}`);
      table([
        ['ID', d.id || '—'],
        ['Name', d.name || d.domain || '—'],
        ['Status', d.status || '—'],
        ['Users', formatNumber(d.userCount)],
        ['Videos', formatNumber(d.videoCount)],
        ['Created', formatDate(d.createdAt)],
      ]);
      await pause();

    } else if (choice === 3) {
      section('Create Domain');
      const name = await ask('  Domain name: ');
      if (!name) continue;
      const description = await ask('  Description (optional): ');

      const res = await apiPost('io.exprsn.admin.domains.create', {
        name,
        description: description || undefined,
      });
      if (res.ok) success(`Domain "${name}" created`);
      else handleApiError(res, 'Failed to create domain');
      await pause();

    } else if (choice === 4) {
      const domainId = await ask('  Domain ID to delete: ');
      if (!domainId) continue;
      if (!await confirmDangerous(`Delete domain "${domainId}"? This cannot be undone.`)) continue;

      const res = await apiPost('io.exprsn.admin.domains.delete', { domainId });
      if (res.ok) success('Domain deleted');
      else handleApiError(res, 'Failed to delete domain');
      await pause();

    } else if (choice === 5) {
      const res = await apiGet('io.exprsn.admin.orgs.get', { limit: '20' });
      if (!res.ok) { handleApiError(res, 'Failed to list organizations'); await pause(); continue; }

      const orgs = res.data.organizations || [];
      section('Organizations');
      if (orgs.length === 0) { info('No organizations'); await pause(); continue; }

      for (const o of orgs) {
        console.log(`  ${C.cyan}${o.name || o.id}${C.reset}  ${C.dim}type: ${o.type || '?'}  members: ${o.memberCount ?? '?'}${C.reset}  ${statusBadge(o.status || 'active')}`);
      }
      await pause();

    } else if (choice === 6) {
      const orgId = await ask('  Organization ID: ');
      if (!orgId) continue;

      const res = await apiGet('io.exprsn.admin.orgs.get', { id: orgId });
      if (!res.ok) { handleApiError(res, 'Failed to load organization'); await pause(); continue; }

      const o = res.data;
      section(`Organization: ${o.name || o.id}`);
      table([
        ['ID', o.id || '—'],
        ['Name', o.name || '—'],
        ['Type', o.type || '—'],
        ['Members', formatNumber(o.memberCount)],
        ['Verified', String(o.verified ?? '—')],
        ['Created', formatDate(o.createdAt)],
      ]);
      await pause();

    } else if (choice === 7) {
      section('Create Organization');
      const name = await ask('  Name: ');
      if (!name) continue;
      const typeIdx = await menu(
        ['team', 'enterprise', 'nonprofit', 'business', 'company', 'network', 'label', 'brand', 'channel'],
        'Organization type',
      );
      const types = ['team', 'enterprise', 'nonprofit', 'business', 'company', 'network', 'label', 'brand', 'channel'];
      const type = types[typeIdx - 1];
      const description = await ask('  Description (optional): ');

      const res = await apiPost('io.exprsn.admin.orgs.create', {
        name,
        type,
        description: description || undefined,
      });
      if (res.ok) success(`Organization "${name}" created`);
      else handleApiError(res, 'Failed to create organization');
      await pause();
    }
  }
}

// ---------------------------------------------------------------------------
// 6. Federation & Identity
// ---------------------------------------------------------------------------

async function federationAndIdentity() {
  while (true) {
    header('Federation & Identity');
    const choice = await menu([
      'Federation settings',
      'Update federation settings',
      'Federated services',
      'Relay status & config',
      'PLC directory status',
      'Invite codes',
      'Announcements',
      'Back',
    ]);

    if (choice === 8) return;

    if (choice === 1) {
      const res = await apiGet('io.exprsn.admin.federation.getSettings');
      if (!res.ok) { handleApiError(res, 'Failed to load federation settings'); await pause(); continue; }

      section('Federation Settings');
      const s = res.data;
      if (s.federation) {
        const f = typeof s.federation === 'string' ? JSON.parse(s.federation) : s.federation;
        table(Object.entries(f).map(([k, v]) => [k, String(v)]) as [string, string][]);
      } else {
        info('No federation settings configured');
      }

      if (s.cache) {
        section('Cache Settings');
        const c = typeof s.cache === 'string' ? JSON.parse(s.cache) : s.cache;
        table(Object.entries(c).map(([k, v]) => [k, String(v)]) as [string, string][]);
      }
      await pause();

    } else if (choice === 2) {
      info('Enter settings as key=value pairs. Empty line to finish.');
      const settings: Record<string, any> = {};
      while (true) {
        const line = await ask('  ');
        if (!line) break;
        const [key, ...rest] = line.split('=');
        if (key && rest.length > 0) {
          const val = rest.join('=');
          settings[key.trim()] = val === 'true' ? true : val === 'false' ? false : isNaN(Number(val)) ? val : Number(val);
        }
      }

      if (Object.keys(settings).length === 0) continue;

      const res = await apiPost('io.exprsn.admin.federation.updateSettings', { federation: settings });
      if (res.ok) success('Federation settings updated');
      else handleApiError(res, 'Update failed');
      await pause();

    } else if (choice === 3) {
      const res = await apiGet('io.exprsn.admin.federation.getServices');
      if (!res.ok) { handleApiError(res, 'Failed to load services'); await pause(); continue; }

      const services = res.data.services || [];
      section('Federated Services');
      if (services.length === 0) { info('No federated services registered'); }
      for (const s of services) {
        console.log(`  ${statusBadge(s.status || 'active')} ${C.bold}${s.name || s.serviceId || s.id}${C.reset}  ${C.dim}${s.endpoint || s.url || ''}${C.reset}`);
      }
      await pause();

    } else if (choice === 4) {
      const [configRes, statsRes] = await Promise.all([
        apiGet('io.exprsn.admin.relay.getConfig'),
        apiGet('io.exprsn.admin.relay.getStats'),
      ]);

      section('Relay Configuration');
      if (configRes.ok) {
        const c = configRes.data;
        table([
          ['Enabled', String(c.enabled ?? '—')],
          ['Endpoint', c.endpoint || c.url || '—'],
          ['Protocol', c.protocol || '—'],
        ]);
      } else {
        handleApiError(configRes, 'Failed to load relay config');
      }

      if (statsRes.ok) {
        section('Relay Statistics');
        const s = statsRes.data;
        table([
          ['Events Processed', formatNumber(s.eventsProcessed ?? s.totalEvents)],
          ['Active Subscribers', formatNumber(s.activeSubscribers ?? s.subscribers)],
          ['Events/sec', String(s.eventsPerSecond ?? '—')],
          ['Lag', s.lag || '—'],
        ]);
      }
      await pause();

    } else if (choice === 5) {
      const [configRes, statsRes] = await Promise.all([
        apiGet('io.exprsn.admin.plc.getConfig'),
        apiGet('io.exprsn.admin.plc.getStats'),
      ]);

      section('PLC Directory');
      if (configRes.ok) {
        const c = configRes.data;
        table([
          ['Enabled', String(c.enabled ?? '—')],
          ['Endpoint', c.endpoint || c.url || '—'],
          ['Mode', c.mode || '—'],
        ]);
      }

      if (statsRes.ok) {
        section('PLC Statistics');
        const s = statsRes.data;
        table([
          ['Total Identities', formatNumber(s.totalIdentities ?? s.total)],
          ['Active', formatNumber(s.active)],
          ['Tombstoned', formatNumber(s.tombstoned)],
          ['Operations Today', formatNumber(s.operationsToday)],
        ]);
      }
      await pause();

    } else if (choice === 6) {
      // Invite codes
      const res = await apiGet('io.exprsn.admin.inviteCodes.list', { limit: '20' });
      if (!res.ok) { handleApiError(res, 'Failed to list invite codes'); await pause(); continue; }

      const codes = res.data.codes || res.data.inviteCodes || [];
      section('Invite Codes');
      if (codes.length === 0) { info('No invite codes'); }
      for (const code of codes) {
        const used = code.usedCount ?? code.used ?? 0;
        const max = code.maxUses ?? code.uses ?? '∞';
        console.log(`  ${C.cyan}${code.code}${C.reset}  ${used}/${max} used  ${statusBadge(code.status || (code.disabled ? 'disabled' : 'active'))}  ${C.dim}${relativeTime(code.createdAt)}${C.reset}`);
      }

      const action = await menu(['Create new code', 'Back'], 'Action');
      if (action === 1) {
        const maxUses = await ask('  Max uses (default: 1): ');
        const createRes = await apiPost('io.exprsn.admin.inviteCodes.create', {
          maxUses: maxUses ? parseInt(maxUses) : 1,
        });
        if (createRes.ok) {
          success(`Invite code created: ${C.bold}${C.cyan}${createRes.data.code || createRes.data.inviteCode}${C.reset}`);
        } else {
          handleApiError(createRes, 'Failed to create invite code');
        }
      }
      await pause();

    } else if (choice === 7) {
      // Announcements
      const res = await apiGet('io.exprsn.admin.announcements.list');
      if (!res.ok) { handleApiError(res, 'Failed to load announcements'); await pause(); continue; }

      const announcements = res.data.announcements || [];
      section('Announcements');
      if (announcements.length === 0) { info('No announcements'); }
      for (const a of announcements) {
        console.log(`  ${statusBadge(a.status || 'active')} ${C.bold}${truncate(a.title || '', 40)}${C.reset}`);
        if (a.body) dim(`    ${truncate(a.body, 60)}`);
        dim(`    ${formatDate(a.createdAt)}`);
      }

      const action = await menu(['Create announcement', 'Back'], 'Action');
      if (action === 1) {
        const title = await ask('  Title: ');
        const body = await ask('  Body: ');
        if (title) {
          const createRes = await apiPost('io.exprsn.admin.announcements.create', { title, body });
          if (createRes.ok) success('Announcement created');
          else handleApiError(createRes, 'Failed to create announcement');
        }
      }
      await pause();
    }
  }
}

// ---------------------------------------------------------------------------
// 7. Infrastructure
// ---------------------------------------------------------------------------

async function infrastructure() {
  while (true) {
    header('Infrastructure');
    const choice = await menu([
      'Render pipeline status',
      'Worker status',
      'Cluster management',
      'GPU overview',
      'Live streaming stats',
      'Prefetch engine status',
      'Back',
    ]);

    if (choice === 7) return;

    if (choice === 1) {
      const res = await apiGet('io.exprsn.admin.render.getQueueStats');
      if (!res.ok) { handleApiError(res, 'Failed to load render stats'); await pause(); continue; }

      section('Render Pipeline');
      const s = res.data;
      table([
        ['Queue Size', formatNumber(s.queueSize ?? s.waiting)],
        ['Active Jobs', formatNumber(s.activeJobs ?? s.active)],
        ['Completed (24h)', formatNumber(s.completed24h ?? s.completed)],
        ['Failed (24h)', formatNumber(s.failed24h ?? s.failed)],
        ['Avg Duration', s.avgDuration || '—'],
      ]);
      await pause();

    } else if (choice === 2) {
      const res = await apiGet('io.exprsn.admin.workers.list');
      if (!res.ok) { handleApiError(res, 'Failed to load workers'); await pause(); continue; }

      const workers = res.data.workers || [];
      section('Workers');
      if (workers.length === 0) { info('No workers registered'); await pause(); continue; }

      for (const w of workers) {
        console.log(`  ${statusBadge(w.status || 'active')} ${C.bold}${w.name || w.id}${C.reset}  ${C.dim}type: ${w.type || '?'}  jobs: ${w.activeJobs ?? '?'}/${w.maxConcurrency ?? '?'}${C.reset}`);
        if (w.lastHeartbeat) dim(`    Last heartbeat: ${relativeTime(w.lastHeartbeat)}`);
      }

      const action = await menu(['Drain a worker', 'Restart a worker', 'Back'], 'Action');
      if (action === 1) {
        const workerId = await ask('  Worker ID: ');
        if (workerId) {
          const drainRes = await apiPost('io.exprsn.admin.workers.drain', { workerId });
          if (drainRes.ok) success('Worker draining');
          else handleApiError(drainRes, 'Drain failed');
        }
      } else if (action === 2) {
        const workerId = await ask('  Worker ID: ');
        if (workerId) {
          const restartRes = await apiPost('io.exprsn.admin.workers.restart', { workerId });
          if (restartRes.ok) success('Worker restarting');
          else handleApiError(restartRes, 'Restart failed');
        }
      }
      await pause();

    } else if (choice === 3) {
      const res = await apiGet('io.exprsn.admin.cluster.list');
      if (!res.ok) { handleApiError(res, 'Failed to list clusters'); await pause(); continue; }

      const clusters = res.data.clusters || [];
      section('Clusters');
      if (clusters.length === 0) { info('No clusters configured'); }
      for (const cl of clusters) {
        console.log(`  ${statusBadge(cl.status || 'active')} ${C.bold}${cl.name || cl.id}${C.reset}  ${C.dim}nodes: ${cl.nodeCount ?? '?'}  ${cl.region || ''}${C.reset}`);
      }

      const action = await menu(['Create cluster', 'Scale cluster', 'View metrics', 'Back'], 'Action');
      if (action === 1) {
        const name = await ask('  Cluster name: ');
        const region = await ask('  Region: ');
        if (name) {
          const createRes = await apiPost('io.exprsn.admin.cluster.create', { name, region });
          if (createRes.ok) success(`Cluster "${name}" created`);
          else handleApiError(createRes, 'Failed to create cluster');
        }
      } else if (action === 2) {
        const clusterId = await ask('  Cluster ID: ');
        const replicas = await ask('  Target replicas: ');
        if (clusterId && replicas) {
          const scaleRes = await apiPost('io.exprsn.admin.cluster.scale', { clusterId, replicas: parseInt(replicas) });
          if (scaleRes.ok) success('Cluster scaling');
          else handleApiError(scaleRes, 'Scale failed');
        }
      } else if (action === 3) {
        const clusterId = await ask('  Cluster ID: ');
        if (clusterId) {
          const metricsRes = await apiGet('io.exprsn.admin.cluster.getMetrics', { clusterId });
          if (metricsRes.ok) {
            section('Cluster Metrics');
            const m = metricsRes.data;
            table([
              ['CPU Usage', `${m.cpuUsage ?? '?'}%`],
              ['Memory Usage', `${m.memoryUsage ?? '?'}%`],
              ['Disk Usage', `${m.diskUsage ?? '?'}%`],
              ['Active Pods', formatNumber(m.activePods)],
            ]);
          } else {
            handleApiError(metricsRes, 'Failed to load metrics');
          }
        }
      }
      await pause();

    } else if (choice === 4) {
      const res = await apiGet('io.exprsn.admin.gpu.overview');
      if (!res.ok) { handleApiError(res, 'Failed to load GPU overview'); await pause(); continue; }

      section('GPU Overview');
      const g = res.data;
      table([
        ['Total GPUs', formatNumber(g.totalGpus ?? g.total)],
        ['Available', formatNumber(g.available)],
        ['Allocated', formatNumber(g.allocated)],
        ['Utilization', g.utilization != null ? `${g.utilization}%` : '—'],
      ]);

      if (g.workers?.length > 0) {
        section('GPU Workers');
        for (const w of g.workers) {
          console.log(`  ${statusBadge(w.status || 'active')} ${w.name || w.id}  ${C.dim}${w.gpuModel || ''}  util: ${w.utilization ?? '?'}%${C.reset}`);
        }
      }
      await pause();

    } else if (choice === 5) {
      const res = await apiGet('io.exprsn.admin.live.getStats');
      if (!res.ok) { handleApiError(res, 'Failed to load live stats'); await pause(); continue; }

      section('Live Streaming');
      const s = res.data;
      table([
        ['Currently Live', formatNumber(s.currentLive ?? s.active)],
        ['Total Viewers', formatNumber(s.totalViewers ?? s.viewers)],
        ['Peak Viewers', formatNumber(s.peakViewers)],
        ['Streams Today', formatNumber(s.streamsToday)],
        ['Avg Duration', s.avgDuration || '—'],
      ]);
      await pause();

    } else if (choice === 6) {
      const res = await apiGet('io.exprsn.admin.prefetch.getConfig');
      if (!res.ok) { handleApiError(res, 'Failed to load prefetch config'); await pause(); continue; }

      section('Prefetch Engine');
      const p = res.data;
      table([
        ['Enabled', String(p.enabled ?? '—')],
        ['Cache Size', p.cacheSize || '—'],
        ['Hit Rate', p.hitRate != null ? `${(p.hitRate * 100).toFixed(1)}%` : '—'],
        ['Pending Jobs', formatNumber(p.pendingJobs)],
      ]);
      await pause();
    }
  }
}

// ---------------------------------------------------------------------------
// 8. Payments
// ---------------------------------------------------------------------------

async function payments() {
  while (true) {
    header('Payments');
    const choice = await menu([
      'Payment overview',
      'Configure provider',
      'Transaction history',
      'Refund transaction',
      'Back',
    ]);

    if (choice === 5) return;

    if (choice === 1) {
      const res = await apiGet('io.exprsn.admin.payments.getStats');
      if (!res.ok) { handleApiError(res, 'Failed to load payment stats'); await pause(); continue; }

      section('Payment Overview');
      const s = res.data;
      table([
        ['Total Revenue', s.totalRevenue || '—'],
        ['Transactions (30d)', formatNumber(s.transactions30d ?? s.recentTransactions)],
        ['Active Subscriptions', formatNumber(s.activeSubscriptions)],
        ['Refunds (30d)', formatNumber(s.refunds30d)],
      ]);

      if (s.providers) {
        section('Payment Providers');
        for (const p of (Array.isArray(s.providers) ? s.providers : Object.entries(s.providers).map(([k, v]) => ({ name: k, ...v as any })))) {
          console.log(`  ${statusBadge(p.status || p.enabled ? 'active' : 'inactive')} ${C.bold}${p.name || p.provider}${C.reset}`);
        }
      }
      await pause();

    } else if (choice === 2) {
      const providerIdx = await menu(['Stripe', 'PayPal', 'Authorize.net'], 'Provider');
      const providers = ['stripe', 'paypal', 'authorizenet'];
      const provider = providers[providerIdx - 1];

      info(`Configure ${provider}. Enter key=value pairs (empty line to finish):`);
      const settings: Record<string, string> = {};
      while (true) {
        const line = await ask('  ');
        if (!line) break;
        const [key, ...rest] = line.split('=');
        if (key && rest.length > 0) settings[key.trim()] = rest.join('=');
      }

      if (Object.keys(settings).length === 0) continue;

      const res = await apiPost('io.exprsn.admin.payments.config.update', { provider, settings });
      if (res.ok) success(`${provider} configuration updated`);
      else handleApiError(res, 'Update failed');
      await pause();

    } else if (choice === 3) {
      const limit = await ask('  Number of transactions (default 20): ');
      const res = await apiGet('io.exprsn.admin.payments.getTransactions', { limit: limit || '20' });
      if (!res.ok) { handleApiError(res, 'Failed to load transactions'); await pause(); continue; }

      const txns = res.data.transactions || [];
      section('Recent Transactions');
      if (txns.length === 0) { info('No transactions'); await pause(); continue; }

      for (const tx of txns) {
        console.log(`  ${statusBadge(tx.status || 'completed')} ${tx.id?.slice(0, 12) || '—'}  ${C.cyan}${tx.amount || '?'}${C.reset} ${tx.currency || ''}  ${C.dim}${tx.provider || '?'}  ${relativeTime(tx.createdAt)}${C.reset}`);
      }
      await pause();

    } else if (choice === 4) {
      const txId = await ask('  Transaction ID: ');
      if (!txId) continue;
      const reason = await ask('  Reason: ');

      if (!await confirm(`Refund transaction ${txId}?`)) continue;

      const res = await apiPost('io.exprsn.admin.payments.refund', { transactionId: txId, reason });
      if (res.ok) success('Refund processed');
      else handleApiError(res, 'Refund failed');
      await pause();
    }
  }
}

// ---------------------------------------------------------------------------
// 9. Settings & Security
// ---------------------------------------------------------------------------

async function settingsAndSecurity() {
  while (true) {
    header('Settings & Security');
    const choice = await menu([
      'Auth configuration',
      'Admin sessions',
      'API tokens',
      'SSO providers',
      'Themes',
      'Rate limit status',
      'Audit log',
      'Back',
    ]);

    if (choice === 8) return;

    if (choice === 1) {
      const res = await apiGet('io.exprsn.admin.settings.auth.getConfig');
      if (!res.ok) { handleApiError(res, 'Failed to load auth config'); await pause(); continue; }

      section('Authentication Configuration');
      const c = res.data;
      const entries = Object.entries(c).filter(([_, v]) => typeof v !== 'object');
      table(entries.map(([k, v]) => [k, String(v)]) as [string, string][]);
      await pause();

    } else if (choice === 2) {
      const res = await apiGet('io.exprsn.admin.settings.auth.listAdminSessions');
      if (!res.ok) { handleApiError(res, 'Failed to list sessions'); await pause(); continue; }

      const sessions = res.data.sessions || [];
      section('Admin Sessions');
      if (sessions.length === 0) { info('No active admin sessions'); await pause(); continue; }

      sessions.forEach((s: any, i: number) => {
        console.log(`  ${C.cyan}${String(i + 1).padStart(2)})${C.reset} ${C.bold}${s.handle || s.did || '?'}${C.reset}  ${C.dim}${s.ip || ''}  ${s.userAgent?.slice(0, 30) || ''}${C.reset}  ${relativeTime(s.lastActive || s.createdAt)}`);
      });

      const revoke = await ask('\n  Session # to revoke (Enter to skip): ');
      if (revoke) {
        const session = sessions[parseInt(revoke) - 1];
        if (session && await confirm(`Revoke session for ${session.handle || session.did}?`)) {
          const revokeRes = await apiPost('io.exprsn.admin.settings.auth.revokeSession', { sessionId: session.id });
          if (revokeRes.ok) success('Session revoked');
          else handleApiError(revokeRes, 'Revoke failed');
        }
      }
      await pause();

    } else if (choice === 3) {
      const res = await apiGet('io.exprsn.admin.tokens.list');
      if (!res.ok) { handleApiError(res, 'Failed to list tokens'); await pause(); continue; }

      const tokens = res.data.tokens || [];
      section('API Tokens');
      if (tokens.length === 0) { info('No API tokens'); }
      for (const t of tokens) {
        console.log(`  ${statusBadge(t.status || 'active')} ${C.bold}${t.name || t.id}${C.reset}  ${C.dim}scope: ${t.scope || t.permissions?.join(', ') || 'all'}  last used: ${relativeTime(t.lastUsedAt)}${C.reset}`);
      }

      const action = await menu(['Create token', 'Revoke token', 'Back'], 'Action');
      if (action === 1) {
        const name = await ask('  Token name: ');
        if (name) {
          const createRes = await apiPost('io.exprsn.admin.tokens.create', { name });
          if (createRes.ok) {
            success('Token created');
            if (createRes.data.token) {
              console.log(`\n  ${C.bold}Token:${C.reset} ${C.cyan}${createRes.data.token}${C.reset}`);
              warn('Copy this token now — it will not be shown again.');
            }
          } else {
            handleApiError(createRes, 'Failed to create token');
          }
        }
      } else if (action === 2) {
        const tokenId = await ask('  Token ID: ');
        if (tokenId) {
          const revokeRes = await apiPost('io.exprsn.admin.tokens.revoke', { tokenId });
          if (revokeRes.ok) success('Token revoked');
          else handleApiError(revokeRes, 'Revoke failed');
        }
      }
      await pause();

    } else if (choice === 4) {
      const res = await apiGet('io.exprsn.admin.auth.listProviders');
      if (!res.ok) { handleApiError(res, 'Failed to list SSO providers'); await pause(); continue; }

      const providers = res.data.providers || [];
      section('SSO Providers');
      if (providers.length === 0) { info('No SSO providers configured'); }
      for (const p of providers) {
        console.log(`  ${statusBadge(p.status || 'active')} ${C.bold}${p.name || p.id}${C.reset}  ${C.dim}type: ${p.type || p.protocol || '?'}${C.reset}`);
      }
      await pause();

    } else if (choice === 5) {
      const res = await apiGet('io.exprsn.admin.themes.get');
      if (!res.ok) { handleApiError(res, 'Failed to list themes'); await pause(); continue; }

      const themes = res.data.themes || [];
      section('Themes');
      if (themes.length === 0) { info('No custom themes'); }
      for (const t of themes) {
        console.log(`  ${statusBadge(t.active ? 'active' : 'inactive')} ${C.bold}${t.name || t.id}${C.reset}  ${C.dim}${t.description || ''}${C.reset}`);
      }
      await pause();

    } else if (choice === 6) {
      const res = await apiGet('io.exprsn.admin.settings.getRateLimitStatus');
      if (!res.ok) { handleApiError(res, 'Failed to load rate limit status'); await pause(); continue; }

      section('Rate Limiting');
      const r = res.data;
      table([
        ['Enabled', String(r.enabled ?? '—')],
        ['Global Limit', r.globalLimit || '—'],
        ['Window', r.window || '—'],
        ['Blocked IPs', formatNumber(r.blockedIPs ?? r.blocked)],
      ]);
      await pause();

    } else if (choice === 7) {
      const limit = await ask('  Number of entries (default 20): ');
      const res = await apiGet('io.exprsn.admin.audit.list', { limit: limit || '20' });
      if (!res.ok) { handleApiError(res, 'Failed to load audit log'); await pause(); continue; }

      const entries = res.data.entries || res.data.logs || [];
      section('Audit Log');
      if (entries.length === 0) { info('No audit entries'); await pause(); continue; }

      for (const e of entries) {
        const actor = e.adminHandle || e.adminId || '?';
        console.log(`  ${C.dim}${formatDate(e.createdAt)}${C.reset}  ${C.cyan}${actor}${C.reset}  ${C.bold}${e.action}${C.reset}  ${C.dim}${e.targetType || ''}:${e.targetId?.slice(0, 16) || ''}${C.reset}`);
      }
      await pause();
    }
  }
}

// ---------------------------------------------------------------------------
// Main menu loop
// ---------------------------------------------------------------------------

async function mainMenu() {
  while (true) {
    console.log(`\n${C.cyan}╔══════════════════════════════════════════╗${C.reset}`);
    console.log(`${C.cyan}║   ${C.bold}       Exprsn Admin TUI           ${C.reset}${C.cyan}   ║${C.reset}`);
    console.log(`${C.cyan}╚══════════════════════════════════════════╝${C.reset}`);
    connectionBanner();

    const items = [
      'Dashboard',
      'User Management',
      'Content & Moderation',
      'Certificate Authority',
      'Domains & Organizations',
      'Federation & Identity',
      'Infrastructure',
      'Payments',
      'Settings & Security',
      'Change server URL',
      'Re-login',
      'Logout & Exit',
    ];

    console.log('');
    items.forEach((item, i) => {
      const num = String(i + 1).padStart(2, ' ');
      if (item === 'Logout & Exit') {
        console.log(`  ${C.dim}${num}) ${item}${C.reset}`);
      } else if (i < 9) {
        console.log(`  ${C.cyan}${num})${C.reset} ${item}`);
      } else {
        console.log(`  ${C.dim}${num}) ${item}${C.reset}`);
      }
    });
    console.log('');

    const ans = await ask(`  ${C.bold}Choose an option:${C.reset} `);
    const n = parseInt(ans, 10);

    if (n === 12 || ans.toLowerCase() === 'q' || ans.toLowerCase() === 'exit') {
      config.accessToken = undefined;
      config.refreshToken = undefined;
      await saveConfig();
      console.log(`\n  ${C.dim}Goodbye.${C.reset}\n`);
      rl.close();
      process.exit(0);
    }

    switch (n) {
      case 1: await dashboard(); break;
      case 2: await userManagement(); break;
      case 3: await moderation(); break;
      case 4: await certificateAuthority(); break;
      case 5: await domainsAndOrgs(); break;
      case 6: await federationAndIdentity(); break;
      case 7: await infrastructure(); break;
      case 8: await payments(); break;
      case 9: await settingsAndSecurity(); break;
      case 10: {
        const url = await ask(`  New API URL (current: ${config.apiUrl}): `);
        if (url) {
          config.apiUrl = url.replace(/\/+$/, '');
          await saveConfig();
          success(`API URL set to ${config.apiUrl}`);

          const connected = await checkConnection();
          if (connected) success('Connection verified');
          else error('Could not connect to new URL');
        }
        break;
      }
      case 11: {
        await login();
        break;
      }
      default:
        error('Enter a number between 1 and 12');
    }
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main() {
  console.clear();
  await loadConfig();

  console.log(`\n${C.cyan}╔══════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.cyan}║   ${C.bold}       Exprsn Admin TUI           ${C.reset}${C.cyan}   ║${C.reset}`);
  console.log(`${C.cyan}╚══════════════════════════════════════════╝${C.reset}\n`);

  // Check connection
  process.stdout.write(`  Connecting to ${C.bold}${config.apiUrl}${C.reset}... `);
  const connected = await checkConnection();
  if (connected) {
    console.log(`${C.green}connected${C.reset}`);
  } else {
    console.log(`${C.red}failed${C.reset}`);
    warn(`Cannot reach ${config.apiUrl}. Make sure the API server is running.`);
    const newUrl = await ask(`  Enter API URL (or Enter to retry ${config.apiUrl}): `);
    if (newUrl) {
      config.apiUrl = newUrl.replace(/\/+$/, '');
      await saveConfig();
    }
    const retry = await checkConnection();
    if (!retry) {
      error('Still cannot connect. Start the server with: pnpm dev');
      const cont = await confirm('Continue anyway (some features won\'t work)?');
      if (!cont) {
        rl.close();
        process.exit(1);
      }
    }
  }

  // Check if we have a saved session
  if (config.accessToken) {
    process.stdout.write(`  Resuming session as ${C.cyan}@${config.handle}${C.reset}... `);
    const session = await apiGet('io.exprsn.admin.getSession');
    if (session.ok) {
      config.role = session.data.admin?.role;
      console.log(`${C.green}ok${C.reset} (${config.role})`);
    } else {
      console.log(`${C.red}expired${C.reset}`);
      config.accessToken = undefined;
      config.refreshToken = undefined;
      await saveConfig();
    }
  }

  // Login if needed
  if (!config.accessToken) {
    const loggedIn = await login();
    if (!loggedIn) {
      warn('Some features require authentication. You can log in later from the main menu.');
    }
  }

  await mainMenu();
}

main().catch((e) => {
  error(String(e));
  rl.close();
  process.exit(1);
});
