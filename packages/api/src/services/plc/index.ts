import { eq, desc, and } from 'drizzle-orm';
import crypto from 'crypto';
import { db } from '../../db/index.js';
import {
  plcOperations,
  plcIdentities,
  plcHandleReservations,
  plcAuditLog,
  systemConfig,
} from '../../db/schema.js';

/**
 * PLC Operation types
 */
export type PlcOperationType = 'create' | 'plc_operation' | 'plc_tombstone';

/**
 * PLC Operation structure
 */
export interface PlcOperationData {
  type: PlcOperationType;
  rotationKeys: string[];
  verificationMethods: {
    atproto: string;
  };
  alsoKnownAs: string[];
  services: {
    atproto_pds: {
      type: string;
      endpoint: string;
    };
  };
  prev: string | null;
  sig: string;
}

/**
 * Create operation input
 */
export interface CreateDidInput {
  handle: string;
  signingKey: string; // Public key multibase
  rotationKeys: string[]; // Array of public keys
  pdsEndpoint: string;
}

/**
 * Update operation input
 */
export interface UpdateDidInput {
  did: string;
  handle?: string;
  signingKey?: string;
  rotationKeys?: string[];
  pdsEndpoint?: string;
  alsoKnownAs?: string[];
}

/**
 * Key rotation input
 */
export interface RotateKeyInput {
  did: string;
  newSigningKey?: string;
  newRotationKeys?: string[];
  rotationKeyUsed: string; // The rotation key used to sign
  signature: string;
}

/**
 * PLC Configuration
 */
export interface PlcConfig {
  enabled: boolean;
  mode: 'standalone' | 'external';
  externalPlcUrl?: string;
  domain: string;
  handleSuffix: string; // e.g., 'exprsn' for @user.exprsn
  orgHandleSuffix: string; // e.g., 'org.exprsn' for @user.org.exprsn
  allowCustomHandles: boolean;
  requireInviteCode: boolean;
}

/**
 * Get PLC configuration from system config
 */
export async function getPlcConfig(): Promise<PlcConfig> {
  const result = await db
    .select()
    .from(systemConfig)
    .where(eq(systemConfig.key, 'plc'))
    .limit(1);

  const config = result[0]?.value as Partial<PlcConfig> | undefined;

  return {
    enabled: config?.enabled ?? process.env.PLC_ENABLED === 'true',
    mode: config?.mode ?? (process.env.PLC_MODE as 'standalone' | 'external') ?? 'standalone',
    externalPlcUrl: config?.externalPlcUrl ?? process.env.EXTERNAL_PLC_URL,
    domain: config?.domain ?? process.env.PLC_DOMAIN ?? 'plc.exprsn.io',
    handleSuffix: config?.handleSuffix ?? 'exprsn',
    orgHandleSuffix: config?.orgHandleSuffix ?? 'org.exprsn',
    allowCustomHandles: config?.allowCustomHandles ?? false,
    requireInviteCode: config?.requireInviteCode ?? false,
  };
}

/**
 * Update PLC configuration
 */
export async function updatePlcConfig(config: Partial<PlcConfig>): Promise<void> {
  const existing = await getPlcConfig();
  const newConfig = { ...existing, ...config };

  await db
    .insert(systemConfig)
    .values({
      key: 'plc',
      value: newConfig,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: systemConfig.key,
      set: {
        value: newConfig,
        updatedAt: new Date(),
      },
    });
}

/**
 * PLC Directory Service
 */
export class PlcService {
  /**
   * Generate a new did:plc identifier
   */
  static generateDid(): string {
    // did:plc identifiers are base32-encoded sha256 hashes
    const randomBytes = crypto.randomBytes(32);
    const hash = crypto.createHash('sha256').update(randomBytes).digest();
    // Convert to base32 (simplified - real PLC uses specific encoding)
    const base32Chars = 'abcdefghijklmnopqrstuvwxyz234567';
    let result = '';
    for (let i = 0; i < 24; i++) {
      const byte = hash[i % hash.length];
      if (byte !== undefined) {
        result += base32Chars[byte % 32];
      }
    }
    return `did:plc:${result}`;
  }

