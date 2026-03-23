import ExcelJS from 'exceljs';
import { parse as csvParse } from 'csv-parse/sync';
import Database from 'better-sqlite3';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import { users, organizationMembers, bulkImportJobs, actorRepos } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

// Reserved handles that cannot be used
const RESERVED_HANDLES = [
  'admin', 'api', 'app', 'auth', 'root', 'system', 'exprsn',
  'support', 'help', 'about', 'settings', 'profile', 'login',
  'signup', 'logout', 'register', 'messages', 'notifications',
  'search', 'discover', 'explore', 'trending', 'live', 'upload',
];

// User row structure from import file
export interface UserImportRow {
  email: string;
  handle: string;
  password: string;
  displayName?: string;
  bio?: string;
  role?: 'admin' | 'member';
  avatarUrl?: string;
  website?: string;
  customFields?: Record<string, unknown>;
}

// Validation result for a single row
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  sanitizedRow?: UserImportRow;
}

// Import job result
export interface ImportResult {
  totalRows: number;
  processedRows: number;
  successCount: number;
  errorCount: number;
  errors: { row: number; field?: string; error: string }[];
}

/**
 * Sanitize string input to prevent SQL injection and XSS
 */
export function sanitizeInput(value: string | undefined | null): string {
  if (!value) return '';

  let result = value
    .toString()
    .trim()
    // Remove null bytes
    .replace(/\0/g, '')
    // Escape single quotes for SQL
    .replace(/'/g, "''");

  // Remove all HTML tags (loop until stable to prevent bypass via nesting)
  let previous = result;
  do {
    previous = result;
    result = result.replace(/<[^>]*>/g, '');
  } while (result !== previous);

  // Remove on* event handlers (loop until stable to prevent bypass via nesting)
  previous = result;
  do {
    previous = result;
    result = result.replace(/\bon\w+\s*=/gi, '');
  } while (result !== previous);

  // Limit length
  return result.substring(0, 1000);
}

/**
 * Validate email format using RFC 5322 pattern
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  return emailRegex.test(email) && email.length <= 254;
}

/**
 * Validate handle format
 */
function isValidHandle(handle: string): boolean {
  // 3-20 characters, alphanumeric and underscores, no leading/trailing underscores
  const handleRegex = /^[a-zA-Z0-9][a-zA-Z0-9_]{1,18}[a-zA-Z0-9]$|^[a-zA-Z0-9]{3}$/;
  return handleRegex.test(handle) && !RESERVED_HANDLES.includes(handle.toLowerCase());
}

/**
 * Validate password requirements
 */
function isValidPassword(password: string): boolean {
  return password.length >= 8 && password.length <= 128;
}

/**
 * Check for suspicious patterns that might indicate SQL injection attempts
 */
function hasSuspiciousPatterns(value: string): boolean {
  const suspiciousPatterns = [
    /;\s*DROP\s+TABLE/i,
    /;\s*DELETE\s+FROM/i,
    /;\s*UPDATE\s+\w+\s+SET/i,
    /;\s*INSERT\s+INTO/i,
    /UNION\s+SELECT/i,
    /--\s*$/,
    /\/\*[\s\S]*\*\//,
    /\bEXEC\b/i,
    /\bEXECUTE\b/i,
    /\bxp_/i,
  ];

  return suspiciousPatterns.some(pattern => pattern.test(value));
}

/**
 * Validate a single user row
 */
export function validateRow(row: Record<string, unknown>, rowNumber: number): ValidationResult {
  const errors: string[] = [];

  // Extract and sanitize values
  const email = sanitizeInput(row.email as string);
  const handle = sanitizeInput(row.handle as string);
  const password = row.password as string; // Don't sanitize password
  const displayName = sanitizeInput(row.displayName as string || row.display_name as string);
  const bio = sanitizeInput(row.bio as string);
  const role = (row.role as string)?.toLowerCase() as 'admin' | 'member' | undefined;
  const avatarUrl = sanitizeInput(row.avatarUrl as string || row.avatar_url as string);
  const website = sanitizeInput(row.website as string);

  // Check for suspicious patterns
  const allValues = [email, handle, displayName, bio, website].filter(Boolean);
  for (const value of allValues) {
    if (hasSuspiciousPatterns(value)) {
      errors.push(`Row ${rowNumber}: Contains suspicious patterns that may indicate an injection attempt`);
      return { valid: false, errors };
    }
  }

  // Validate required fields
  if (!email) {
    errors.push(`Row ${rowNumber}: Email is required`);
  } else if (!isValidEmail(email)) {
    errors.push(`Row ${rowNumber}: Invalid email format`);
  }

  if (!handle) {
    errors.push(`Row ${rowNumber}: Handle is required`);
  } else if (!isValidHandle(handle)) {
    errors.push(`Row ${rowNumber}: Handle must be 3-20 characters, alphanumeric and underscores only`);
  }

  if (!password) {
    errors.push(`Row ${rowNumber}: Password is required`);
  } else if (!isValidPassword(password)) {
    errors.push(`Row ${rowNumber}: Password must be 8-128 characters`);
  }

  // Validate optional fields
  if (role && !['admin', 'member'].includes(role)) {
    errors.push(`Row ${rowNumber}: Role must be 'admin' or 'member'`);
  }

  if (avatarUrl && !avatarUrl.startsWith('http')) {
    errors.push(`Row ${rowNumber}: Avatar URL must be a valid URL`);
  }

  if (website && !website.startsWith('http')) {
    errors.push(`Row ${rowNumber}: Website must be a valid URL`);
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // Parse custom fields
  let customFields: Record<string, unknown> | undefined;
  if (row.customFields || row.custom_fields) {
    try {
      const customFieldsRaw = row.customFields || row.custom_fields;
      if (typeof customFieldsRaw === 'string') {
        customFields = JSON.parse(customFieldsRaw);
      } else if (typeof customFieldsRaw === 'object') {
        customFields = customFieldsRaw as Record<string, unknown>;
      }
    } catch {
      errors.push(`Row ${rowNumber}: Invalid custom fields JSON`);
    }
  }

  return {
    valid: true,
    errors: [],
    sanitizedRow: {
      email,
      handle: handle.toLowerCase(),
      password,
      displayName: displayName || undefined,
      bio: bio || undefined,
      role: role || 'member',
      avatarUrl: avatarUrl || undefined,
      website: website || undefined,
      customFields,
    },
  };
}

/**
 * Parse XLSX file and extract rows
 */
export async function parseXLSX(buffer: Buffer): Promise<Record<string, unknown>[]> {
  const workbook = new ExcelJS.Workbook();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await workbook.xlsx.load(buffer as any);

  const worksheet = workbook.worksheets[0];
  if (!worksheet || worksheet.rowCount === 0) {
    throw new Error('XLSX file has no sheets');
  }

  const headers: string[] = [];
  const headerRow = worksheet.getRow(1);
  headerRow.eachCell((cell, colNumber) => {
    headers[colNumber - 1] = String(cell.value ?? '');
  });

  if (headers.length === 0) {
    throw new Error('XLSX worksheet has no headers');
  }

  const rows: Record<string, unknown>[] = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // skip header
    const record: Record<string, unknown> = {};
    row.eachCell((cell, colNumber) => {
      const header = headers[colNumber - 1];
      if (header) {
        record[header] = cell.value;
      }
    });
    rows.push(record);
  });

  if (rows.length === 0) {
    throw new Error('XLSX file has no data rows');
  }

  if (rows.length > 10000) {
    throw new Error('XLSX file exceeds maximum of 10,000 rows');
  }

  return rows;
}

