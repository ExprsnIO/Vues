/**
 * Content Gate Service
 * Controls video visibility based on moderation status
 * Handles auto-approval for trusted users and submission to moderation queue
 */

import { db } from '../../db/index.js';
import {
  videos,
  trustedUsers,
  videoModerationQueue,
  moderationConfig,
} from '../../db/schema.js';
import { eq, and, isNull } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getModerationNotificationService } from './ModerationNotificationService.js';
import { ModerationService } from './service.js';

/**
 * Moderation gate result
 */
export interface GateResult {
  autoApproved: boolean;
  queueId?: string;
  moderationStatus: 'pending_review' | 'approved' | 'auto_approved';
  riskScore?: number;
  riskLevel?: string;
}

/**
 * Video metadata for moderation
 */
export interface VideoMetadata {
  caption?: string;
  tags?: string[];
  thumbnailUrl?: string;
  duration?: number;
  cdnUrl?: string;
}

/**
 * Content Gate Service
 */
export class ContentGateService {
  private moderationService: ModerationService;

  constructor() {
    this.moderationService = new ModerationService();
  }

  /**
   * Submit video for moderation gate
   * Returns whether it was auto-approved or needs manual review
   */
  async submitForModeration(
    videoUri: string,
    userDid: string,
    metadata: VideoMetadata
  ): Promise<GateResult> {
    // Check if user is trusted
    const trustedUser = await db.query.trustedUsers.findFirst({
      where: and(
        eq(trustedUsers.userDid, userDid),
        eq(trustedUsers.autoApprove, true),
        isNull(trustedUsers.revokedAt)
      ),
    });

    if (trustedUser) {
      // Update trusted user stats
      await db
        .update(trustedUsers)
        .set({
          totalUploads: (trustedUser.totalUploads ?? 0) + 1,
          approvedUploads: (trustedUser.approvedUploads ?? 0) + 1,
          updatedAt: new Date(),
        })
        .where(eq(trustedUsers.id, trustedUser.id));

      console.log(`[ContentGateService] Auto-approved video for trusted user: ${userDid}`);

      return {
        autoApproved: true,
        moderationStatus: 'auto_approved',
      };
    }

    // Get moderation config
    const config = await db.query.moderationConfig.findFirst({
      where: eq(moderationConfig.id, 'default'),
    });

    // Perform AI risk analysis if not skipped
    let riskScore = 0;
    let riskLevel = 'unknown';
    const flags: string[] = [];
    let aiAnalysis: Record<string, unknown> = {};

    if (!trustedUser) {
      try {
        // Analyze content for risks using moderation service
        const analysisResult = await this.moderationService.moderateContent({
          contentType: 'video',
          contentId: videoUri,
          sourceService: 'timeline',
          userId: userDid,
          contentText: metadata.caption || '',
          contentUrl: metadata.cdnUrl,
          contentMetadata: {
            tags: metadata.tags || [],
            thumbnailUrl: metadata.thumbnailUrl,
            duration: metadata.duration,
          },
        });

        if (analysisResult) {
          riskScore = analysisResult.riskScore ?? 0;
          riskLevel = analysisResult.riskLevel ?? 'unknown';
          aiAnalysis = { scores: analysisResult.scores };

          // Check for specific risks using the scores object
          const scores = analysisResult.scores;
          if (scores.nsfw > 50) flags.push('nsfw');
          if (scores.toxicity > 50) flags.push('toxic');
          if (scores.spam > 50) flags.push('spam');
          if (scores.violence > 50) flags.push('violence');
          if (scores.hateSpeech > 50) flags.push('hate_speech');
        }
      } catch (error) {
        console.error('[ContentGateService] AI analysis failed:', error);
        // Continue without AI analysis - will require manual review
        riskLevel = 'unknown';
      }
    }

    // Check for auto-approve threshold
    const autoApproveThreshold = config?.autoApproveThreshold ?? 20;
    if (riskScore <= autoApproveThreshold && flags.length === 0) {
      console.log(`[ContentGateService] Auto-approved video with low risk: ${videoUri} (score: ${riskScore})`);

      return {
        autoApproved: true,
        moderationStatus: 'auto_approved',
        riskScore,
        riskLevel,
      };
    }

    // Add to moderation queue
    const queueId = nanoid();
    const priority = this.calculatePriority(riskScore, riskLevel, flags);

    await db.insert(videoModerationQueue).values({
      id: queueId,
      videoUri,
      authorDid: userDid,
      riskScore,
      riskLevel,
      flags,
      aiAnalysis,
      status: 'pending',
      priority,
    });

    // Notify moderators if high risk
    if (riskLevel === 'high' || riskLevel === 'critical') {
      const notificationService = getModerationNotificationService();
      await notificationService.notifyHighRiskContent(videoUri, 'video', riskScore, riskLevel);
    }

    console.log(`[ContentGateService] Video queued for review: ${videoUri} (risk: ${riskLevel}, score: ${riskScore})`);

    return {
      autoApproved: false,
      queueId,
      moderationStatus: 'pending_review',
      riskScore,
      riskLevel,
    };
  }