  /**
   * Generate CID for an operation
   */
  static generateOperationCid(operation: unknown): string {
    const json = JSON.stringify(operation);
    const hash = crypto.createHash('sha256').update(json).digest('hex');
    return `bafyrei${hash.slice(0, 52)}`; // Simplified CID format
  }

  /**
   * Validate handle format for Exprsn
   */
  static async validateHandle(handle: string): Promise<{ valid: boolean; error?: string; type?: 'user' | 'org' }> {
    const config = await getPlcConfig();

    // Normalize handle
    const normalizedHandle = handle.toLowerCase().replace(/^@/, '');

    // Check user handle format: username.exprsn
    const userRegex = new RegExp(`^[a-z0-9][a-z0-9-]{0,28}[a-z0-9]\\.${config.handleSuffix}$`);
    // Check org handle format: username.org.exprsn
    const orgRegex = new RegExp(`^[a-z0-9][a-z0-9-]{0,28}[a-z0-9]\\.${config.orgHandleSuffix}$`);

    if (userRegex.test(normalizedHandle)) {
      return { valid: true, type: 'user' };
    }

    if (orgRegex.test(normalizedHandle)) {
      return { valid: true, type: 'org' };
    }

    // Check if custom handles are allowed
    if (config.allowCustomHandles) {
      // Basic domain validation
      const domainRegex = /^[a-z0-9][a-z0-9-]*[a-z0-9](\.[a-z0-9][a-z0-9-]*[a-z0-9])+$/;
      if (domainRegex.test(normalizedHandle)) {
        return { valid: true, type: 'user' };
      }
    }

    return {
      valid: false,
      error: `Handle must be in format @username.${config.handleSuffix} or @username.${config.orgHandleSuffix}`,
    };
  }

  /**
   * Check if handle is available
   */
  static async isHandleAvailable(handle: string): Promise<boolean> {
    const normalizedHandle = handle.toLowerCase().replace(/^@/, '');

    // Check plc_identities
    const existing = await db
      .select()
      .from(plcIdentities)
      .where(eq(plcIdentities.handle, normalizedHandle))
      .limit(1);

    if (existing.length > 0) {
      return false;
    }

    // Check reservations
    const reserved = await db
      .select()
      .from(plcHandleReservations)
      .where(
        and(
          eq(plcHandleReservations.handle, normalizedHandle),
          eq(plcHandleReservations.status, 'active')
        )
      )
      .limit(1);

    return reserved.length === 0;
  }

  /**
   * Create a new DID
   */
  static async createDid(input: CreateDidInput, ipAddress?: string, userAgent?: string): Promise<{
    did: string;
    handle: string;
    operationCid: string;
  }> {
    const config = await getPlcConfig();

    // Validate handle
    const handleValidation = await this.validateHandle(input.handle);
    if (!handleValidation.valid) {
      throw new Error(handleValidation.error);
    }

    // Check handle availability
    const available = await this.isHandleAvailable(input.handle);
    if (!available) {
      throw new Error('Handle is already taken');
    }

    const normalizedHandle = input.handle.toLowerCase().replace(/^@/, '');
    const did = this.generateDid();

    // Create the operation
    const operation: PlcOperationData = {
      type: 'create',
      rotationKeys: input.rotationKeys,
      verificationMethods: {
        atproto: input.signingKey,
      },
      alsoKnownAs: [`at://${normalizedHandle}`],
      services: {
        atproto_pds: {
          type: 'AtprotoPersonalDataServer',
          endpoint: input.pdsEndpoint,
        },
      },
      prev: null,
      sig: '', // Would be signed in real implementation
    };

    const cid = this.generateOperationCid(operation);

    // Store operation
    await db.insert(plcOperations).values({
      did,
      cid,
      operation,
      nullified: false,
    });

    // Store identity state
    await db.insert(plcIdentities).values({
      did,
      handle: normalizedHandle,
      pdsEndpoint: input.pdsEndpoint,
      signingKey: input.signingKey,
      rotationKeys: input.rotationKeys,
      alsoKnownAs: [`at://${normalizedHandle}`],
      services: {
        atproto_pds: {
          type: 'AtprotoPersonalDataServer',
          endpoint: input.pdsEndpoint,
        },
      },
      lastOperationCid: cid,
    });

    // Audit log
    await db.insert(plcAuditLog).values({
      did,
      action: 'create',
      operationCid: cid,
      newState: {
        handle: normalizedHandle,
        pdsEndpoint: input.pdsEndpoint,
        signingKey: input.signingKey,
        rotationKeys: input.rotationKeys,
      },
      ipAddress,
      userAgent,
    });

    return {
      did,
      handle: normalizedHandle,
      operationCid: cid,
    };
  }

