/**
 * CA Audit Service
 * Comprehensive audit logging for all CA and certificate operations
 */

import { db } from '../../db/index.js';
import { caAuditLog } from '../../db/schema.js';
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export type AuditEventType =
  // Certificate events
  | 'certificate.issued'
  | 'certificate.revoked'
  | 'certificate.renewed'
  | 'certificate.expired'
  | 'certificate.key_rotated'
  | 'certificate.exported'
  | 'certificate.verified'
  // CA events
  | 'ca.root_created'
  | 'ca.intermediate_created'
  | 'ca.crl_generated'
  | 'ca.config_changed'
  // Auth events
  | 'auth.certificate_login'
  | 'auth.certificate_login_failed'
  | 'auth.challenge_created'
  | 'auth.challenge_verified'
  | 'auth.session_bound'
  // Token events
  | 'token.issued'
  | 'token.revoked'
  | 'token.rotated'
  | 'token.used'
  | 'token.expired';

export type AuditEventCategory = 'certificate' | 'ca' | 'auth' | 'token';

export type AuditSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface AuditLogEntry {
  id: string;
  eventType: string;
  eventCategory: string;
  certificateId: string | null;
  certificateSerialNumber: string | null;
  subjectDid: string | null;
  performedBy: string;
  performedByIp: string | null;
  performedByUserAgent: string | null;
  details: Record<string, unknown> | null;
  severity: string;
  success: boolean;
  errorMessage: string | null;
  timestamp: Date;
}

export interface AuditQueryOptions {
  eventType?: string;
  eventCategory?: AuditEventCategory;
  subjectDid?: string;
  performedBy?: string;
  certificateId?: string;
  severity?: AuditSeverity;
  startDate?: Date;
  endDate?: Date;
  success?: boolean;
  limit?: number;
  offset?: number;
}

// Simple event emitter for real-time notifications
type AuditListener = (event: AuditLogEntry) => void;
const listeners: Set<AuditListener> = new Set();

export class CAAuditService {
  /**
   * Log an audit event
   */
  static async log(event: {
    eventType: AuditEventType;
    eventCategory?: AuditEventCategory;
    certificateId?: string;
    certificateSerialNumber?: string;
    subjectDid?: string;
    performedBy: string;
    performedByIp?: string;
    performedByUserAgent?: string;
    details?: Record<string, unknown>;
    severity?: AuditSeverity;
    success?: boolean;
    errorMessage?: string;
  }): Promise<string> {
    // Derive category from event type if not provided
    const eventCategory = event.eventCategory || this.deriveCategory(event.eventType);

    const id = nanoid();
    const entry = {
      id,
      eventType: event.eventType,
      eventCategory,
      certificateId: event.certificateId || null,
      certificateSerialNumber: event.certificateSerialNumber || null,
      subjectDid: event.subjectDid || null,
      performedBy: event.performedBy,
      performedByIp: event.performedByIp || null,
      performedByUserAgent: event.performedByUserAgent || null,
      details: event.details || null,
      severity: event.severity || 'info',
      success: event.success ?? true,
      errorMessage: event.errorMessage || null,
      timestamp: new Date(),
    };

    await db.insert(caAuditLog).values(entry);

    // Notify listeners for real-time updates
    const logEntry: AuditLogEntry = entry;
    listeners.forEach(listener => {
      try {
        listener(logEntry);
      } catch (error) {
        console.error('Audit listener error:', error);
      }
    });

    return id;
  }

  /**
   * Log a successful event (convenience method)
   */
  static async logSuccess(
    eventType: AuditEventType,
    performedBy: string,
    options: Omit<Parameters<typeof CAAuditService.log>[0], 'eventType' | 'performedBy' | 'success'> = {}
  ): Promise<string> {
    return this.log({
      eventType,
      performedBy,
      success: true,
      ...options,
    });
  }

  /**
   * Log a failed event (convenience method)
   */
  static async logFailure(
    eventType: AuditEventType,
    performedBy: string,
    errorMessage: string,
    options: Omit<Parameters<typeof CAAuditService.log>[0], 'eventType' | 'performedBy' | 'success' | 'errorMessage'> = {}
  ): Promise<string> {
    return this.log({
      eventType,
      performedBy,
      success: false,
      errorMessage,
      severity: 'error',
      ...options,
    });
  }

