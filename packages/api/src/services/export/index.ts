import * as XLSX from 'xlsx';
import Database from 'better-sqlite3';
import { db } from '../../db/index.js';
import {
  users,
  videos,
  contentReports,
  adminAuditLog,
  analyticsSnapshots,
  paymentTransactions,
  renderJobs,
  userSanctions,
  organizations,
  organizationMembers,
} from '../../db/schema.js';
import { eq, and, gte, lte, desc, ilike, inArray, or } from 'drizzle-orm';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export type ExportFormat = 'csv' | 'xlsx' | 'sqlite';

export interface ExportOptions {
  format: ExportFormat;
  filters?: Record<string, unknown>;
  dateRange?: { from?: Date; to?: Date };
  columns?: string[];
  limit?: number;
}

export interface ExportResult {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  rowCount: number;
}

/**
 * Convert data array to CSV string
 */
function toCSV(data: Record<string, unknown>[], columns?: string[]): string {
  if (data.length === 0) return '';

  const headers = columns || Object.keys(data[0] || {});
  const rows = data.map((row) =>
    headers
      .map((h) => {
        const value = row[h];
        if (value === null || value === undefined) return '';
        const str = typeof value === 'object' ? JSON.stringify(value) : String(value);
        // Escape quotes and wrap in quotes if contains comma, quote, or newline
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      })
      .join(',')
  );

  return [headers.join(','), ...rows].join('\n');
}

/**
 * Convert data array to XLSX buffer
 */