  /**
   * Update a DID (handle, PDS endpoint, etc.)
   */
  static async updateDid(input: UpdateDidInput, ipAddress?: string, userAgent?: string): Promise<{
    operationCid: string;
  }> {
    // Get current state
    const current = await db
      .select()
      .from(plcIdentities)
      .where(eq(plcIdentities.did, input.did))
      .limit(1);

    if (current.length === 0) {
      throw new Error('DID not found');
    }

    const identity = current[0];
    if (!identity) {
      throw new Error('DID not found');
    }

    // Validate new handle if provided
    if (input.handle) {
      const handleValidation = await this.validateHandle(input.handle);
      if (!handleValidation.valid) {
        throw new Error(handleValidation.error);
      }

      const normalizedHandle = input.handle.toLowerCase().replace(/^@/, '');
      if (normalizedHandle !== identity.handle) {
        const available = await this.isHandleAvailable(normalizedHandle);
        if (!available) {
          throw new Error('Handle is already taken');
        }
      }
    }

    const normalizedHandle = input.handle
      ? input.handle.toLowerCase().replace(/^@/, '')
      : identity.handle;

    // Create update operation
    const operation: PlcOperationData = {
      type: 'plc_operation',
      rotationKeys: input.rotationKeys || (identity.rotationKeys as string[]),
      verificationMethods: {
        atproto: input.signingKey || identity.signingKey || '',
      },
      alsoKnownAs: input.alsoKnownAs || [`at://${normalizedHandle}`],
      services: {
        atproto_pds: {
          type: 'AtprotoPersonalDataServer',
          endpoint: input.pdsEndpoint || identity.pdsEndpoint || '',
        },
      },
      prev: identity.lastOperationCid,
      sig: '', // Would be signed
    };

    const cid = this.generateOperationCid(operation);

    // Store operation
    await db.insert(plcOperations).values({
      did: input.did,
      cid,
      operation,
      nullified: false,
    });

    // Update identity state
    await db
      .update(plcIdentities)
      .set({
        handle: normalizedHandle,
        pdsEndpoint: input.pdsEndpoint || identity.pdsEndpoint,
        signingKey: input.signingKey || identity.signingKey,
        rotationKeys: input.rotationKeys || identity.rotationKeys,
        alsoKnownAs: input.alsoKnownAs || [`at://${normalizedHandle}`],
        lastOperationCid: cid,
        updatedAt: new Date(),
      })
      .where(eq(plcIdentities.did, input.did));

    // Audit log
    await db.insert(plcAuditLog).values({
      did: input.did,
      action: 'update',
      operationCid: cid,
      previousState: {
        handle: identity.handle,
        pdsEndpoint: identity.pdsEndpoint,
        signingKey: identity.signingKey,
      },
      newState: {
        handle: normalizedHandle,
        pdsEndpoint: input.pdsEndpoint || identity.pdsEndpoint,
        signingKey: input.signingKey || identity.signingKey,
      },
      ipAddress,
      userAgent,
    });

    return { operationCid: cid };
  }

