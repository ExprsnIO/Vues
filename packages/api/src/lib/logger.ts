/**
 * Lightweight structured logger for the Exprsn API.
 *
 * - Production (NODE_ENV=production): emits newline-delimited JSON compatible
 *   with Docker json-file log driver and Loki/Promtail.
 * - Development: emits colored, human-readable lines to stdout/stderr.
 *
 * Log level is controlled by the LOG_LEVEL env var.
 * Defaults: "info" in production, "debug" in development.
 */

export interface LogContext {
  requestId?: string;
  userDid?: string;
  [key: string]: unknown;
}

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// ANSI color codes for development output
const COLORS: Record<LogLevel, string> = {
  debug: '\x1b[36m', // cyan
  info: '\x1b[32m',  // green
  warn: '\x1b[33m',  // yellow
  error: '\x1b[31m', // red
};
const RESET = '\x1b[0m';
const DIM = '\x1b[2m';

function getConfiguredLevel(): LogLevel {
  const fromEnv = (process.env.LOG_LEVEL || '').toLowerCase() as LogLevel;
  if (fromEnv in LEVELS) return fromEnv;
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
}

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const MIN_LEVEL = LEVELS[getConfiguredLevel()];

function shouldLog(level: LogLevel): boolean {
  return LEVELS[level] >= MIN_LEVEL;
}

function formatJson(
  level: LogLevel,
  name: string,
  message: string,
  ctx?: LogContext,
): string {
  const entry: Record<string, unknown> = {
    level,
    msg: message,
    timestamp: new Date().toISOString(),
    service: 'api',
    name,
    ...ctx,
  };
  return JSON.stringify(entry);
}

function formatHuman(
  level: LogLevel,
  name: string,
  message: string,
  ctx?: LogContext,
): string {
  const color = COLORS[level];
  const label = `${color}[${level.toUpperCase()}]${RESET}`;
  const nameTag = `${DIM}[${name}]${RESET}`;

  // Serialize extra context fields (excluding well-known ones) inline
  let extra = '';
  if (ctx) {
    const { requestId, userDid, ...rest } = ctx;
    const parts: string[] = [];
    if (requestId) parts.push(`requestId=${requestId}`);
    if (userDid) parts.push(`userDid=${userDid}`);
    for (const [k, v] of Object.entries(rest)) {
      parts.push(`${k}=${typeof v === 'object' ? JSON.stringify(v) : String(v)}`);
    }
    if (parts.length > 0) extra = ' ' + parts.join(' ');
  }

  return `${label} ${nameTag} ${message}${extra}`;
}

function write(level: LogLevel, line: string): void {
  if (level === 'error' || level === 'warn') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
}

export interface Logger {
  debug(message: string, ctx?: LogContext): void;
  info(message: string, ctx?: LogContext): void;
  warn(message: string, ctx?: LogContext): void;
  error(message: string, ctx?: LogContext): void;
}

/**
 * Create a named logger instance.
 *
 * @param name - Module or subsystem name (e.g. "auth", "feed", "payments")
 *
 * @example
 * const logger = createLogger('auth');
 * logger.info('Login successful', { requestId, userDid });
 * logger.error('Token validation failed', { requestId, error: err.message });
 */
export function createLogger(name: string): Logger {
  function log(level: LogLevel, message: string, ctx?: LogContext): void {
    if (!shouldLog(level)) return;

    const line = IS_PRODUCTION
      ? formatJson(level, name, message, ctx)
      : formatHuman(level, name, message, ctx);

    write(level, line);
  }

  return {
    debug: (msg, ctx) => log('debug', msg, ctx),
    info: (msg, ctx) => log('info', msg, ctx),
    warn: (msg, ctx) => log('warn', msg, ctx),
    error: (msg, ctx) => log('error', msg, ctx),
  };
}
