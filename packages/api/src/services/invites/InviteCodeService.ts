/**
 * Invite Code Service
 * Manages certificate-backed invite codes for user registration
 */

import { db } from '../../db/index.js';
import { inviteCodes, caEntityCertificates, users } from '../../db/schema.js';
import { eq, and, sql, lt, gte, isNull, or } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import crypto from 'node:crypto';
import { certificateManager } from '../ca/CertificateManager.js';
import { signData, verifySignature } from '../ca/crypto.js';

/**
 * Generate a human-friendly invite code
 */
function generateInviteCode(): string {
  // Generate a random code in format: XXXX-XXXX-XXXX (12 chars)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude confusing chars like 0/O, 1/I
  const segments = 3;
  const segmentLength = 4;

  const code = Array.from({ length: segments }, () => {
    return Array.from({ length: segmentLength }, () => {
      return chars[Math.floor(Math.random() * chars.length)];
    }).join('');
  }).join('-');

  return code;
}

/**
 * Hash an invite code for secure storage
 */
function hashInviteCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

/**
 * Sign an invite code using a certificate
 */
async function signInviteCode(
  code: string,
  certificateId: string,
  privateKey: string
): Promise<string> {
  const dataToSign = JSON.stringify({
    code: hashInviteCode(code),
    timestamp: Date.now(),
    certificateId,
  });

  return signData(dataToSign, privateKey);
}

export class InviteCodeService {
  /**
   * Create a new invite code
   */
  async createInviteCode(options: {
    issuerDid: string;
    domainId?: string;
    maxUses?: number;
    expiresAt?: Date;
    metadata?: {
      name?: string;
      description?: string;
      tags?: string[];
      [key: string]: any;
    };
    certificateId?: string;
  }): Promise<{
    id: string;
    code: string;
    signature: string;
    expiresAt: Date | null;
  }> {
    // Generate unique invite code
    let code = generateInviteCode();
    let codeHash = hashInviteCode(code);

    // Ensure uniqueness
    let attempts = 0;
    while (attempts < 10) {
      const existing = await db
        .select()
        .from(inviteCodes)
        .where(eq(inviteCodes.codeHash, codeHash))
        .limit(1);

      if (existing.length === 0) break;

      code = generateInviteCode();
      codeHash = hashInviteCode(code);
      attempts++;
    }

    if (attempts >= 10) {
      throw new Error('Failed to generate unique invite code');
    }

    // Get or create certificate for the issuer
    let certificateId = options.certificateId;
    let privateKey: string | undefined;

    if (!certificateId) {
      // Issue a new code_signing certificate for this user
      const certResult = await certificateManager.issueEntityCertificate({
        commonName: `Invite Code Issuer - ${options.issuerDid}`,
        subjectDid: options.issuerDid,
        type: 'code_signing',
        validityDays: 365,
      });

      certificateId = certResult.id;
      privateKey = certResult.privateKey;
    } else {
      // Verify the certificate exists and is active
      const cert = await certificateManager.getEntityCertificate(certificateId);
      if (!cert) {
        throw new Error('Certificate not found');
      }
      if (cert.status !== 'active') {
        throw new Error('Certificate is not active');
      }

      // Note: In production, the private key should be retrieved securely
      // For now, we'll allow signing without the private key check
      // as the certificate manager handles private key storage
    }

    // Sign the invite code
    let signature = '';
    if (privateKey) {
      signature = await signInviteCode(code, certificateId!, privateKey);
    }

    // Create the invite code record
    const id = nanoid();
    await db.insert(inviteCodes).values({
      id,
      code,
      codeHash,
      issuerDid: options.issuerDid,
      issuerCertificateId: certificateId,
      domainId: options.domainId || null,
      maxUses: options.maxUses || 1,
      usedCount: 0,
      expiresAt: options.expiresAt || null,
      usedBy: [],
      metadata: options.metadata || null,
      status: 'active',
      signature: signature || null,
      signatureAlgorithm: 'RSA-SHA256',
      createdAt: new Date(),
    });

    return {
      id,
      code,
      signature,
      expiresAt: options.expiresAt || null,
    };
  }

