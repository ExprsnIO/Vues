import { promises as dns } from 'dns';
import { db } from '../db/index.js';
import {
  domains,
  domainDnsRecords,
  domainHealthChecks,
  domainHealthSummaries,
  type DomainDnsRecord,
  type DomainHealthCheck,
  type DomainHealthSummary,
} from '../db/schema.js';
import { eq, and, desc, gte, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';

// DNS Record Types
export type DnsRecordType = 'A' | 'AAAA' | 'CNAME' | 'TXT' | 'MX' | 'NS';
export type DnsRecordStatus = 'valid' | 'invalid' | 'missing' | 'unknown' | 'error';

// Health Check Types
export type HealthCheckType = 'pds' | 'api' | 'certificate' | 'federation';
export type HealthStatus = 'healthy' | 'degraded' | 'down' | 'error' | 'unknown';

interface DnsCheckResult {
  recordType: DnsRecordType;
  name: string;
  expectedValue?: string;
  actualValue?: string;
  status: DnsRecordStatus;
  errorMessage?: string;
}

interface HealthCheckResult {
  checkType: HealthCheckType;
  status: HealthStatus;
  responseTime?: number;
  statusCode?: number;
  errorMessage?: string;
  details?: Record<string, unknown>;
}

/**
 * DNS Validation Service
 * Checks DNS records for domain configuration
 */
export class DnsValidationService {
  /**
   * Verify all DNS records for a domain
   */
  async verifyDomainDns(domainId: string): Promise<DnsCheckResult[]> {
    const [domain] = await db
      .select()
      .from(domains)
      .where(eq(domains.id, domainId))
      .limit(1);

    if (!domain) {
      throw new Error('Domain not found');
    }

    const results: DnsCheckResult[] = [];
    const domainName = domain.domain;

    // Check A records
    const aRecords = await this.checkARecords(domainName);
    results.push(...aRecords);

    // Check AAAA records (IPv6)
    const aaaaRecords = await this.checkAAAARecords(domainName);
    results.push(...aaaaRecords);

    // Check TXT records for verification
    if (domain.dnsVerificationToken) {
      const txtRecord = await this.checkTxtRecord(
        domainName,
        `exprsn-verification=${domain.dnsVerificationToken}`
      );
      results.push(txtRecord);
    }

    // Check MX records if email is configured
    const mxRecords = await this.checkMxRecords(domainName);
    results.push(...mxRecords);

    // Check NS records
    const nsRecords = await this.checkNsRecords(domainName);
    results.push(...nsRecords);

    // Save results to database
    await this.saveDnsRecords(domainId, results);

    // Update DNS status in health summary
    await this.updateDnsStatus(domainId, results);

    return results;
  }

  /**
   * Check A records (IPv4)
   */
  private async checkARecords(hostname: string): Promise<DnsCheckResult[]> {
    try {
      const addresses = await dns.resolve4(hostname);
      return addresses.map((addr) => ({
        recordType: 'A' as DnsRecordType,
        name: hostname,
        actualValue: addr,
        status: 'valid' as DnsRecordStatus,
      }));
    } catch (error) {
      return [
        {
          recordType: 'A' as DnsRecordType,
          name: hostname,
          status: 'missing' as DnsRecordStatus,
          errorMessage: error instanceof Error ? error.message : 'DNS lookup failed',
        },
      ];
    }
  }

  /**
   * Check AAAA records (IPv6)
   */
  private async checkAAAARecords(hostname: string): Promise<DnsCheckResult[]> {
    try {
      const addresses = await dns.resolve6(hostname);
      return addresses.map((addr) => ({
        recordType: 'AAAA' as DnsRecordType,
        name: hostname,
        actualValue: addr,
        status: 'valid' as DnsRecordStatus,
      }));
    } catch (error) {
      // IPv6 is optional, so missing is not an error
      return [
        {
          recordType: 'AAAA' as DnsRecordType,
          name: hostname,
          status: 'missing' as DnsRecordStatus,
        },
      ];
    }
  }

  /**
   * Check TXT record for verification
   */
  private async checkTxtRecord(
    hostname: string,
    expectedValue: string
  ): Promise<DnsCheckResult> {
    try {
      const records = await dns.resolveTxt(hostname);
      const txtRecords = records.flat();
      const hasExpected = txtRecords.some((record) => record === expectedValue);

      return {
        recordType: 'TXT' as DnsRecordType,
        name: hostname,
        expectedValue,
        actualValue: txtRecords.join(', '),
        status: hasExpected ? ('valid' as DnsRecordStatus) : ('invalid' as DnsRecordStatus),
        errorMessage: hasExpected ? undefined : 'Verification token not found',
      };
    } catch (error) {
      return {
        recordType: 'TXT' as DnsRecordType,
        name: hostname,
        expectedValue,
        status: 'missing' as DnsRecordStatus,
        errorMessage: error instanceof Error ? error.message : 'DNS lookup failed',
      };
    }
  }

  /**
   * Check MX records
   */
  private async checkMxRecords(hostname: string): Promise<DnsCheckResult[]> {
    try {
      const mxRecords = await dns.resolveMx(hostname);
      return mxRecords.map((mx) => ({
        recordType: 'MX' as DnsRecordType,
        name: hostname,
        actualValue: `${mx.priority} ${mx.exchange}`,
        status: 'valid' as DnsRecordStatus,
      }));
    } catch (error) {
      return [
        {
          recordType: 'MX' as DnsRecordType,
          name: hostname,
          status: 'missing' as DnsRecordStatus,
        },
      ];
    }
  }

  /**
   * Check NS records
   */
  private async checkNsRecords(hostname: string): Promise<DnsCheckResult[]> {
    try {
      const nsRecords = await dns.resolveNs(hostname);
      return nsRecords.map((ns) => ({
        recordType: 'NS' as DnsRecordType,
        name: hostname,
        actualValue: ns,
        status: 'valid' as DnsRecordStatus,
      }));
    } catch (error) {
      return [
        {
          recordType: 'NS' as DnsRecordType,
          name: hostname,
          status: 'error' as DnsRecordStatus,
          errorMessage: error instanceof Error ? error.message : 'DNS lookup failed',
        },
      ];
    }
  }

  /**
   * Save DNS records to database
   */
  private async saveDnsRecords(
    domainId: string,
    results: DnsCheckResult[]
  ): Promise<void> {
    const now = new Date();

    for (const result of results) {
      const recordId = `${domainId}_${result.recordType}_${result.name}`.replace(/[^a-zA-Z0-9_-]/g, '_');

      // Check if record exists
      const [existing] = await db
        .select()
        .from(domainDnsRecords)
        .where(eq(domainDnsRecords.id, recordId))
        .limit(1);

      if (existing) {
        // Update existing record
        await db
          .update(domainDnsRecords)
          .set({
            actualValue: result.actualValue,
            status: result.status,
            errorMessage: result.errorMessage,
            lastChecked: now,
            validatedAt: result.status === 'valid' ? now : existing.validatedAt,
            updatedAt: now,
          })
          .where(eq(domainDnsRecords.id, recordId));
      } else {
        // Insert new record
        await db.insert(domainDnsRecords).values({
          id: recordId,
          domainId,
          recordType: result.recordType,
          name: result.name,
          expectedValue: result.expectedValue,
          actualValue: result.actualValue,
          status: result.status,
          errorMessage: result.errorMessage,
          lastChecked: now,
          validatedAt: result.status === 'valid' ? now : null,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  }

  /**
   * Update DNS status in health summary
   */
  private async updateDnsStatus(
    domainId: string,
    results: DnsCheckResult[]
  ): Promise<void> {
    const validCount = results.filter((r) => r.status === 'valid').length;
    const errorCount = results.filter((r) => r.status === 'error').length;
    const invalidCount = results.filter((r) => r.status === 'invalid').length;

    let dnsStatus: 'valid' | 'invalid' | 'partial' | 'unknown' = 'unknown';

    if (errorCount > 0 || invalidCount > 0) {
      dnsStatus = validCount > 0 ? 'partial' : 'invalid';
    } else if (validCount > 0) {
      dnsStatus = 'valid';
    }

    await this.updateHealthSummary(domainId, {
      dnsStatus,
      lastDnsCheck: new Date(),
    });
  }

  /**
   * Update health summary
   */
  private async updateHealthSummary(
    domainId: string,
    updates: Partial<DomainHealthSummary>
  ): Promise<void> {
    const [existing] = await db
      .select()
      .from(domainHealthSummaries)
      .where(eq(domainHealthSummaries.domainId, domainId))
      .limit(1);

    if (existing) {
      await db
        .update(domainHealthSummaries)
        .set({
          ...updates,
          updatedAt: new Date(),
        })
        .where(eq(domainHealthSummaries.domainId, domainId));
    } else {
      await db.insert(domainHealthSummaries).values({
        domainId,
        ...updates,
        updatedAt: new Date(),
      } as any);
    }
  }
}

/**
 * Domain Health Check Service
 * Performs health checks on domain services
 */
export class DomainHealthService {
  /**
   * Run comprehensive health check on a domain
   */
  async checkDomainHealth(domainId: string): Promise<HealthCheckResult[]> {
    const [domain] = await db
      .select()
      .from(domains)
      .where(eq(domains.id, domainId))
      .limit(1);

    if (!domain) {
      throw new Error('Domain not found');
    }

    const results: HealthCheckResult[] = [];

    // Check PDS availability
    if (domain.pdsEndpoint) {
      const pdsResult = await this.checkPds(domain.pdsEndpoint);
      results.push(pdsResult);
    }

    // Check API endpoint
    const apiResult = await this.checkApi(domain.domain, domain.pdsEndpoint || undefined);
    results.push(apiResult);

    // Check certificate validity
    const certResult = await this.checkCertificate(domain.domain, domain.pdsEndpoint || undefined);
    results.push(certResult);

    // Check federation connectivity
    if (domain.type === 'federated' && domain.pdsEndpoint) {
      const federationResult = await this.checkFederation(domain.pdsEndpoint);
      results.push(federationResult);
    }

    // Save results to database
    await this.saveHealthChecks(domainId, results);

    // Update health summary
    await this.updateHealthSummary(domainId, results);

    return results;
  }

  /**
   * Check PDS endpoint availability
   */
  private async checkPds(endpoint: string): Promise<HealthCheckResult> {
    const start = Date.now();

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

      const response = await fetch(`${endpoint}/xrpc/_health`, {
        signal: controller.signal,
      });

      clearTimeout(timeout);
      const responseTime = Date.now() - start;

      return {
        checkType: 'pds',
        status: response.ok ? 'healthy' : 'degraded',
        responseTime,
        statusCode: response.status,
        details: {
          endpoint,
          latency: responseTime,
        },
      };
    } catch (error) {
      return {
        checkType: 'pds',
        status: 'down',
        responseTime: Date.now() - start,
        errorMessage: error instanceof Error ? error.message : 'PDS check failed',
        details: { endpoint },
      };
    }
  }

  /**
   * Check API endpoint availability
   */
  private async checkApi(domain: string, pdsEndpoint?: string): Promise<HealthCheckResult> {
    const start = Date.now();
    // Use PDS endpoint if available (for local dev), otherwise construct from domain
    // For development, check localhost:3002 if pdsEndpoint points to localhost
    let endpoint: string;
    if (pdsEndpoint && (pdsEndpoint.includes('localhost') || pdsEndpoint.includes('127.0.0.1'))) {
      // Extract host from pdsEndpoint for local development
      const pdsUrl = new URL(pdsEndpoint);
      endpoint = `${pdsUrl.protocol}//${pdsUrl.host}/health`;
    } else if (process.env.NODE_ENV === 'development' || process.env.API_URL) {
      endpoint = `${process.env.API_URL || 'http://localhost:3002'}/health`;
    } else {
      endpoint = `https://${domain}/health`;
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(endpoint, {
        signal: controller.signal,
      });

      clearTimeout(timeout);
      const responseTime = Date.now() - start;

      return {
        checkType: 'api',
        status: response.ok ? 'healthy' : 'degraded',
        responseTime,
        statusCode: response.status,
        details: {
          endpoint,
          latency: responseTime,
        },
      };
    } catch (error) {
      return {
        checkType: 'api',
        status: 'down',
        responseTime: Date.now() - start,
        errorMessage: error instanceof Error ? error.message : 'API check failed',
        details: { endpoint },
      };
    }
  }

  /**
   * Check SSL certificate validity
   */
  private async checkCertificate(domain: string, pdsEndpoint?: string): Promise<HealthCheckResult> {
    // For local development with localhost endpoints, skip SSL check and mark as healthy
    if (pdsEndpoint && (pdsEndpoint.includes('localhost') || pdsEndpoint.includes('127.0.0.1'))) {
      return {
        checkType: 'certificate',
        status: 'healthy',
        details: {
          sslValid: true,
          note: 'Local development - SSL check skipped',
        },
      };
    }

    // Skip SSL check in development mode without HTTPS
    if (process.env.NODE_ENV === 'development') {
      return {
        checkType: 'certificate',
        status: 'healthy',
        details: {
          sslValid: true,
          note: 'Development mode - SSL check skipped',
        },
      };
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`https://${domain}`, {
        signal: controller.signal,
        method: 'HEAD',
      });

      clearTimeout(timeout);

      // Note: In Node.js, we'd use tls.connect() to get detailed cert info
      // For now, we just check if HTTPS connection succeeds
      return {
        checkType: 'certificate',
        status: response.ok || response.status < 500 ? 'healthy' : 'degraded',
        statusCode: response.status,
        details: {
          sslValid: true,
        },
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Certificate check failed';
      const isSslError = errorMsg.toLowerCase().includes('certificate') ||
                        errorMsg.toLowerCase().includes('ssl') ||
                        errorMsg.toLowerCase().includes('tls');

      return {
        checkType: 'certificate',
        status: isSslError ? 'error' : 'down',
        errorMessage: errorMsg,
        details: {
          sslValid: false,
        },
      };
    }
  }

  /**
   * Check federation connectivity
   */
  private async checkFederation(pdsEndpoint: string): Promise<HealthCheckResult> {
    const start = Date.now();

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      // Check if we can reach the PDS describe endpoint
      const response = await fetch(`${pdsEndpoint}/xrpc/com.atproto.server.describeServer`, {
        signal: controller.signal,
      });

      clearTimeout(timeout);
      const responseTime = Date.now() - start;

      return {
        checkType: 'federation',
        status: response.ok ? 'healthy' : 'degraded',
        responseTime,
        statusCode: response.status,
        details: {
          endpoint: pdsEndpoint,
          federationReachable: response.ok,
          latency: responseTime,
        },
      };
    } catch (error) {
      return {
        checkType: 'federation',
        status: 'down',
        responseTime: Date.now() - start,
        errorMessage: error instanceof Error ? error.message : 'Federation check failed',
        details: {
          endpoint: pdsEndpoint,
          federationReachable: false,
        },
      };
    }
  }

  /**
   * Save health check results to database
   */
  private async saveHealthChecks(
    domainId: string,
    results: HealthCheckResult[]
  ): Promise<void> {
    const now = new Date();

    for (const result of results) {
      await db.insert(domainHealthChecks).values({
        id: nanoid(),
        domainId,
        checkType: result.checkType,
        status: result.status,
        responseTime: result.responseTime,
        statusCode: result.statusCode,
        errorMessage: result.errorMessage,
        details: result.details,
        checkedAt: now,
      });
    }
  }

  /**
   * Update health summary based on check results
   */
  private async updateHealthSummary(
    domainId: string,
    results: HealthCheckResult[]
  ): Promise<void> {
    const pdsResult = results.find((r) => r.checkType === 'pds');
    const apiResult = results.find((r) => r.checkType === 'api');
    const certResult = results.find((r) => r.checkType === 'certificate');
    const fedResult = results.find((r) => r.checkType === 'federation');

    // Calculate overall status
    const statuses = results.map((r) => r.status);
    let overallStatus: HealthStatus = 'healthy';

    if (statuses.some((s) => s === 'down' || s === 'error')) {
      overallStatus = 'down';
    } else if (statuses.some((s) => s === 'degraded')) {
      overallStatus = 'degraded';
    }

    // Calculate average response time
    const responseTimes = results
      .map((r) => r.responseTime)
      .filter((t): t is number => t !== undefined);
    const avgResponseTime = responseTimes.length > 0
      ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
      : undefined;

    // Count incidents in last 24 hours
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [incidentResult] = await db
      .select({
        count: sql<number>`count(*)`,
      })
      .from(domainHealthChecks)
      .where(
        and(
          eq(domainHealthChecks.domainId, domainId),
          gte(domainHealthChecks.checkedAt, twentyFourHoursAgo),
          sql`${domainHealthChecks.status} IN ('down', 'error')`
        )
      );

    const incidentCount24h = incidentResult?.count ?? 0;

    // Calculate uptime percentage (simple version)
    const uptimePercentage = overallStatus === 'healthy' ? 100 : overallStatus === 'degraded' ? 95 : 50;

    const [existing] = await db
      .select()
      .from(domainHealthSummaries)
      .where(eq(domainHealthSummaries.domainId, domainId))
      .limit(1);

    const updates = {
      overallStatus,
      pdsStatus: pdsResult?.status ?? 'unknown',
      apiStatus: apiResult?.status ?? 'unknown',
      certificateStatus: certResult?.status ?? 'unknown',
      federationStatus: fedResult?.status ?? 'unknown',
      lastHealthCheck: new Date(),
      uptimePercentage,
      incidentCount24h,
      avgResponseTime,
      updatedAt: new Date(),
    };

    if (existing) {
      await db
        .update(domainHealthSummaries)
        .set(updates)
        .where(eq(domainHealthSummaries.domainId, domainId));
    } else {
      await db.insert(domainHealthSummaries).values({
        domainId,
        ...updates,
      } as any);
    }
  }

  /**
   * Get health check history for a domain
   */
  async getHealthHistory(
    domainId: string,
    options: {
      checkType?: HealthCheckType;
      startDate?: Date;
      endDate?: Date;
      limit?: number;
    } = {}
  ): Promise<DomainHealthCheck[]> {
    const { checkType, startDate, endDate, limit = 100 } = options;

    const conditions = [eq(domainHealthChecks.domainId, domainId)];

    if (checkType) {
      conditions.push(eq(domainHealthChecks.checkType, checkType));
    }

    if (startDate) {
      conditions.push(gte(domainHealthChecks.checkedAt, startDate));
    }

    if (endDate) {
      conditions.push(sql`${domainHealthChecks.checkedAt} <= ${endDate}`);
    }

    const history = await db
      .select()
      .from(domainHealthChecks)
      .where(and(...conditions))
      .orderBy(desc(domainHealthChecks.checkedAt))
      .limit(limit);

    return history;
  }
}

// Export singleton instances
export const dnsValidationService = new DnsValidationService();
export const domainHealthService = new DomainHealthService();