/**
 * Parse CSV file and extract rows
 */
export function parseCSV(buffer: Buffer): Record<string, unknown>[] {
  const content = buffer.toString('utf-8');

  const rows = csvParse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  }) as Record<string, unknown>[];

  if (rows.length === 0) {
    throw new Error('CSV file has no data rows');
  }

  if (rows.length > 10000) {
    throw new Error('CSV file exceeds maximum of 10,000 rows');
  }

  return rows;
}

/**
 * Parse SQLite file and extract rows from a 'users' table
 */
export function parseSQLite(buffer: Buffer): Record<string, unknown>[] {
  // Write buffer to temp file (better-sqlite3 requires file path)
  const tempPath = `/tmp/import-${nanoid()}.db`;
  const fs = require('fs');
  fs.writeFileSync(tempPath, buffer);

  try {
    const sqliteDb = new Database(tempPath, { readonly: true });

    // Check if 'users' table exists
    const tableCheck = sqliteDb.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='users'"
    ).get();

    if (!tableCheck) {
      throw new Error("SQLite file must contain a 'users' table");
    }

    // Get all rows from users table
    const rows = sqliteDb.prepare('SELECT * FROM users').all() as Record<string, unknown>[];

    sqliteDb.close();

    if (rows.length === 0) {
      throw new Error('SQLite users table has no data rows');
    }

    if (rows.length > 10000) {
      throw new Error('SQLite file exceeds maximum of 10,000 rows');
    }

    return rows;
  } finally {
    // Clean up temp file
    try {
      fs.unlinkSync(tempPath);
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Generate signing keys for a new user
 */
async function generateSigningKeys(): Promise<{ publicKey: string; privateKey: string }> {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  return {
    publicKey: publicKey.export({ type: 'spki', format: 'pem' }) as string,
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
  };
}

/**
 * Process a bulk import job
 */
export async function processImportJob(
  jobId: string,
  organizationId: string,
  rows: Record<string, unknown>[],
  onProgress?: (processed: number, total: number) => void
): Promise<ImportResult> {
  const result: ImportResult = {
    totalRows: rows.length,
    processedRows: 0,
    successCount: 0,
    errorCount: 0,
    errors: [],
  };

  // Get existing handles and emails for duplicate checking
  const existingUsers = await db.select({ handle: users.handle }).from(users);
  const existingHandles = new Set(existingUsers.map(u => u.handle.toLowerCase()));

  const existingRepos = await db.select({ email: actorRepos.email }).from(actorRepos);
  const existingEmails = new Set(existingRepos.map(r => r.email?.toLowerCase()).filter(Boolean));

  // Track handles/emails in this batch
  const batchHandles = new Set<string>();
  const batchEmails = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNumber = i + 2; // Account for header row

    if (!row) {
      continue;
    }

    try {
      // Validate row
      const validation = validateRow(row, rowNumber);

      if (!validation.valid || !validation.sanitizedRow) {
        result.errors.push(...validation.errors.map(error => ({
          row: rowNumber,
          error,
        })));
        result.errorCount++;
        result.processedRows++;
        continue;
      }

      const userData = validation.sanitizedRow;

      // Check for duplicates
      if (existingHandles.has(userData.handle) || batchHandles.has(userData.handle)) {
        result.errors.push({
          row: rowNumber,
          field: 'handle',
          error: `Handle '${userData.handle}' already exists`,
        });
        result.errorCount++;
        result.processedRows++;
        continue;
      }

      if (existingEmails.has(userData.email.toLowerCase()) || batchEmails.has(userData.email.toLowerCase())) {
        result.errors.push({
          row: rowNumber,
          field: 'email',
          error: `Email '${userData.email}' already exists`,
        });
        result.errorCount++;
        result.processedRows++;
        continue;
      }

      // Create the user
      const did = `did:plc:${nanoid(24)}`;
      const passwordHash = await bcrypt.hash(userData.password, 10);
      const { publicKey, privateKey } = await generateSigningKeys();
      const now = new Date();

      // Insert into actorRepos (PDS account)
      await db.insert(actorRepos).values({
        did,
        handle: userData.handle,
        email: userData.email,
        passwordHash,
        signingKeyPublic: publicKey,
        signingKeyPrivate: privateKey,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      });

      // Insert into users (profile)
      await db.insert(users).values({
        did,
        handle: userData.handle,
        displayName: userData.displayName || userData.handle,
        avatar: userData.avatarUrl,
        bio: userData.bio,
        createdAt: now,
        updatedAt: now,
        indexedAt: now,
      });

      // Add to organization
      await db.insert(organizationMembers).values({
        id: nanoid(),
        organizationId,
        userDid: did,
        role: userData.role || 'member',
        permissions: userData.role === 'admin' ? ['bulk_import', 'manage_members', 'edit_settings'] : [],
        joinedAt: now,
      });

      // Track for duplicate detection
      batchHandles.add(userData.handle);
      batchEmails.add(userData.email.toLowerCase());

      result.successCount++;
      result.processedRows++;

      // Update job progress
      if (onProgress) {
        onProgress(result.processedRows, result.totalRows);
      }

    } catch (error) {
      result.errors.push({
        row: rowNumber,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      result.errorCount++;
      result.processedRows++;
    }
  }

  // Update job status
  await db.update(bulkImportJobs)
    .set({
      status: result.errorCount === result.totalRows ? 'failed' : 'completed',
      processedRows: result.processedRows,
      successCount: result.successCount,
      errorCount: result.errorCount,
      errors: result.errors,
      completedAt: new Date(),
    })
    .where(eq(bulkImportJobs.id, jobId));

  return result;
}

/**
 * Create an import job and start processing
 */
export async function createImportJob(
  organizationId: string,
  createdBy: string,
  file: {
    buffer: Buffer;
    type: 'xlsx' | 'csv' | 'sqlite';
    name: string;
    size: number;
  }
): Promise<{ jobId: string; totalRows: number }> {
  // Validate file size (max 10MB)
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('File size exceeds maximum of 10MB');
  }

  // Parse file
  let rows: Record<string, unknown>[];

  switch (file.type) {
    case 'xlsx':
      rows = await parseXLSX(file.buffer);
      break;
    case 'csv':
      rows = parseCSV(file.buffer);
      break;
    case 'sqlite':
      rows = parseSQLite(file.buffer);
      break;
    default:
      throw new Error(`Unsupported file type: ${file.type}`);
  }

  // Create job record
  const jobId = nanoid();
  const now = new Date();

  await db.insert(bulkImportJobs).values({
    id: jobId,
    organizationId,
    createdBy,
    fileType: file.type,
    fileName: file.name,
    fileSize: file.size,
    status: 'pending',
    totalRows: rows.length,
    processedRows: 0,
    successCount: 0,
    errorCount: 0,
    createdAt: now,
  });

  // Start processing in background (non-blocking)
  processImportJob(jobId, organizationId, rows, async (processed, total) => {
    // Update progress periodically
    if (processed % 10 === 0 || processed === total) {
      await db.update(bulkImportJobs)
        .set({
          status: 'processing',
          processedRows: processed,
          startedAt: processed === 1 ? new Date() : undefined,
        })
        .where(eq(bulkImportJobs.id, jobId));
    }
  }).catch(async (error) => {
    // Mark job as failed on error
    await db.update(bulkImportJobs)
      .set({
        status: 'failed',
        errors: [{ row: 0, error: error.message }],
        completedAt: new Date(),
      })
      .where(eq(bulkImportJobs.id, jobId));
  });

  return { jobId, totalRows: rows.length };
}

/**
 * Generate a CSV template for bulk import
 */
export function generateCSVTemplate(): string {
  const headers = [
    'email',
    'handle',
    'password',
    'displayName',
    'bio',
    'role',
    'avatarUrl',
    'website',
    'customFields',
  ];

  const exampleRow = [
    'user@example.com',
    'johndoe',
    'SecurePassword123!',
    'John Doe',
    'Software developer',
    'member',
    'https://example.com/avatar.jpg',
    'https://johndoe.com',
    '{"department": "Engineering"}',
  ];

  return `${headers.join(',')}\n${exampleRow.join(',')}`;
}

/**
 * Generate an XLSX template for bulk import
 */
export async function generateXLSXTemplate(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Users');

  const headers = [
    'email',
    'handle',
    'password',
    'displayName',
    'bio',
    'role',
    'avatarUrl',
    'website',
    'customFields',
  ];

  const exampleRow = [
    'user@example.com',
    'johndoe',
    'SecurePassword123!',
    'John Doe',
    'Software developer',
    'member',
    'https://example.com/avatar.jpg',
    'https://johndoe.com',
    '{"department": "Engineering"}',
  ];

  worksheet.addRow(headers);
  worksheet.addRow(exampleRow);

  // Set column widths
  worksheet.columns = headers.map(() => ({ width: 25 }));

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