  /**
   * Approve video from moderation queue
   */
  async approveVideo(
    videoUri: string,
    moderatorId: string,
    notes?: string
  ): Promise<{ success: boolean; error?: string }> {
    const queueItem = await db.query.videoModerationQueue.findFirst({
      where: eq(videoModerationQueue.videoUri, videoUri),
    });

    if (!queueItem) {
      return { success: false, error: 'Video not in moderation queue' };
    }

    if (queueItem.status !== 'pending' && queueItem.status !== 'in_review') {
      return { success: false, error: `Video already ${queueItem.status}` };
    }

    // Update queue item
    await db
      .update(videoModerationQueue)
      .set({
        status: 'approved',
        reviewedBy: moderatorId,
        reviewedAt: new Date(),
        reviewNotes: notes,
        updatedAt: new Date(),
      })
      .where(eq(videoModerationQueue.id, queueItem.id));

    // Update video status
    await db
      .update(videos)
      .set({
        moderationStatus: 'approved',
      })
      .where(eq(videos.uri, videoUri));

    // Update author's stats if they're a trusted user candidate
    const authorDid = queueItem.authorDid;
    const trustedUser = await db.query.trustedUsers.findFirst({
      where: eq(trustedUsers.userDid, authorDid),
    });

    if (trustedUser) {
      await db
        .update(trustedUsers)
        .set({
          approvedUploads: (trustedUser.approvedUploads ?? 0) + 1,
          totalUploads: (trustedUser.totalUploads ?? 0) + 1,
          updatedAt: new Date(),
        })
        .where(eq(trustedUsers.id, trustedUser.id));
    }

    console.log(`[ContentGateService] Video approved: ${videoUri} by moderator: ${moderatorId}`);

    return { success: true };
  }

  /**
   * Reject video from moderation queue
   */
  async rejectVideo(
    videoUri: string,
    moderatorId: string,
    reason: string,
    notes?: string
  ): Promise<{ success: boolean; error?: string }> {
    const queueItem = await db.query.videoModerationQueue.findFirst({
      where: eq(videoModerationQueue.videoUri, videoUri),
    });

    if (!queueItem) {
      return { success: false, error: 'Video not in moderation queue' };
    }

    if (queueItem.status !== 'pending' && queueItem.status !== 'in_review') {
      return { success: false, error: `Video already ${queueItem.status}` };
    }

    // Update queue item
    await db
      .update(videoModerationQueue)
      .set({
        status: 'rejected',
        reviewedBy: moderatorId,
        reviewedAt: new Date(),
        reviewNotes: notes,
        rejectionReason: reason,
        updatedAt: new Date(),
      })
      .where(eq(videoModerationQueue.id, queueItem.id));

    // Update video status
    await db
      .update(videos)
      .set({
        moderationStatus: 'rejected',
        visibility: 'private', // Hide rejected videos
      })
      .where(eq(videos.uri, videoUri));

    // Update author's rejected count if they're a trusted user
    const authorDid = queueItem.authorDid;
    const trustedUser = await db.query.trustedUsers.findFirst({
      where: eq(trustedUsers.userDid, authorDid),
    });

    if (trustedUser) {
      const newRejectedCount = (trustedUser.rejectedUploads ?? 0) + 1;
      await db
        .update(trustedUsers)
        .set({
          rejectedUploads: newRejectedCount,
          totalUploads: (trustedUser.totalUploads ?? 0) + 1,
          updatedAt: new Date(),
        })
        .where(eq(trustedUsers.id, trustedUser.id));

      // Revoke trust if too many rejections
      if (newRejectedCount >= 3) {
        await this.revokeTrust(
          authorDid,
          'system',
          'Automatic revocation due to multiple rejected uploads'
        );
      }
    }

    console.log(`[ContentGateService] Video rejected: ${videoUri} by moderator: ${moderatorId} - ${reason}`);

    return { success: true };
  }