function toXLSX(data: Record<string, unknown>[], sheetName: string, columns?: string[]): Buffer {
  const workbook = XLSX.utils.book_new();

  if (data.length === 0) {
    const worksheet = XLSX.utils.aoa_to_sheet([columns || ['No data']]);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  } else {
    const headers = columns || Object.keys(data[0] || {});
    const rows = data.map((row) => headers.map((h) => {
      const value = row[h];
      if (value === null || value === undefined) return '';
      if (typeof value === 'object') return JSON.stringify(value);
      return value;
    }));

    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);

    // Set column widths
    const colWidths = headers.map((h) => ({ wch: Math.max(h.length, 15) }));
    worksheet['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  }

  return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
}

/**
 * Convert data array to SQLite database buffer
 */
function toSQLite(data: Record<string, unknown>[], tableName: string, columns?: string[]): Buffer {
  // Create temp file for SQLite database
  const tmpDir = os.tmpdir();
  const tmpFile = path.join(tmpDir, `export_${Date.now()}.db`);

  try {
    const sqliteDb = new Database(tmpFile);

    if (data.length > 0) {
      const headers = columns || Object.keys(data[0] || {});

      // Create table with TEXT columns (SQLite is loosely typed)
      const createColumns = headers.map((h) => `"${h}" TEXT`).join(', ');
      sqliteDb.exec(`CREATE TABLE "${tableName}" (${createColumns})`);

      // Prepare insert statement
      const placeholders = headers.map(() => '?').join(', ');
      const insert = sqliteDb.prepare(
        `INSERT INTO "${tableName}" (${headers.map((h) => `"${h}"`).join(', ')}) VALUES (${placeholders})`
      );

      // Insert data in a transaction for performance
      const insertMany = sqliteDb.transaction((rows: Record<string, unknown>[]) => {
        for (const row of rows) {
          const values = headers.map((h) => {
            const value = row[h];
            if (value === null || value === undefined) return null;
            if (typeof value === 'object') return JSON.stringify(value);
            return String(value);
          });
          insert.run(...values);
        }
      });

      insertMany(data);
    } else {
      // Create empty table with basic structure
      sqliteDb.exec(`CREATE TABLE "${tableName}" (id TEXT)`);
    }

    sqliteDb.close();

    // Read file into buffer
    const buffer = fs.readFileSync(tmpFile);
    return buffer;
  } finally {
    // Clean up temp file
    try {
      fs.unlinkSync(tmpFile);
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Export data in the specified format
 */
function exportData(
  data: Record<string, unknown>[],
  options: ExportOptions,
  tableName: string,
  filenamePrefix: string
): ExportResult {
  const timestamp = new Date().toISOString().slice(0, 10);

  switch (options.format) {
    case 'csv': {
      const csv = toCSV(data, options.columns);
      return {
        buffer: Buffer.from(csv, 'utf-8'),
        filename: `${filenamePrefix}_${timestamp}.csv`,
        mimeType: 'text/csv',
        rowCount: data.length,
      };
    }
    case 'xlsx': {
      const xlsx = toXLSX(data, tableName, options.columns);
      return {
        buffer: xlsx,
        filename: `${filenamePrefix}_${timestamp}.xlsx`,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        rowCount: data.length,
      };
    }
    case 'sqlite': {
      const sqlite = toSQLite(data, tableName, options.columns);
      return {
        buffer: sqlite,
        filename: `${filenamePrefix}_${timestamp}.sqlite`,
        mimeType: 'application/x-sqlite3',
        rowCount: data.length,
      };
    }
    default:
      throw new Error(`Unsupported export format: ${options.format}`);
  }
}

/**
 * Export users data
 */
export async function exportUsers(options: ExportOptions): Promise<ExportResult> {
  const conditions = [];

  if (options.filters?.q) {
    const q = options.filters.q as string;
    conditions.push(
      or(
        ilike(users.handle, `%${q}%`),
        ilike(users.displayName, `%${q}%`)
      )
    );
  }

  if (options.filters?.verified === 'true') {
    conditions.push(eq(users.verified, true));
  } else if (options.filters?.verified === 'false') {
    conditions.push(eq(users.verified, false));
  }

  if (options.dateRange?.from) {
    conditions.push(gte(users.createdAt, options.dateRange.from));
  }
  if (options.dateRange?.to) {
    conditions.push(lte(users.createdAt, options.dateRange.to));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  const limit = options.limit || 10000;

  const data = await db
    .select({
      did: users.did,
      handle: users.handle,
      displayName: users.displayName,
      bio: users.bio,
      verified: users.verified,
      followerCount: users.followerCount,
      followingCount: users.followingCount,
      videoCount: users.videoCount,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(whereClause)
    .orderBy(desc(users.createdAt))
    .limit(limit);

  const formattedData = data.map((row) => ({
    ...row,
    createdAt: row.createdAt?.toISOString() || '',
  }));

  return exportData(formattedData, options, 'users', 'users_export');
}

/**
 * Export content reports data
 */
export async function exportReports(options: ExportOptions): Promise<ExportResult> {
  const conditions = [];

  if (options.filters?.status) {
    conditions.push(eq(contentReports.status, options.filters.status as string));
  }

  if (options.filters?.contentType) {
    conditions.push(eq(contentReports.contentType, options.filters.contentType as string));
  }

  if (options.dateRange?.from) {
    conditions.push(gte(contentReports.createdAt, options.dateRange.from));
  }
  if (options.dateRange?.to) {
    conditions.push(lte(contentReports.createdAt, options.dateRange.to));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  const limit = options.limit || 10000;

  const data = await db
    .select({
      id: contentReports.id,
      reporterDid: contentReports.reporterDid,
      contentType: contentReports.contentType,
      contentUri: contentReports.contentUri,
      reason: contentReports.reason,
      description: contentReports.description,
      status: contentReports.status,
      createdAt: contentReports.createdAt,
    })
    .from(contentReports)
    .where(whereClause)
    .orderBy(desc(contentReports.createdAt))
    .limit(limit);

  const formattedData = data.map((row) => ({
    ...row,
    createdAt: row.createdAt?.toISOString() || '',
  }));

  return exportData(formattedData, options, 'reports', 'reports_export');
}

/**
 * Export audit logs data
 */
export async function exportAuditLogs(options: ExportOptions): Promise<ExportResult> {
  const conditions = [];

  if (options.filters?.adminId) {
    conditions.push(eq(adminAuditLog.adminId, options.filters.adminId as string));
  }

  if (options.filters?.action) {
    conditions.push(ilike(adminAuditLog.action, `%${options.filters.action}%`));
  }

  if (options.dateRange?.from) {
    conditions.push(gte(adminAuditLog.createdAt, options.dateRange.from));
  }
  if (options.dateRange?.to) {
    conditions.push(lte(adminAuditLog.createdAt, options.dateRange.to));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  const limit = options.limit || 10000;

  const data = await db
    .select({
      id: adminAuditLog.id,
      adminId: adminAuditLog.adminId,
      action: adminAuditLog.action,
      targetType: adminAuditLog.targetType,
      targetId: adminAuditLog.targetId,
      details: adminAuditLog.details,
      createdAt: adminAuditLog.createdAt,
    })
    .from(adminAuditLog)
    .where(whereClause)
    .orderBy(desc(adminAuditLog.createdAt))
    .limit(limit);

  const formattedData = data.map((row) => ({
    ...row,
    details: row.details ? JSON.stringify(row.details) : '',
    createdAt: row.createdAt?.toISOString() || '',
  }));

  return exportData(formattedData, options, 'audit_logs', 'audit_logs_export');
}

/**
 * Export analytics data
 */
export async function exportAnalytics(options: ExportOptions): Promise<ExportResult> {
  const conditions = [];

  if (options.filters?.period) {
    conditions.push(eq(analyticsSnapshots.period, options.filters.period as string));
  }

  if (options.dateRange?.from) {
    conditions.push(gte(analyticsSnapshots.timestamp, options.dateRange.from));
  }
  if (options.dateRange?.to) {
    conditions.push(lte(analyticsSnapshots.timestamp, options.dateRange.to));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  const limit = options.limit || 10000;

  const data = await db
    .select({
      id: analyticsSnapshots.id,
      period: analyticsSnapshots.period,
      timestamp: analyticsSnapshots.timestamp,
      metrics: analyticsSnapshots.metrics,
    })
    .from(analyticsSnapshots)
    .where(whereClause)
    .orderBy(desc(analyticsSnapshots.timestamp))
    .limit(limit);

  const formattedData = data.map((row) => ({
    id: row.id,
    period: row.period,
    timestamp: row.timestamp?.toISOString() || '',
    metrics: row.metrics ? JSON.stringify(row.metrics) : '',
  }));

  return exportData(formattedData, options, 'analytics', 'analytics_export');
}

/**
 * Export payment transactions data
 */
export async function exportPayments(options: ExportOptions): Promise<ExportResult> {
  const conditions = [];

  if (options.filters?.status) {
    conditions.push(eq(paymentTransactions.status, options.filters.status as string));
  }

  if (options.filters?.gateway) {
    conditions.push(eq(paymentTransactions.gateway, options.filters.gateway as string));
  }

  if (options.dateRange?.from) {
    conditions.push(gte(paymentTransactions.createdAt, options.dateRange.from));
  }
  if (options.dateRange?.to) {
    conditions.push(lte(paymentTransactions.createdAt, options.dateRange.to));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  const limit = options.limit || 10000;

  const data = await db
    .select({
      id: paymentTransactions.id,
      userDid: paymentTransactions.userDid,
      type: paymentTransactions.type,
      amount: paymentTransactions.amount,
      currency: paymentTransactions.currency,
      status: paymentTransactions.status,
      gateway: paymentTransactions.gateway,
      gatewayTransactionId: paymentTransactions.gatewayTransactionId,
      description: paymentTransactions.description,
      createdAt: paymentTransactions.createdAt,
    })
    .from(paymentTransactions)
    .where(whereClause)
    .orderBy(desc(paymentTransactions.createdAt))
    .limit(limit);

  const formattedData = data.map((row) => ({
    ...row,
    amount: row.amount ? String(row.amount) : '0',
    createdAt: row.createdAt?.toISOString() || '',
  }));

  return exportData(formattedData, options, 'payments', 'payments_export');
}

/**
 * Export render jobs data
 */
export async function exportRenderJobs(options: ExportOptions): Promise<ExportResult> {
  const conditions = [];

  if (options.filters?.status) {
    conditions.push(eq(renderJobs.status, options.filters.status as string));
  }

  if (options.filters?.userId) {
    conditions.push(eq(renderJobs.userId, options.filters.userId as string));
  }

  if (options.dateRange?.from) {
    conditions.push(gte(renderJobs.createdAt, options.dateRange.from));
  }
  if (options.dateRange?.to) {
    conditions.push(lte(renderJobs.createdAt, options.dateRange.to));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  const limit = options.limit || 10000;

  const data = await db
    .select({
      id: renderJobs.id,
      projectId: renderJobs.projectId,
      userId: renderJobs.userId,
      status: renderJobs.status,
      priority: renderJobs.priority,
      progress: renderJobs.progress,
      error: renderJobs.error,
      createdAt: renderJobs.createdAt,
      startedAt: renderJobs.startedAt,
      completedAt: renderJobs.completedAt,
    })
    .from(renderJobs)
    .where(whereClause)
    .orderBy(desc(renderJobs.createdAt))
    .limit(limit);

  const formattedData = data.map((row) => ({
    ...row,
    createdAt: row.createdAt?.toISOString() || '',
    startedAt: row.startedAt?.toISOString() || '',
    completedAt: row.completedAt?.toISOString() || '',
  }));

  return exportData(formattedData, options, 'render_jobs', 'render_jobs_export');
}

/**
 * Export organizations data
 */
export async function exportOrganizations(options: ExportOptions): Promise<ExportResult> {
  const conditions = [];

  if (options.filters?.type) {
    conditions.push(eq(organizations.type, options.filters.type as string));
  }

  if (options.filters?.verified === 'true') {
    conditions.push(eq(organizations.verified, true));
  } else if (options.filters?.verified === 'false') {
    conditions.push(eq(organizations.verified, false));
  }

  if (options.dateRange?.from) {
    conditions.push(gte(organizations.createdAt, options.dateRange.from));
  }
  if (options.dateRange?.to) {
    conditions.push(lte(organizations.createdAt, options.dateRange.to));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  const limit = options.limit || 10000;

  const data = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      type: organizations.type,
      description: organizations.description,
      website: organizations.website,
      verified: organizations.verified,
      memberCount: organizations.memberCount,
      apiAccessEnabled: organizations.apiAccessEnabled,
      ownerDid: organizations.ownerDid,
      createdAt: organizations.createdAt,
    })
    .from(organizations)
    .where(whereClause)
    .orderBy(desc(organizations.createdAt))
    .limit(limit);

  const formattedData = data.map((row) => ({
    ...row,
    createdAt: row.createdAt?.toISOString() || '',
  }));

  return exportData(formattedData, options, 'organizations', 'organizations_export');
}

/**
 * Export user sanctions data
 */
export async function exportSanctions(options: ExportOptions): Promise<ExportResult> {
  const conditions = [];

  if (options.filters?.sanctionType) {
    conditions.push(eq(userSanctions.sanctionType, options.filters.sanctionType as string));
  }

  if (options.filters?.userDid) {
    conditions.push(eq(userSanctions.userDid, options.filters.userDid as string));
  }

  if (options.dateRange?.from) {
    conditions.push(gte(userSanctions.createdAt, options.dateRange.from));
  }
  if (options.dateRange?.to) {
    conditions.push(lte(userSanctions.createdAt, options.dateRange.to));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  const limit = options.limit || 10000;

  const data = await db
    .select({
      id: userSanctions.id,
      userDid: userSanctions.userDid,
      adminId: userSanctions.adminId,
      sanctionType: userSanctions.sanctionType,
      reason: userSanctions.reason,
      expiresAt: userSanctions.expiresAt,
      createdAt: userSanctions.createdAt,
    })
    .from(userSanctions)
    .where(whereClause)
    .orderBy(desc(userSanctions.createdAt))
    .limit(limit);

  const formattedData = data.map((row) => ({
    ...row,
    expiresAt: row.expiresAt?.toISOString() || '',
    createdAt: row.createdAt?.toISOString() || '',
  }));

  return exportData(formattedData, options, 'sanctions', 'sanctions_export');
}
