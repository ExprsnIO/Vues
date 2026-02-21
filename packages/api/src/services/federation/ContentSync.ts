import { ServiceAuth } from './ServiceAuth.js';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { eq, and, gt } from 'drizzle-orm';
import * as schema from '../../db/schema.js';

/**
 * Sync record from remote server
 */
export interface SyncRecord {
  uri: string;
  cid: string;
  collection: string;
  rkey: string;
  record: unknown;
  createdAt: string;
}

/**
 * Sync result
 */
export interface SyncResult {
  success: boolean;
  recordsProcessed: number;
  recordsFailed: number;
  errors: Array<{ uri: string; error: string }>;
  newCursor?: string;
}

/**
 * Content sync configuration
 */
export interface ContentSyncConfig {
  db: PostgresJsDatabase<typeof schema>;
  serviceAuth?: ServiceAuth;
  certificateId?: string;
  privateKey?: string;
  httpTimeout?: number;
  maxRetries?: number;
}

/**
 * Cross-server content synchronization
 */
export class ContentSync {
  private db: PostgresJsDatabase<typeof schema>;
  private serviceAuth: ServiceAuth | null;
  private certificateId: string | null;
  private privateKey: string | null;
  private httpTimeout: number;
  private maxRetries: number;

  constructor(config: ContentSyncConfig) {
    this.db = config.db;
    this.serviceAuth = config.serviceAuth || null;
    this.certificateId = config.certificateId || null;
    this.privateKey = config.privateKey || null;
    this.httpTimeout = config.httpTimeout || 30000;
    this.maxRetries = config.maxRetries || 3;
  }