  /**
   * Validate an invite code
   */
  async validateInviteCode(code: string): Promise<{
    valid: boolean;
    reason?: string;
    inviteCode?: {
      id: string;
      issuerDid: string;
      domainId: string | null;
      remainingUses: number | null;
      expiresAt: Date | null;
    };
  }> {
    const codeHash = hashInviteCode(code);

    // Find the invite code
    const [invite] = await db
      .select()
      .from(inviteCodes)
      .where(eq(inviteCodes.codeHash, codeHash))
      .limit(1);

    if (!invite) {
      return {
        valid: false,
        reason: 'Invalid invite code',
      };
    }

    // Check status
    if (invite.status === 'revoked') {
      return {
        valid: false,
        reason: 'This invite code has been revoked',
      };
    }

    if (invite.status === 'exhausted') {
      return {
        valid: false,
        reason: 'This invite code has been fully used',
      };
    }

    if (invite.status === 'expired') {
      return {
        valid: false,
        reason: 'This invite code has expired',
      };
    }

    // Check expiration
    if (invite.expiresAt && invite.expiresAt < new Date()) {
      // Mark as expired
      await db
        .update(inviteCodes)
        .set({ status: 'expired' })
        .where(eq(inviteCodes.id, invite.id));

      return {
        valid: false,
        reason: 'This invite code has expired',
      };
    }

    // Check usage limits
    if (invite.maxUses !== null && invite.usedCount >= invite.maxUses) {
      // Mark as exhausted
      await db
        .update(inviteCodes)
        .set({ status: 'exhausted' })
        .where(eq(inviteCodes.id, invite.id));

      return {
        valid: false,
        reason: 'This invite code has been fully used',
      };
    }

    // Check certificate validity if present
    if (invite.issuerCertificateId) {
      const cert = await certificateManager.getEntityCertificate(
        invite.issuerCertificateId
      );

      if (!cert) {
        return {
          valid: false,
          reason: 'Associated certificate not found',
        };
      }

      if (cert.status === 'revoked') {
        // Revoke the invite code as well
        await db
          .update(inviteCodes)
          .set({
            status: 'revoked',
            revokedAt: new Date(),
            revokedReason: 'Certificate revoked',
          })
          .where(eq(inviteCodes.id, invite.id));

        return {
          valid: false,
          reason: 'This invite code has been revoked (certificate revoked)',
        };
      }

      if (cert.notAfter < new Date()) {
        return {
          valid: false,
          reason: 'Associated certificate has expired',
        };
      }
    }

    const remainingUses =
      invite.maxUses !== null ? invite.maxUses - invite.usedCount : null;

    return {
      valid: true,
      inviteCode: {
        id: invite.id,
        issuerDid: invite.issuerDid,
        domainId: invite.domainId,
        remainingUses,
        expiresAt: invite.expiresAt,
      },
    };
  }

  /**
   * Use an invite code (mark it as used by a DID)
   */
  async useInviteCode(code: string, usedByDid: string): Promise<{
    success: boolean;
    reason?: string;
  }> {
    // First validate
    const validation = await this.validateInviteCode(code);
    if (!validation.valid) {
      return {
        success: false,
        reason: validation.reason,
      };
    }

    const codeHash = hashInviteCode(code);
    const [invite] = await db
      .select()
      .from(inviteCodes)
      .where(eq(inviteCodes.codeHash, codeHash))
      .limit(1);

    if (!invite) {
      return {
        success: false,
        reason: 'Invite code not found',
      };
    }

    // Check if already used by this DID
    const usedBy = (invite.usedBy as string[]) || [];
    if (usedBy.includes(usedByDid)) {
      return {
        success: false,
        reason: 'You have already used this invite code',
      };
    }

    // Update usage
    const newUsedBy = [...usedBy, usedByDid];
    const newUsedCount = invite.usedCount + 1;
    const isExhausted =
      invite.maxUses !== null && newUsedCount >= invite.maxUses;

    await db
      .update(inviteCodes)
      .set({
        usedCount: newUsedCount,
        usedBy: newUsedBy,
        status: isExhausted ? 'exhausted' : invite.status,
      })
      .where(eq(inviteCodes.id, invite.id));

    return {
      success: true,
    };
  }

  /**
   * Revoke an invite code
   */
  async revokeInviteCode(
    inviteCodeId: string,
    revokedBy: string,
    reason?: string
  ): Promise<{ success: boolean }> {
    await db
      .update(inviteCodes)
      .set({
        status: 'revoked',
        revokedAt: new Date(),
        revokedBy,
        revokedReason: reason || 'Revoked by admin',
      })
      .where(eq(inviteCodes.id, inviteCodeId));

    return { success: true };
  }