  /**
   * Rotate keys for a DID
   */
  static async rotateKeys(input: RotateKeyInput, ipAddress?: string, userAgent?: string): Promise<{
    operationCid: string;
  }> {
    // Get current state
    const current = await db
      .select()
      .from(plcIdentities)
      .where(eq(plcIdentities.did, input.did))
      .limit(1);

    if (current.length === 0) {
      throw new Error('DID not found');
    }

    const identity = current[0];
    if (!identity) {
      throw new Error('DID not found');
    }

    // Verify rotation key is authorized
    const rotationKeys = identity.rotationKeys as string[];
    if (!rotationKeys.includes(input.rotationKeyUsed)) {
      throw new Error('Unauthorized rotation key');
    }

    // TODO: Verify signature in production

    const newSigningKey = input.newSigningKey || identity.signingKey;
    const newRotationKeys = input.newRotationKeys || rotationKeys;

    // Create rotation operation
    const operation: PlcOperationData = {
      type: 'plc_operation',
      rotationKeys: newRotationKeys,
      verificationMethods: {
        atproto: newSigningKey || '',
      },
      alsoKnownAs: (identity.alsoKnownAs as string[]) || [],
      services: {
        atproto_pds: {
          type: 'AtprotoPersonalDataServer',
          endpoint: identity.pdsEndpoint || '',
        },
      },
      prev: identity.lastOperationCid,
      sig: input.signature,
    };

    const cid = this.generateOperationCid(operation);

    // Store operation
    await db.insert(plcOperations).values({
      did: input.did,
      cid,
      operation,
      nullified: false,
    });

    // Update identity state
    await db
      .update(plcIdentities)
      .set({
        signingKey: newSigningKey,
        rotationKeys: newRotationKeys,
        lastOperationCid: cid,
        updatedAt: new Date(),
      })
      .where(eq(plcIdentities.did, input.did));

    // Audit log
    await db.insert(plcAuditLog).values({
      did: input.did,
      action: 'rotate_key',
      operationCid: cid,
      previousState: {
        signingKey: identity.signingKey,
        rotationKeys: identity.rotationKeys,
      },
      newState: {
        signingKey: newSigningKey,
        rotationKeys: newRotationKeys,
      },
      ipAddress,
      userAgent,
    });

    return { operationCid: cid };
  }

  /**
   * Get DID document
   * Returns a tombstone document if the DID has been tombstoned
   */
  static async getDidDocument(did: string): Promise<{
    '@context': string[];
    id: string;
    alsoKnownAs?: string[];
    verificationMethod?: Array<{
      id: string;
      type: string;
      controller: string;
      publicKeyMultibase?: string;
    }>;
    service?: Array<{
      id: string;
      type: string;
      serviceEndpoint: string;
    }>;
    deactivated?: boolean;
  } | null> {
    const identity = await db
      .select()
      .from(plcIdentities)
      .where(eq(plcIdentities.did, did))
      .limit(1);

    if (identity.length === 0) {
      return null;
    }

    const id = identity[0];
    if (!id) {
      return null;
    }

    // If tombstoned, return minimal document with deactivated flag
    if (id.status === 'tombstoned') {
      return {
        '@context': [
          'https://www.w3.org/ns/did/v1',
        ],
        id: did,
        deactivated: true,
      };
    }

    const services = id.services as Record<string, { type: string; endpoint: string }> | null;

    return {
      '@context': [
        'https://www.w3.org/ns/did/v1',
        'https://w3id.org/security/multikey/v1',
        'https://w3id.org/security/suites/secp256k1-2019/v1',
      ],
      id: did,
      alsoKnownAs: (id.alsoKnownAs as string[]) || [],
      verificationMethod: id.signingKey
        ? [
            {
              id: `${did}#atproto`,
              type: 'Multikey',
              controller: did,
              publicKeyMultibase: id.signingKey,
            },
          ]
        : undefined,
      service: services
        ? Object.entries(services).map(([key, value]) => ({
            id: `${did}#${key}`,
            type: value.type,
            serviceEndpoint: value.endpoint,
          }))
        : undefined,
    };
  }