  /**
   * Pull content from a remote server
   */
  async syncFromRemote(
    endpoint: string,
    options: {
      collection?: string;
      since?: string;
      limit?: number;
      did?: string;
    } = {}
  ): Promise<SyncResult> {
    const { collection, since, limit = 100, did } = options;
    const result: SyncResult = {
      success: true,
      recordsProcessed: 0,
      recordsFailed: 0,
      errors: [],
    };

    try {
      // Build URL
      const url = new URL(`${endpoint}/xrpc/io.exprsn.sync.getRecords`);
      if (collection) url.searchParams.set('collection', collection);
      if (since) url.searchParams.set('since', since);
      if (limit) url.searchParams.set('limit', limit.toString());
      if (did) url.searchParams.set('did', did);

      // Create auth headers if configured
      const headers: Record<string, string> = {
        Accept: 'application/json',
      };

      if (this.serviceAuth && this.certificateId && this.privateKey) {
        const authHeaders = await this.serviceAuth.createAuthHeaders(
          this.certificateId,
          this.privateKey,
          'GET',
          url.pathname + url.search
        );
        Object.assign(headers, authHeaders);
      }

      // Fetch records
      const response = await this.fetchWithRetry(url.toString(), {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      const data = (await response.json()) as {
        records: SyncRecord[];
        cursor?: string;
      };

      // Process records
      for (const record of data.records) {
        try {
          await this.processRecord(record);
          result.recordsProcessed++;
        } catch (error) {
          result.recordsFailed++;
          result.errors.push({
            uri: record.uri,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      result.newCursor = data.cursor;
    } catch (error) {
      result.success = false;
      result.errors.push({
        uri: endpoint,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    return result;
  }

  /**
   * Sync a specific blob from a remote server
   */
  async syncBlob(
    endpoint: string,
    did: string,
    cid: string
  ): Promise<{ success: boolean; data?: Uint8Array; mimeType?: string; error?: string }> {
    try {
      const url = `${endpoint}/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(did)}&cid=${encodeURIComponent(cid)}`;

      const headers: Record<string, string> = {};
      if (this.serviceAuth && this.certificateId && this.privateKey) {
        const authHeaders = await this.serviceAuth.createAuthHeaders(
          this.certificateId,
          this.privateKey,
          'GET',
          `/xrpc/com.atproto.sync.getBlob?did=${did}&cid=${cid}`
        );
        Object.assign(headers, authHeaders);
      }

      const response = await this.fetchWithRetry(url, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}`,
        };
      }

      const data = new Uint8Array(await response.arrayBuffer());
      const mimeType = response.headers.get('content-type') || 'application/octet-stream';

      return {
        success: true,
        data,
        mimeType,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Sync repo from remote server as CAR bytes
   */
  async syncRepo(
    endpoint: string,
    did: string,
    options: { since?: string } = {}
  ): Promise<{
    success: boolean;
    carBytes?: Uint8Array;
    error?: string;
  }> {
    try {
      let url = `${endpoint}/xrpc/com.atproto.sync.getRepo?did=${encodeURIComponent(did)}`;
      if (options.since) {
        url += `&since=${encodeURIComponent(options.since)}`;
      }

      const headers: Record<string, string> = {};
      if (this.serviceAuth && this.certificateId && this.privateKey) {
        const path = `/xrpc/com.atproto.sync.getRepo?did=${did}${options.since ? `&since=${options.since}` : ''}`;
        const authHeaders = await this.serviceAuth.createAuthHeaders(
          this.certificateId,
          this.privateKey,
          'GET',
          path
        );
        Object.assign(headers, authHeaders);
      }

      const response = await this.fetchWithRetry(url, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}`,
        };
      }

      const carBytes = new Uint8Array(await response.arrayBuffer());

      return {
        success: true,
        carBytes,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Push content to a remote server
   */
  async pushToRemote(
    endpoint: string,
    records: SyncRecord[]
  ): Promise<SyncResult> {
    const result: SyncResult = {
      success: true,
      recordsProcessed: 0,
      recordsFailed: 0,
      errors: [],
    };

    try {
      const url = `${endpoint}/xrpc/io.exprsn.sync.pushRecords`;

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      const body = { records };

      if (this.serviceAuth && this.certificateId && this.privateKey) {
        const authHeaders = await this.serviceAuth.createAuthHeaders(
          this.certificateId,
          this.privateKey,
          'POST',
          '/xrpc/io.exprsn.sync.pushRecords',
          body
        );
        Object.assign(headers, authHeaders);
      }

      const response = await this.fetchWithRetry(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      const data = (await response.json()) as {
        processed: number;
        failed: number;
        errors?: Array<{ uri: string; error: string }>;
      };

      result.recordsProcessed = data.processed;
      result.recordsFailed = data.failed;
      if (data.errors) {
        result.errors.push(...data.errors);
      }
    } catch (error) {
      result.success = false;
      result.errors.push({
        uri: endpoint,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    return result;
  }

  /**
   * Full sync from all known relays
   */
  async fullSync(
    collections: string[],
    options: { relayEndpoints?: string[] } = {}
  ): Promise<Map<string, SyncResult>> {
    const results = new Map<string, SyncResult>();

    // Get relay endpoints from service registry or use provided
    let endpoints = options.relayEndpoints || [];

    if (endpoints.length === 0) {
      const relays = await this.db
        .select()
        .from(schema.serviceRegistry)
        .where(
          and(
            eq(schema.serviceRegistry.type, 'relay'),
            eq(schema.serviceRegistry.status, 'active')
          )
        );

      endpoints = relays.map((r) => r.endpoint);
    }

    // Sync from each relay
    for (const endpoint of endpoints) {
      const aggregateResult: SyncResult = {
        success: true,
        recordsProcessed: 0,
        recordsFailed: 0,
        errors: [],
      };

      for (const collection of collections) {
        // Get last sync cursor
        const syncState = await this.getSyncState(endpoint);
        const since = syncState?.lastSyncedAt?.toISOString();

        const result = await this.syncFromRemote(endpoint, {
          collection,
          since,
        });

        aggregateResult.recordsProcessed += result.recordsProcessed;
        aggregateResult.recordsFailed += result.recordsFailed;
        aggregateResult.errors.push(...result.errors);

        if (!result.success) {
          aggregateResult.success = false;
        }
      }

      // Update sync state
      await this.updateSyncState(endpoint, aggregateResult.success);

      results.set(endpoint, aggregateResult);
    }

    return results;
  }

  /**
   * Process and store a synced record
   */
  private async processRecord(record: SyncRecord): Promise<void> {
    // Parse the URI to extract DID, collection, rkey
    const uriParts = record.uri.replace('at://', '').split('/');
    if (uriParts.length < 3) {
      throw new Error(`Invalid record URI: ${record.uri}`);
    }

    const did = uriParts[0];
    const collection = uriParts[1];
    const rkey = uriParts[2];

    if (!did || !collection || !rkey) {
      throw new Error(`Invalid record URI parts: ${record.uri}`);
    }

    // Store in repo_records table
    await this.db
      .insert(schema.repoRecords)
      .values({
        uri: record.uri,
        cid: record.cid,
        did,
        collection,
        rkey,
        record: record.record,
        indexedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: schema.repoRecords.uri,
        set: {
          cid: record.cid,
          record: record.record,
          indexedAt: new Date(),
        },
      });
  }

  /**
   * Get sync state for an endpoint
   */
  private async getSyncState(endpoint: string): Promise<{
    lastSyncedSeq: number | null;
    lastSyncedAt: Date | null;
  } | null> {
    const results = await this.db
      .select()
      .from(schema.federationSyncState)
      .where(eq(schema.federationSyncState.remoteEndpoint, endpoint))
      .limit(1);

    const row = results[0];
    if (!row) {
      return null;
    }

    return {
      lastSyncedSeq: row.lastSyncedSeq,
      lastSyncedAt: row.lastSyncedAt,
    };
  }

  /**
   * Update sync state for an endpoint
   */
  private async updateSyncState(endpoint: string, success: boolean): Promise<void> {
    const now = new Date();

    await this.db
      .insert(schema.federationSyncState)
      .values({
        id: `sync_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        remoteEndpoint: endpoint,
        syncDirection: 'pull',
        status: success ? 'active' : 'error',
        lastSyncedAt: success ? now : undefined,
        errorCount: success ? 0 : 1,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: schema.federationSyncState.remoteEndpoint,
        set: {
          status: success ? 'active' : 'error',
          lastSyncedAt: success ? now : undefined,
          errorCount: success ? 0 : schema.federationSyncState.errorCount,
          updatedAt: now,
        },
      });
  }

  /**
   * Fetch with retry logic
   */
  private async fetchWithRetry(
    url: string,
    options: RequestInit,
    retries = 0
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.httpTimeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Retry on 5xx errors
      if (response.status >= 500 && retries < this.maxRetries) {
        await this.delay(Math.pow(2, retries) * 1000); // Exponential backoff
        return this.fetchWithRetry(url, options, retries + 1);
      }

      return response;
    } catch (error) {
      clearTimeout(timeoutId);

      if (retries < this.maxRetries) {
        await this.delay(Math.pow(2, retries) * 1000);
        return this.fetchWithRetry(url, options, retries + 1);
      }

      throw error;
    }
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export default ContentSync;
