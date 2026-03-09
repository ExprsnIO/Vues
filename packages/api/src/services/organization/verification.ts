import { eq, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '../../db/index.js';
import {
  organizations,
  organizationTypeConfigs,
  organizationActivity,
} from '../../db/schema.js';
import type { OrganizationType, VerificationRequirement, VerificationStatus } from '@exprsn/shared';
import { VERIFICATION_REQUIREMENTS } from '@exprsn/shared';

/**
 * Verification document submission
 */
export interface VerificationDocument {
  url: string;
  type: string;
  uploadedAt: string;
  fileName?: string;
  fileSize?: number;
}

/**
 * Verification submission input
 */
export interface SubmitVerificationInput {
  organizationId: string;
  submittedBy: string;
  documents: Record<string, VerificationDocument>;
  attestations?: Record<string, { confirmed: boolean; confirmedAt: string }>;
  notes?: string;
}

/**
 * Verification review input
 */
export interface ReviewVerificationInput {
  organizationId: string;
  reviewedBy: string;
  decision: 'approve' | 'reject';
  notes?: string;
}

/**
 * Organization Verification Service
 *
 * Handles verification workflows for organizations based on their type.
 * Different organization types have different verification requirements.
 */
export class OrganizationVerificationService {
  /**
   * Get verification requirements for an organization type
   */
  static async getRequirements(orgType: OrganizationType): Promise<VerificationRequirement[]> {
    // Check for custom requirements in database
    const typeConfig = await db
      .select()
      .from(organizationTypeConfigs)
      .where(eq(organizationTypeConfigs.id, orgType))
      .limit(1);

    // If custom requirements configured, parse them
    // For now, use the defaults from shared types
    return VERIFICATION_REQUIREMENTS[orgType] || [];
  }

  /**
   * Check if verification is required for an organization type
   */
  static async isVerificationRequired(orgType: OrganizationType): Promise<boolean> {
    const typeConfig = await db
      .select()
      .from(organizationTypeConfigs)
      .where(eq(organizationTypeConfigs.id, orgType))
      .limit(1);

    if (typeConfig[0]?.verificationRequired !== undefined) {
      return typeConfig[0].verificationRequired;
    }

    // Default: verification required for label, brand, enterprise, nonprofit
    const typesRequiringVerification: OrganizationType[] = ['label', 'brand', 'enterprise', 'nonprofit', 'network'];
    return typesRequiringVerification.includes(orgType);
  }

  /**
   * Get verification status for an organization
   */
  static async getVerificationStatus(organizationId: string): Promise<{
    status: VerificationStatus;
    requirements: VerificationRequirement[];
    documents?: Record<string, VerificationDocument>;
    submittedAt?: string;
    completedAt?: string;
    notes?: string;
  } | null> {
    const org = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    if (!org[0]) {
      return null;
    }

    const requirements = await this.getRequirements(org[0].type as OrganizationType);

    return {
      status: (org[0].verificationStatus || 'none') as VerificationStatus,
      requirements,
      documents: org[0].verificationDocuments as Record<string, VerificationDocument> | undefined,
      submittedAt: org[0].verificationSubmittedAt?.toISOString(),
      completedAt: org[0].verificationCompletedAt?.toISOString(),
      notes: org[0].verificationNotes || undefined,
    };
  }

  /**
   * Submit verification documents for review
   */
  static async submitForVerification(input: SubmitVerificationInput): Promise<void> {
    const org = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, input.organizationId))
      .limit(1);

    if (!org[0]) {
      throw new Error('Organization not found');
    }

    // Check if already verified
    if (org[0].verificationStatus === 'verified') {
      throw new Error('Organization is already verified');
    }

    // Check if already pending
    if (org[0].verificationStatus === 'pending') {
      throw new Error('Verification is already pending review');
    }

    // Validate required documents
    const requirements = await this.getRequirements(org[0].type as OrganizationType);
    const requiredIds = requirements.filter(r => r.required).map(r => r.id);
    const submittedIds = Object.keys(input.documents);

    const missingRequired = requiredIds.filter(id => !submittedIds.includes(id));
    if (missingRequired.length > 0) {
      const missingLabels = requirements
        .filter(r => missingRequired.includes(r.id))
        .map(r => r.label);
      throw new Error(`Missing required documents: ${missingLabels.join(', ')}`);
    }

    // Update organization with verification submission
    const now = new Date();
    await db
      .update(organizations)
      .set({
        verificationStatus: 'pending',
        verificationSubmittedAt: now,
        verificationDocuments: input.documents,
        customFields: {
          ...(org[0].customFields as Record<string, unknown> || {}),
          verificationAttestations: input.attestations,
          verificationNotes: input.notes,
        },
        updatedAt: now,
      })
      .where(eq(organizations.id, input.organizationId));

    // Log activity
    await db.insert(organizationActivity).values({
      id: nanoid(),
      organizationId: input.organizationId,
      actorDid: input.submittedBy,
      action: 'verification_submitted',
      targetType: 'organization',
      targetId: input.organizationId,
      details: {
        documentCount: Object.keys(input.documents).length,
        attestationCount: input.attestations ? Object.keys(input.attestations).length : 0,
      },
    });
  }

  /**
   * Review and approve/reject verification
   */
  static async reviewVerification(input: ReviewVerificationInput): Promise<void> {
    const org = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, input.organizationId))
      .limit(1);

    if (!org[0]) {
      throw new Error('Organization not found');
    }

    if (org[0].verificationStatus !== 'pending') {
      throw new Error('No pending verification to review');
    }

    const now = new Date();
    const newStatus: VerificationStatus = input.decision === 'approve' ? 'verified' : 'rejected';

    await db
      .update(organizations)
      .set({
        verificationStatus: newStatus,
        verificationCompletedAt: now,
        verificationNotes: input.notes,
        // If approved, also mark as verified
        verified: input.decision === 'approve' ? true : org[0].verified,
        updatedAt: now,
      })
      .where(eq(organizations.id, input.organizationId));

    // Log activity
    await db.insert(organizationActivity).values({
      id: nanoid(),
      organizationId: input.organizationId,
      actorDid: input.reviewedBy,
      action: input.decision === 'approve' ? 'verification_approved' : 'verification_rejected',
      targetType: 'organization',
      targetId: input.organizationId,
      details: {
        decision: input.decision,
        notes: input.notes,
      },
    });
  }

  /**
   * Reset verification (allow resubmission after rejection)
   */
  static async resetVerification(
    organizationId: string,
    resetBy: string,
    reason?: string
  ): Promise<void> {
    const org = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    if (!org[0]) {
      throw new Error('Organization not found');
    }

    const now = new Date();

    await db
      .update(organizations)
      .set({
        verificationStatus: 'none',
        verificationSubmittedAt: null,
        verificationCompletedAt: null,
        verificationDocuments: null,
        verificationNotes: reason,
        updatedAt: now,
      })
      .where(eq(organizations.id, organizationId));

    // Log activity
    await db.insert(organizationActivity).values({
      id: nanoid(),
      organizationId,
      actorDid: resetBy,
      action: 'verification_reset',
      targetType: 'organization',
      targetId: organizationId,
      details: { reason },
    });
  }

  /**
   * Get pending verifications (for admin review queue)
   */
  static async getPendingVerifications(options?: {
    orgType?: OrganizationType;
    limit?: number;
    offset?: number;
  }): Promise<Array<{
    organization: {
      id: string;
      name: string;
      type: string;
      avatar?: string | null;
    };
    submittedAt: string;
    documentCount: number;
  }>> {
    // Build where conditions
    const conditions = [eq(organizations.verificationStatus, 'pending')];
    if (options?.orgType) {
      conditions.push(eq(organizations.type, options.orgType));
    }

    const results = await db
      .select({
        id: organizations.id,
        name: organizations.name,
        type: organizations.type,
        avatar: organizations.avatar,
        submittedAt: organizations.verificationSubmittedAt,
        documents: organizations.verificationDocuments,
      })
      .from(organizations)
      .where(and(...conditions))
      .limit(options?.limit || 50)
      .offset(options?.offset || 0);

    return results.map(r => ({
      organization: {
        id: r.id,
        name: r.name,
        type: r.type,
        avatar: r.avatar,
      },
      submittedAt: r.submittedAt?.toISOString() || '',
      documentCount: r.documents ? Object.keys(r.documents).length : 0,
    }));
  }
}