  /**
   * Get operations log for a DID
   */
  static async getOperationsLog(did: string): Promise<Array<{
    cid: string;
    operation: unknown;
    nullified: boolean;
    createdAt: Date;
  }>> {
    const operations = await db
      .select()
      .from(plcOperations)
      .where(eq(plcOperations.did, did))
      .orderBy(desc(plcOperations.createdAt));

    return operations.map((op) => ({
      cid: op.cid,
      operation: op.operation,
      nullified: op.nullified,
      createdAt: op.createdAt,
    }));
  }

  /**
   * Resolve handle to DID
   * Returns null for tombstoned DIDs
   */
  static async resolveHandle(handle: string): Promise<string | null> {
    const normalizedHandle = handle.toLowerCase().replace(/^@/, '');

    const identity = await db
      .select({ did: plcIdentities.did, status: plcIdentities.status })
      .from(plcIdentities)
      .where(eq(plcIdentities.handle, normalizedHandle))
      .limit(1);

    // Don't resolve tombstoned identities
    if (identity[0]?.status === 'tombstoned') {
      return null;
    }

    return identity[0]?.did || null;
  }

  /**
   * Get identity by DID
   */
  static async getIdentity(did: string): Promise<{
    did: string;
    handle: string | null;
    pdsEndpoint: string | null;
    signingKey: string | null;
    rotationKeys: string[];
    createdAt: Date;
    updatedAt: Date;
  } | null> {
    const identity = await db
      .select()
      .from(plcIdentities)
      .where(eq(plcIdentities.did, did))
      .limit(1);

    if (identity.length === 0) {
      return null;
    }

    const id = identity[0];
    if (!id) {
      return null;
    }

    return {
      did: id.did,
      handle: id.handle,
      pdsEndpoint: id.pdsEndpoint,
      signingKey: id.signingKey,
      rotationKeys: (id.rotationKeys as string[]) || [],
      createdAt: id.createdAt,
      updatedAt: id.updatedAt,
    };
  }

  /**
   * Reserve a handle (for organizations)
   */
  static async reserveHandle(
    handle: string,
    type: 'user' | 'org',
    reservedBy?: string,
    organizationId?: string
  ): Promise<void> {
    const normalizedHandle = handle.toLowerCase().replace(/^@/, '');

    // Check if already taken
    const available = await this.isHandleAvailable(normalizedHandle);
    if (!available) {
      throw new Error('Handle is already taken or reserved');
    }

    await db.insert(plcHandleReservations).values({
      handle: normalizedHandle,
      handleType: type,
      organizationId,
      reservedBy,
      status: 'active',
    });
  }

  /**
   * Release a handle reservation
   */
  static async releaseHandle(handle: string): Promise<void> {
    const normalizedHandle = handle.toLowerCase().replace(/^@/, '');

    await db
      .update(plcHandleReservations)
      .set({ status: 'released' })
      .where(eq(plcHandleReservations.handle, normalizedHandle));
  }

  /**
   * Get audit log for a DID
   */
  static async getAuditLog(did: string, limit = 50): Promise<Array<{
    action: string;
    operationCid: string | null;
    previousState: unknown;
    newState: unknown;
    createdAt: Date;
  }>> {
    const logs = await db
      .select()
      .from(plcAuditLog)
      .where(eq(plcAuditLog.did, did))
      .orderBy(desc(plcAuditLog.createdAt))
      .limit(limit);

    return logs.map((log) => ({
      action: log.action,
      operationCid: log.operationCid,
      previousState: log.previousState,
      newState: log.newState,
      createdAt: log.createdAt,
    }));
  }