  /**
   * Escalate video to higher-level moderators
   */
  async escalateVideo(
    videoUri: string,
    moderatorId: string,
    reason: string
  ): Promise<{ success: boolean; error?: string }> {
    const queueItem = await db.query.videoModerationQueue.findFirst({
      where: eq(videoModerationQueue.videoUri, videoUri),
    });

    if (!queueItem) {
      return { success: false, error: 'Video not in moderation queue' };
    }

    // Update queue item
    await db
      .update(videoModerationQueue)
      .set({
        status: 'escalated',
        priority: Math.max(queueItem.priority ?? 0, 80), // Escalated items get high priority
        reviewNotes: `Escalated by ${moderatorId}: ${reason}`,
        updatedAt: new Date(),
      })
      .where(eq(videoModerationQueue.id, queueItem.id));

    // Notify admins
    const notificationService = getModerationNotificationService();
    await notificationService.notifyEscalation(videoUri, 'video', reason, moderatorId);

    console.log(`[ContentGateService] Video escalated: ${videoUri} by: ${moderatorId}`);

    return { success: true };
  }

  /**
   * Get moderation status for a video
   */
  async getVideoModerationStatus(videoUri: string): Promise<{
    status: string;
    queueItem?: {
      id: string;
      riskScore: number;
      riskLevel: string;
      flags: string[];
      priority: number;
      assignedTo?: string;
      submittedAt: Date;
    };
  } | null> {
    const video = await db.query.videos.findFirst({
      where: eq(videos.uri, videoUri),
    });

    if (!video) {
      return null;
    }

    const queueItem = await db.query.videoModerationQueue.findFirst({
      where: eq(videoModerationQueue.videoUri, videoUri),
    });

    return {
      status: video.moderationStatus,
      queueItem: queueItem
        ? {
            id: queueItem.id,
            riskScore: queueItem.riskScore || 0,
            riskLevel: queueItem.riskLevel || 'unknown',
            flags: (queueItem.flags as string[]) || [],
            priority: queueItem.priority ?? 0,
            assignedTo: queueItem.assignedTo || undefined,
            submittedAt: queueItem.submittedAt,
          }
        : undefined,
    };
  }