  /**
   * Query audit log with filtering
   */
  static async query(options: AuditQueryOptions): Promise<{
    entries: AuditLogEntry[];
    total: number;
    hasMore: boolean;
  }> {
    const conditions = [];

    if (options.eventType) {
      conditions.push(eq(caAuditLog.eventType, options.eventType));
    }
    if (options.eventCategory) {
      conditions.push(eq(caAuditLog.eventCategory, options.eventCategory));
    }
    if (options.subjectDid) {
      conditions.push(eq(caAuditLog.subjectDid, options.subjectDid));
    }
    if (options.performedBy) {
      conditions.push(eq(caAuditLog.performedBy, options.performedBy));
    }
    if (options.certificateId) {
      conditions.push(eq(caAuditLog.certificateId, options.certificateId));
    }
    if (options.severity) {
      conditions.push(eq(caAuditLog.severity, options.severity));
    }
    if (options.startDate) {
      conditions.push(gte(caAuditLog.timestamp, options.startDate));
    }
    if (options.endDate) {
      conditions.push(lte(caAuditLog.timestamp, options.endDate));
    }
    if (options.success !== undefined) {
      conditions.push(eq(caAuditLog.success, options.success));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const limit = options.limit || 50;
    const offset = options.offset || 0;

    const [entries, countResult] = await Promise.all([
      db.select()
        .from(caAuditLog)
        .where(whereClause)
        .orderBy(desc(caAuditLog.timestamp))
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` })
        .from(caAuditLog)
        .where(whereClause),
    ]);

    const total = countResult[0]?.count || 0;

    return {
      entries: entries as AuditLogEntry[],
      total,
      hasMore: offset + entries.length < total,
    };
  }

  /**
   * Get audit entries for a specific certificate
   */
  static async getCertificateAuditTrail(certificateId: string): Promise<AuditLogEntry[]> {
    const entries = await db.select()
      .from(caAuditLog)
      .where(eq(caAuditLog.certificateId, certificateId))
      .orderBy(desc(caAuditLog.timestamp));

    return entries as AuditLogEntry[];
  }

  /**
   * Get audit entries for a specific user
   */
  static async getUserAuditTrail(userDid: string, limit = 100): Promise<AuditLogEntry[]> {
    const entries = await db.select()
      .from(caAuditLog)
      .where(eq(caAuditLog.subjectDid, userDid))
      .orderBy(desc(caAuditLog.timestamp))
      .limit(limit);

    return entries as AuditLogEntry[];
  }

  /**
   * Get recent critical events
   */
  static async getCriticalEvents(limit = 50): Promise<AuditLogEntry[]> {
    const entries = await db.select()
      .from(caAuditLog)
      .where(eq(caAuditLog.severity, 'critical'))
      .orderBy(desc(caAuditLog.timestamp))
      .limit(limit);

    return entries as AuditLogEntry[];
  }

  /**
   * Get failed events in a time range
   */
  static async getFailedEvents(startDate: Date, endDate?: Date): Promise<AuditLogEntry[]> {
    const conditions = [
      eq(caAuditLog.success, false),
      gte(caAuditLog.timestamp, startDate),
    ];

    if (endDate) {
      conditions.push(lte(caAuditLog.timestamp, endDate));
    }

    const entries = await db.select()
      .from(caAuditLog)
      .where(and(...conditions))
      .orderBy(desc(caAuditLog.timestamp));

    return entries as AuditLogEntry[];
  }

  /**
   * Get audit statistics
   */
  static async getStats(days = 30): Promise<{
    totalEvents: number;
    successfulEvents: number;
    failedEvents: number;
    byCategory: Record<string, number>;
    byEventType: Record<string, number>;
    bySeverity: Record<string, number>;
  }> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const [totalResult, categoryResult, typeResult, severityResult] = await Promise.all([
      db.select({
        total: sql<number>`count(*)::int`,
        successful: sql<number>`count(*) filter (where ${caAuditLog.success} = true)::int`,
        failed: sql<number>`count(*) filter (where ${caAuditLog.success} = false)::int`,
      })
        .from(caAuditLog)
        .where(gte(caAuditLog.timestamp, startDate)),

      db.select({
        category: caAuditLog.eventCategory,
        count: sql<number>`count(*)::int`,
      })
        .from(caAuditLog)
        .where(gte(caAuditLog.timestamp, startDate))
        .groupBy(caAuditLog.eventCategory),

      db.select({
        eventType: caAuditLog.eventType,
        count: sql<number>`count(*)::int`,
      })
        .from(caAuditLog)
        .where(gte(caAuditLog.timestamp, startDate))
        .groupBy(caAuditLog.eventType),

      db.select({
        severity: caAuditLog.severity,
        count: sql<number>`count(*)::int`,
      })
        .from(caAuditLog)
        .where(gte(caAuditLog.timestamp, startDate))
        .groupBy(caAuditLog.severity),
    ]);

    return {
      totalEvents: totalResult[0]?.total || 0,
      successfulEvents: totalResult[0]?.successful || 0,
      failedEvents: totalResult[0]?.failed || 0,
      byCategory: Object.fromEntries(categoryResult.map(r => [r.category, r.count])),
      byEventType: Object.fromEntries(typeResult.map(r => [r.eventType, r.count])),
      bySeverity: Object.fromEntries(severityResult.map(r => [r.severity, r.count])),
    };
  }

  /**
   * Subscribe to audit events for real-time notifications
   */
  static subscribe(listener: AuditListener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  /**
   * Derive event category from event type
   */
  private static deriveCategory(eventType: AuditEventType): AuditEventCategory {
    if (eventType.startsWith('certificate.')) return 'certificate';
    if (eventType.startsWith('ca.')) return 'ca';
    if (eventType.startsWith('auth.')) return 'auth';
    if (eventType.startsWith('token.')) return 'token';
    return 'certificate'; // default
  }
}