  /**
   * Tombstone a DID (permanently deactivate)
   * This is an irreversible operation - the DID can no longer be used
   */
  static async tombstoneDid(
    did: string,
    reason: string,
    performedBy: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ operationCid: string }> {
    // Get current state
    const current = await db
      .select()
      .from(plcIdentities)
      .where(eq(plcIdentities.did, did))
      .limit(1);

    if (current.length === 0) {
      throw new Error('DID not found');
    }

    const identity = current[0];
    if (!identity) {
      throw new Error('DID not found');
    }

    // Check if already tombstoned
    if (identity.status === 'tombstoned') {
      throw new Error('DID is already tombstoned');
    }

    // Create tombstone operation (per AT Protocol spec)
    const operation = {
      type: 'plc_tombstone' as const,
      prev: identity.lastOperationCid,
    };

    const cid = this.generateOperationCid(operation);

    // Store tombstone operation
    await db.insert(plcOperations).values({
      did,
      cid,
      operation,
      nullified: false,
    });

    // Update identity status
    await db
      .update(plcIdentities)
      .set({
        status: 'tombstoned',
        tombstonedAt: new Date(),
        tombstonedBy: performedBy,
        tombstoneReason: reason,
        lastOperationCid: cid,
        // Clear sensitive data but keep for audit
        signingKey: null,
        services: null,
        updatedAt: new Date(),
      })
      .where(eq(plcIdentities.did, did));

    // Audit log
    await db.insert(plcAuditLog).values({
      did,
      action: 'tombstone',
      operationCid: cid,
      previousState: {
        status: identity.status || 'active',
        handle: identity.handle,
        signingKey: identity.signingKey,
      },
      newState: {
        status: 'tombstoned',
        reason,
      },
      ipAddress,
      userAgent,
    });

    return { operationCid: cid };
  }

  /**
   * Check if a DID is tombstoned
   */
  static async isTombstoned(did: string): Promise<boolean> {
    const identity = await db
      .select({ status: plcIdentities.status })
      .from(plcIdentities)
      .where(eq(plcIdentities.did, did))
      .limit(1);

    return identity[0]?.status === 'tombstoned';
  }

  /**
   * List identities with optional filters
   */
  static async listIdentities(options: {
    status?: 'active' | 'tombstoned' | 'deactivated';
    limit?: number;
    offset?: number;
  } = {}): Promise<Array<{
    did: string;
    handle: string | null;
    status: string;
    pdsEndpoint: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>> {
    const limit = options.limit || 50;
    const offset = options.offset || 0;

    let query = db
      .select({
        did: plcIdentities.did,
        handle: plcIdentities.handle,
        status: plcIdentities.status,
        pdsEndpoint: plcIdentities.pdsEndpoint,
        createdAt: plcIdentities.createdAt,
        updatedAt: plcIdentities.updatedAt,
      })
      .from(plcIdentities)
      .orderBy(desc(plcIdentities.createdAt))
      .limit(limit)
      .offset(offset);

    if (options.status) {
      query = query.where(eq(plcIdentities.status, options.status)) as typeof query;
    }

    return await query;
  }

  /**
   * Get identity count by status
   */
  static async getIdentityStats(): Promise<{
    total: number;
    active: number;
    tombstoned: number;
    deactivated: number;
  }> {
    const all = await db.select().from(plcIdentities);

    const stats = {
      total: all.length,
      active: 0,
      tombstoned: 0,
      deactivated: 0,
    };

    for (const id of all) {
      if (id.status === 'active') stats.active++;
      else if (id.status === 'tombstoned') stats.tombstoned++;
      else if (id.status === 'deactivated') stats.deactivated++;
    }

    return stats;
  }
}

export default PlcService;