  /**
   * List invite codes
   */
  async listInviteCodes(options: {
    issuerDid?: string;
    domainId?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<{
    codes: Array<{
      id: string;
      code: string;
      issuerDid: string;
      domainId: string | null;
      status: string;
      maxUses: number | null;
      usedCount: number;
      remainingUses: number | null;
      expiresAt: Date | null;
      createdAt: Date;
      metadata: any;
      certificateId: string | null;
    }>;
    total: number;
  }> {
    const conditions = [];

    if (options.issuerDid) {
      conditions.push(eq(inviteCodes.issuerDid, options.issuerDid));
    }

    if (options.domainId) {
      conditions.push(eq(inviteCodes.domainId, options.domainId));
    }

    if (options.status) {
      conditions.push(eq(inviteCodes.status, options.status));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const codes = await db
      .select({
        id: inviteCodes.id,
        code: inviteCodes.code,
        issuerDid: inviteCodes.issuerDid,
        domainId: inviteCodes.domainId,
        status: inviteCodes.status,
        maxUses: inviteCodes.maxUses,
        usedCount: inviteCodes.usedCount,
        expiresAt: inviteCodes.expiresAt,
        createdAt: inviteCodes.createdAt,
        metadata: inviteCodes.metadata,
        certificateId: inviteCodes.issuerCertificateId,
      })
      .from(inviteCodes)
      .where(whereClause)
      .limit(options.limit || 50)
      .offset(options.offset || 0)
      .orderBy(sql`${inviteCodes.createdAt} DESC`);

    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(inviteCodes)
      .where(whereClause);

    const codesWithRemaining = codes.map((code) => ({
      ...code,
      remainingUses:
        code.maxUses !== null ? code.maxUses - code.usedCount : null,
    }));

    return {
      codes: codesWithRemaining,
      total: countResult?.count || 0,
    };
  }

  /**
   * Get invite code details
   */
  async getInviteCode(inviteCodeId: string): Promise<{
    id: string;
    code: string;
    issuerDid: string;
    domainId: string | null;
    status: string;
    maxUses: number | null;
    usedCount: number;
    remainingUses: number | null;
    expiresAt: Date | null;
    usedBy: string[];
    metadata: any;
    certificateId: string | null;
    signature: string | null;
    createdAt: Date;
    revokedAt: Date | null;
    revokedBy: string | null;
    revokedReason: string | null;
  } | null> {
    const [invite] = await db
      .select()
      .from(inviteCodes)
      .where(eq(inviteCodes.id, inviteCodeId))
      .limit(1);

    if (!invite) {
      return null;
    }

    const remainingUses =
      invite.maxUses !== null ? invite.maxUses - invite.usedCount : null;

    return {
      id: invite.id,
      code: invite.code,
      issuerDid: invite.issuerDid,
      domainId: invite.domainId,
      status: invite.status,
      maxUses: invite.maxUses,
      usedCount: invite.usedCount,
      remainingUses,
      expiresAt: invite.expiresAt,
      usedBy: (invite.usedBy as string[]) || [],
      metadata: invite.metadata,
      certificateId: invite.issuerCertificateId,
      signature: invite.signature,
      createdAt: invite.createdAt,
      revokedAt: invite.revokedAt,
      revokedBy: invite.revokedBy,
      revokedReason: invite.revokedReason,
    };
  }

  /**
   * Get statistics for invite codes
   */
  async getInviteCodeStats(options: {
    issuerDid?: string;
    domainId?: string;
  }): Promise<{
    total: number;
    active: number;
    revoked: number;
    expired: number;
    exhausted: number;
    totalUses: number;
  }> {
    const conditions = [];

    if (options.issuerDid) {
      conditions.push(eq(inviteCodes.issuerDid, options.issuerDid));
    }

    if (options.domainId) {
      conditions.push(eq(inviteCodes.domainId, options.domainId));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [stats] = await db
      .select({
        total: sql<number>`count(*)::int`,
        active: sql<number>`count(*) filter (where ${inviteCodes.status} = 'active')::int`,
        revoked: sql<number>`count(*) filter (where ${inviteCodes.status} = 'revoked')::int`,
        expired: sql<number>`count(*) filter (where ${inviteCodes.status} = 'expired')::int`,
        exhausted: sql<number>`count(*) filter (where ${inviteCodes.status} = 'exhausted')::int`,
        totalUses: sql<number>`coalesce(sum(${inviteCodes.usedCount}), 0)::int`,
      })
      .from(inviteCodes)
      .where(whereClause);

    return {
      total: stats?.total || 0,
      active: stats?.active || 0,
      revoked: stats?.revoked || 0,
      expired: stats?.expired || 0,
      exhausted: stats?.exhausted || 0,
      totalUses: stats?.totalUses || 0,
    };
  }

  /**
   * Batch create invite codes
   */
  async batchCreateInviteCodes(options: {
    issuerDid: string;
    domainId?: string;
    count: number;
    maxUses?: number;
    expiresAt?: Date;
    metadata?: any;
    certificateId?: string;
  }): Promise<{
    codes: Array<{ id: string; code: string }>;
    total: number;
  }> {
    if (options.count > 100) {
      throw new Error('Cannot create more than 100 codes at once');
    }

    const codes = [];
    for (let i = 0; i < options.count; i++) {
      const result = await this.createInviteCode({
        issuerDid: options.issuerDid,
        domainId: options.domainId,
        maxUses: options.maxUses,
        expiresAt: options.expiresAt,
        metadata: {
          ...options.metadata,
          batchIndex: i + 1,
          batchSize: options.count,
        },
        certificateId: options.certificateId,
      });

      codes.push({
        id: result.id,
        code: result.code,
      });
    }

    return {
      codes,
      total: codes.length,
    };
  }
}

// Export singleton instance
export const inviteCodeService = new InviteCodeService();