  /**
   * Get moderation queue
   */
  async getModerationQueue(
    options: {
      status?: string;
      riskLevel?: string;
      assignedTo?: string;
      limit?: number;
      cursor?: string;
    } = {}
  ): Promise<{
    items: Array<{
      id: string;
      videoUri: string;
      authorDid: string;
      riskScore: number;
      riskLevel: string;
      flags: string[];
      status: string;
      priority: number;
      assignedTo?: string;
      submittedAt: Date;
    }>;
    cursor?: string;
    total: number;
  }> {
    const limit = options.limit || 20;
    const conditions = [];

    if (options.status) {
      conditions.push(eq(videoModerationQueue.status, options.status));
    }
    if (options.riskLevel) {
      conditions.push(eq(videoModerationQueue.riskLevel, options.riskLevel));
    }
    if (options.assignedTo) {
      conditions.push(eq(videoModerationQueue.assignedTo, options.assignedTo));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const items = await db
      .select()
      .from(videoModerationQueue)
      .where(whereClause)
      .orderBy(videoModerationQueue.priority, videoModerationQueue.submittedAt)
      .limit(limit + 1);

    const hasMore = items.length > limit;
    const returnedItems = hasMore ? items.slice(0, limit) : items;

    // Get total count
    const countResult = await db
      .select({ count: db.$count(videoModerationQueue.id) })
      .from(videoModerationQueue)
      .where(whereClause);

    const total = countResult[0]?.count || 0;

    return {
      items: returnedItems.map((item) => ({
        id: item.id,
        videoUri: item.videoUri,
        authorDid: item.authorDid,
        riskScore: item.riskScore || 0,
        riskLevel: item.riskLevel || 'unknown',
        flags: (item.flags as string[]) || [],
        status: item.status,
        priority: item.priority ?? 0,
        assignedTo: item.assignedTo || undefined,
        submittedAt: item.submittedAt,
      })),
      cursor:
        hasMore && returnedItems.length > 0
          ? returnedItems[returnedItems.length - 1]!.id
          : undefined,
      total,
    };
  }

  /**
   * Assign queue item to moderator
   */
  async assignToModerator(
    queueId: string,
    moderatorId: string
  ): Promise<{ success: boolean; error?: string }> {
    const item = await db.query.videoModerationQueue.findFirst({
      where: eq(videoModerationQueue.id, queueId),
    });

    if (!item) {
      return { success: false, error: 'Queue item not found' };
    }

    if (item.status !== 'pending') {
      return { success: false, error: `Item is already ${item.status}` };
    }

    await db
      .update(videoModerationQueue)
      .set({
        status: 'in_review',
        assignedTo: moderatorId,
        assignedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(videoModerationQueue.id, queueId));

    return { success: true };
  }

  /**
   * Grant trust to a user
   */
  async grantTrust(
    userDid: string,
    grantedBy: string,
    options: {
      trustLevel?: string;
      autoApprove?: boolean;
      skipAiReview?: boolean;
      extendedUploadLimits?: boolean;
      reason?: string;
    } = {}
  ): Promise<{ success: boolean; error?: string }> {
    // Check if user already has trust
    const existing = await db.query.trustedUsers.findFirst({
      where: eq(trustedUsers.userDid, userDid),
    });

    if (existing && !existing.revokedAt) {
      return { success: false, error: 'User already has active trust grant' };
    }

    const id = nanoid();

    if (existing) {
      // Reinstate trust
      await db
        .update(trustedUsers)
        .set({
          trustLevel: options.trustLevel || 'basic',
          autoApprove: options.autoApprove ?? true,
          skipAiReview: options.skipAiReview ?? false,
          extendedUploadLimits: options.extendedUploadLimits ?? false,
          grantedBy,
          grantedAt: new Date(),
          grantReason: options.reason,
          revokedAt: null,
          revokedBy: null,
          revokeReason: null,
          updatedAt: new Date(),
        })
        .where(eq(trustedUsers.id, existing.id));
    } else {
      await db.insert(trustedUsers).values({
        id,
        userDid,
        trustLevel: options.trustLevel || 'basic',
        autoApprove: options.autoApprove ?? true,
        skipAiReview: options.skipAiReview ?? false,
        extendedUploadLimits: options.extendedUploadLimits ?? false,
        grantedBy,
        grantReason: options.reason,
      });
    }

    console.log(`[ContentGateService] Trust granted to user: ${userDid} by: ${grantedBy}`);

    return { success: true };
  }

  /**
   * Revoke trust from a user
   */
  async revokeTrust(
    userDid: string,
    revokedBy: string,
    reason: string
  ): Promise<{ success: boolean; error?: string }> {
    const trustedUser = await db.query.trustedUsers.findFirst({
      where: and(
        eq(trustedUsers.userDid, userDid),
        isNull(trustedUsers.revokedAt)
      ),
    });

    if (!trustedUser) {
      return { success: false, error: 'User does not have active trust grant' };
    }

    await db
      .update(trustedUsers)
      .set({
        revokedAt: new Date(),
        revokedBy,
        revokeReason: reason,
        updatedAt: new Date(),
      })
      .where(eq(trustedUsers.id, trustedUser.id));

    console.log(`[ContentGateService] Trust revoked from user: ${userDid} by: ${revokedBy}`);

    return { success: true };
  }

  /**
   * Calculate priority for queue item
   */
  private calculatePriority(riskScore: number, riskLevel: string, flags: string[]): number {
    let priority = 0;

    // Base priority from risk level
    switch (riskLevel) {
      case 'critical':
        priority = 100;
        break;
      case 'high':
        priority = 75;
        break;
      case 'medium':
        priority = 50;
        break;
      case 'low':
        priority = 25;
        break;
      default:
        priority = 10;
    }

    // Adjust for specific flags
    if (flags.includes('violence')) priority += 10;
    if (flags.includes('hate_speech')) priority += 10;
    if (flags.includes('nsfw')) priority += 5;

    // Adjust for risk score
    priority += Math.floor(riskScore / 10);

    return Math.min(100, priority);
  }
}

// Singleton instance
let contentGateService: ContentGateService | null = null;

export function getContentGateService(): ContentGateService {
  if (!contentGateService) {
    contentGateService = new ContentGateService();
  }
  return contentGateService;
}

export default ContentGateService;
