/**
 * Video Publishing Service
 * Handles video publishing workflow with scheduling support
 */

import { db } from '../../db/index.js';
import {
  scheduledPublishing,
  renderJobs,
  videos,
  uploadJobs,
  users,
  sounds,
  soundUsageHistory,
  challenges,
  challengeEntries,
  challengeParticipation,
} from '../../db/schema.js';
import { eq, and, lte, desc, or, isNull, sql, inArray } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { CronJob } from 'cron';
import { emitCommitToRelay, isRelayEnabled } from '../relay/index.js';

/**
 * Publishing options
 */
export interface PublishOptions {
  userDid: string;
  // Source
  renderJobId?: string;
  uploadJobId?: string;
  videoUrl?: string; // Direct URL if not from job
  // Metadata
  caption?: string;
  tags?: string[];
  thumbnailUrl?: string;
  customThumbnailKey?: string;
  // Visibility
  visibility?: 'public' | 'followers' | 'private' | 'unlisted';
  allowComments?: boolean;
  allowDuet?: boolean;
  allowStitch?: boolean;
  // Sound
  soundUri?: string;
  soundTitle?: string;
  // Scheduling
  scheduledFor?: Date;
  timezone?: string;
}

/**
 * Publishing result
 */
export interface PublishResult {
  success: boolean;
  publishingId?: string;
  videoUri?: string;
  error?: string;
  scheduledFor?: Date;
}

/**
 * Publishing Service
 */
export class PublishingService {
  private schedulerJob: CronJob | null = null;

  constructor() {}

  /**
   * Start the scheduled publishing job
   */
  startScheduler(): void {
    if (this.schedulerJob) return;

    // Run every minute to check for scheduled posts
    this.schedulerJob = new CronJob(
      '* * * * *',
      async () => {
        await this.processScheduledPublishing();
      },
      null,
      true,
      'UTC'
    );

    console.log('[PublishingService] Scheduler started');
  }

  /**
   * Stop the scheduler
   */
  stopScheduler(): void {
    if (this.schedulerJob) {
      this.schedulerJob.stop();
      this.schedulerJob = null;
    }
  }

  /**
   * Create a draft or schedule a video for publishing
   */
  async createPublishing(options: PublishOptions): Promise<PublishResult> {
    const publishingId = `pub-${nanoid()}`;

    // Validate source
    if (!options.renderJobId && !options.uploadJobId && !options.videoUrl) {
      return { success: false, error: 'No video source provided' };
    }

    // If render job, verify it's completed
    if (options.renderJobId) {
      const renderJob = await db.query.renderJobs.findFirst({
        where: and(
          eq(renderJobs.id, options.renderJobId),
          eq(renderJobs.userDid, options.userDid)
        ),
      });

      if (!renderJob) {
        return { success: false, error: 'Render job not found' };
      }

      if (renderJob.status !== 'completed') {
        return { success: false, error: 'Render job not completed' };
      }
    }

    // If upload job, verify it's completed
    if (options.uploadJobId) {
      const uploadJob = await db.query.uploadJobs.findFirst({
        where: eq(uploadJobs.id, options.uploadJobId),
      });

      if (!uploadJob) {
        return { success: false, error: 'Upload job not found' };
      }

      if (uploadJob.status !== 'completed') {
        return { success: false, error: 'Upload job not completed' };
      }
    }

    // Determine status
    const status = options.scheduledFor ? 'scheduled' : 'draft';

    // Create publishing record
    await db.insert(scheduledPublishing).values({
      id: publishingId,
      userDid: options.userDid,
      renderJobId: options.renderJobId || null,
      uploadJobId: options.uploadJobId || null,
      caption: options.caption || null,
      tags: options.tags || [],
      thumbnailUrl: options.thumbnailUrl || null,
      customThumbnailKey: options.customThumbnailKey || null,
      visibility: options.visibility || 'public',
      allowComments: options.allowComments ?? true,
      allowDuet: options.allowDuet ?? true,
      allowStitch: options.allowStitch ?? true,
      soundUri: options.soundUri || null,
      soundTitle: options.soundTitle || null,
      scheduledFor: options.scheduledFor || null,
      timezone: options.timezone || 'UTC',
      status,
    });

    // If no schedule, publish immediately
    if (!options.scheduledFor) {
      return this.publishNow(publishingId, options.userDid);
    }

    return {
      success: true,
      publishingId,
      scheduledFor: options.scheduledFor,
    };
  }

  /**
   * Publish a video immediately
   */
  async publishNow(publishingId: string, userDid: string): Promise<PublishResult> {
    const publishing = await db.query.scheduledPublishing.findFirst({
      where: and(
        eq(scheduledPublishing.id, publishingId),
        eq(scheduledPublishing.userDid, userDid)
      ),
    });

    if (!publishing) {
      return { success: false, error: 'Publishing record not found' };
    }

    if (publishing.status === 'published') {
      return {
        success: true,
        publishingId,
        videoUri: publishing.publishedVideoUri || undefined,
      };
    }

    // Update status to publishing
    await db
      .update(scheduledPublishing)
      .set({ status: 'publishing', updatedAt: new Date() })
      .where(eq(scheduledPublishing.id, publishingId));

    try {
      // Get video URL from source
      let videoUrl: string | null = null;
      let hlsPlaylist: string | null = null;
      let thumbnailUrl = publishing.thumbnailUrl;
      let duration: number | null = null;
      let aspectRatio: { width: number; height: number } | null = null;

      if (publishing.renderJobId) {
        const renderJob = await db.query.renderJobs.findFirst({
          where: eq(renderJobs.id, publishing.renderJobId),
        });

        if (!renderJob || !renderJob.outputUrl) {
          throw new Error('Render job output not found');
        }

        videoUrl = renderJob.outputUrl;
        duration = renderJob.duration;
        aspectRatio = renderJob.resolution as { width: number; height: number } | null;
      } else if (publishing.uploadJobId) {
        const uploadJob = await db.query.uploadJobs.findFirst({
          where: eq(uploadJobs.id, publishing.uploadJobId),
        });

        if (!uploadJob || !uploadJob.cdnUrl) {
          throw new Error('Upload job output not found');
        }

        videoUrl = uploadJob.cdnUrl;
        hlsPlaylist = uploadJob.hlsPlaylist;
        thumbnailUrl = thumbnailUrl || uploadJob.thumbnailUrl;
      }

      if (!videoUrl) {
        throw new Error('No video URL available');
      }

      // Create video record
      const videoId = nanoid();
      const videoUri = `at://${userDid}/io.exprsn.video.post/${videoId}`;
      const videoCid = nanoid(); // In real implementation, compute actual CID

      // Get user info for author data
      const user = await db.query.users.findFirst({
        where: eq(users.did, userDid),
      });

      if (!user) {
        throw new Error('User not found');
      }

      // Create or reference sound
      let soundUri = publishing.soundUri;
      if (!soundUri && publishing.soundTitle) {
        // Create a new sound entry using the sounds schema (id-based)
        const soundId = nanoid();
        soundUri = soundId; // Store the ID as reference

        await db.insert(sounds).values({
          id: soundId,
          originalVideoUri: videoUri,
          title: publishing.soundTitle,
          audioUrl: videoUrl, // Use video as audio source
          duration: duration || 0,
        });
      }

      // Submit to content moderation gate
      const { getContentGateService } = await import('../moderation/ContentGateService.js');
      const contentGateService = getContentGateService();
      const gateResult = await contentGateService.submitForModeration(videoUri, userDid, {
        caption: publishing.caption || undefined,
        tags: publishing.tags || [],
        thumbnailUrl: thumbnailUrl || undefined,
        duration: duration || undefined,
        cdnUrl: videoUrl,
      });

      // Determine visibility based on moderation result
      const effectiveVisibility = gateResult.autoApproved
        ? (publishing.visibility || 'public')
        : 'pending'; // Pending review videos are not publicly visible

      // Insert video with moderation status
      await db.insert(videos).values({
        uri: videoUri,
        cid: videoCid,
        authorDid: userDid,
        caption: publishing.caption || '',
        tags: publishing.tags || [],
        soundUri: soundUri || null,
        cdnUrl: videoUrl,
        hlsPlaylist: hlsPlaylist || null,
        thumbnailUrl: thumbnailUrl || null,
        duration: duration || 0,
        aspectRatio: aspectRatio || { width: 16, height: 9 },
        visibility: effectiveVisibility,
        moderationStatus: gateResult.moderationStatus,
        allowDuet: publishing.allowDuet ?? true,
        allowStitch: publishing.allowStitch ?? true,
        allowComments: publishing.allowComments ?? true,
        createdAt: new Date(),
      });

      // Log moderation result
      if (!gateResult.autoApproved) {
        console.log(`[PublishingService] Video pending moderation: ${videoUri} (risk: ${gateResult.riskLevel}, score: ${gateResult.riskScore})`);
      }

      // Track sound usage for trending calculation
      if (soundUri) {
        // Increment the sound's use count
        await db
          .update(sounds)
          .set({
            useCount: sql`${sounds.useCount} + 1`,
          })
          .where(eq(sounds.id, soundUri));

        // Record usage in history for velocity calculation
        await db.insert(soundUsageHistory).values({
          id: nanoid(),
          soundId: soundUri,
          videoUri: videoUri,
          userDid: userDid,
        });
      }

      // Auto-enter video into matching active challenges
      const tags = (publishing.tags || []).map((t: string) => t.toLowerCase().replace(/^#/, ''));
      if (tags.length > 0) {
        await this.checkAndEnterChallenges(videoUri, userDid, tags);
      }

      // Emit to relay for federation (non-blocking) - only if auto-approved
      // Videos pending moderation should not be federated until approved
      if (isRelayEnabled() && gateResult.autoApproved) {
        emitCommitToRelay(userDid, {
          rev: new Date().toISOString(),
          operation: 'create',
          collection: 'io.exprsn.video.post',
          rkey: videoId,
          cid: videoCid,
          record: {
            $type: 'io.exprsn.video.post',
            video: {
              cdnUrl: videoUrl,
              hlsPlaylist: hlsPlaylist || undefined,
              thumbnail: thumbnailUrl || undefined,
              duration: duration || undefined,
              aspectRatio: aspectRatio || undefined,
            },
            caption: publishing.caption || '',
            tags: publishing.tags || [],
            sound: soundUri ? { uri: soundUri } : undefined,
            visibility: publishing.visibility || 'public',
            allowDuet: publishing.allowDuet ?? true,
            allowStitch: publishing.allowStitch ?? true,
            allowComments: publishing.allowComments ?? true,
            createdAt: new Date().toISOString(),
          },
        }).then((event) => {
          if (event) {
            console.log(`[PublishingService] Video federated: seq=${event.seq}`);
          }
        }).catch((err) => {
          console.warn('[PublishingService] Failed to emit to relay:', err);
        });
      }

      // Update publishing record
      await db
        .update(scheduledPublishing)
        .set({
          status: 'published',
          publishedVideoUri: videoUri,
          publishedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(scheduledPublishing.id, publishingId));

      return {
        success: true,
        publishingId,
        videoUri,
      };

    } catch (error) {
      console.error('[PublishingService] Publishing failed:', error);

      await db
        .update(scheduledPublishing)
        .set({
          status: 'failed',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          updatedAt: new Date(),
        })
        .where(eq(scheduledPublishing.id, publishingId));

      return {
        success: false,
        publishingId,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Process scheduled publishing jobs
   */
  private async processScheduledPublishing(): Promise<void> {
    const now = new Date();

    // Find all scheduled posts that are due
    const duePublishing = await db
      .select()
      .from(scheduledPublishing)
      .where(
        and(
          eq(scheduledPublishing.status, 'scheduled'),
          lte(scheduledPublishing.scheduledFor, now)
        )
      )
      .limit(10);

    for (const pub of duePublishing) {
      console.log(`[PublishingService] Publishing scheduled video: ${pub.id}`);
      await this.publishNow(pub.id, pub.userDid);
    }
  }

  /**
   * Get publishing record
   */
  async getPublishing(publishingId: string, userDid: string): Promise<{
    id: string;
    status: string;
    caption?: string;
    tags: string[];
    visibility: string;
    scheduledFor?: Date;
    publishedVideoUri?: string;
    createdAt: Date;
  } | null> {
    const pub = await db.query.scheduledPublishing.findFirst({
      where: and(
        eq(scheduledPublishing.id, publishingId),
        eq(scheduledPublishing.userDid, userDid)
      ),
    });

    if (!pub) return null;

    return {
      id: pub.id,
      status: pub.status,
      caption: pub.caption || undefined,
      tags: (pub.tags as string[]) || [],
      visibility: pub.visibility,
      scheduledFor: pub.scheduledFor || undefined,
      publishedVideoUri: pub.publishedVideoUri || undefined,
      createdAt: pub.createdAt,
    };
  }

  /**
   * Get user's publishing records
   */
  async getUserPublishing(
    userDid: string,
    status?: string,
    limit = 20
  ): Promise<Array<{
    id: string;
    status: string;
    caption?: string;
    scheduledFor?: Date;
    publishedVideoUri?: string;
    createdAt: Date;
  }>> {
    // Build conditions array
    const conditions = [eq(scheduledPublishing.userDid, userDid)];
    if (status) {
      conditions.push(eq(scheduledPublishing.status, status));
    }

    const results = await db
      .select()
      .from(scheduledPublishing)
      .where(and(...conditions))
      .orderBy(desc(scheduledPublishing.createdAt))
      .limit(limit);

    return results.map((pub) => ({
      id: pub.id,
      status: pub.status,
      caption: pub.caption || undefined,
      scheduledFor: pub.scheduledFor || undefined,
      publishedVideoUri: pub.publishedVideoUri || undefined,
      createdAt: pub.createdAt,
    }));
  }

  /**
   * Update publishing record
   */
  async updatePublishing(
    publishingId: string,
    userDid: string,
    updates: Partial<PublishOptions>
  ): Promise<{ success: boolean; error?: string }> {
    const pub = await db.query.scheduledPublishing.findFirst({
      where: and(
        eq(scheduledPublishing.id, publishingId),
        eq(scheduledPublishing.userDid, userDid)
      ),
    });

    if (!pub) {
      return { success: false, error: 'Publishing record not found' };
    }

    if (pub.status === 'published' || pub.status === 'publishing') {
      return { success: false, error: 'Cannot update published or publishing video' };
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() };

    if (updates.caption !== undefined) updateData.caption = updates.caption;
    if (updates.tags !== undefined) updateData.tags = updates.tags;
    if (updates.thumbnailUrl !== undefined) updateData.thumbnailUrl = updates.thumbnailUrl;
    if (updates.visibility !== undefined) updateData.visibility = updates.visibility;
    if (updates.allowComments !== undefined) updateData.allowComments = updates.allowComments;
    if (updates.allowDuet !== undefined) updateData.allowDuet = updates.allowDuet;
    if (updates.allowStitch !== undefined) updateData.allowStitch = updates.allowStitch;
    if (updates.soundUri !== undefined) updateData.soundUri = updates.soundUri;
    if (updates.soundTitle !== undefined) updateData.soundTitle = updates.soundTitle;
    if (updates.scheduledFor !== undefined) {
      updateData.scheduledFor = updates.scheduledFor;
      updateData.status = updates.scheduledFor ? 'scheduled' : 'draft';
    }
    if (updates.timezone !== undefined) updateData.timezone = updates.timezone;

    await db
      .update(scheduledPublishing)
      .set(updateData)
      .where(eq(scheduledPublishing.id, publishingId));

    return { success: true };
  }

  /**
   * Cancel scheduled publishing
   */
  async cancelPublishing(
    publishingId: string,
    userDid: string
  ): Promise<{ success: boolean; error?: string }> {
    const pub = await db.query.scheduledPublishing.findFirst({
      where: and(
        eq(scheduledPublishing.id, publishingId),
        eq(scheduledPublishing.userDid, userDid)
      ),
    });

    if (!pub) {
      return { success: false, error: 'Publishing record not found' };
    }

    if (pub.status === 'published' || pub.status === 'publishing') {
      return { success: false, error: 'Cannot cancel published or publishing video' };
    }

    await db
      .update(scheduledPublishing)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(eq(scheduledPublishing.id, publishingId));

    return { success: true };
  }

  /**
   * Delete publishing record
   */
  async deletePublishing(
    publishingId: string,
    userDid: string
  ): Promise<{ success: boolean; error?: string }> {
    const pub = await db.query.scheduledPublishing.findFirst({
      where: and(
        eq(scheduledPublishing.id, publishingId),
        eq(scheduledPublishing.userDid, userDid)
      ),
    });

    if (!pub) {
      return { success: false, error: 'Publishing record not found' };
    }

    await db
      .delete(scheduledPublishing)
      .where(eq(scheduledPublishing.id, publishingId));

    return { success: true };
  }

  /**
   * Get scheduled publishing summary for user
   */
  async getSchedulingSummary(userDid: string): Promise<{
    drafts: number;
    scheduled: number;
    published: number;
    failed: number;
  }> {
    const results = await db
      .select({
        status: scheduledPublishing.status,
        count: db.$count(scheduledPublishing.id),
      })
      .from(scheduledPublishing)
      .where(eq(scheduledPublishing.userDid, userDid))
      .groupBy(scheduledPublishing.status);

    const summary = {
      drafts: 0,
      scheduled: 0,
      published: 0,
      failed: 0,
    };

    for (const row of results) {
      if (row.status === 'draft') summary.drafts = row.count;
      else if (row.status === 'scheduled') summary.scheduled = row.count;
      else if (row.status === 'published') summary.published = row.count;
      else if (row.status === 'failed') summary.failed = row.count;
    }

    return summary;
  }

  /**
   * Check if video tags match any active challenges and auto-enter
   */
  private async checkAndEnterChallenges(
    videoUri: string,
    userDid: string,
    tags: string[]
  ): Promise<void> {
    try {
      // Find active challenges matching video tags
      const activeChallenges = await db
        .select()
        .from(challenges)
        .where(
          and(
            eq(challenges.status, 'active'),
            inArray(
              sql`LOWER(${challenges.hashtag})`,
              tags.map((t) => t.toLowerCase())
            )
          )
        );

      for (const challenge of activeChallenges) {
        // Check if video already entered
        const existing = await db.query.challengeEntries.findFirst({
          where: eq(challengeEntries.videoUri, videoUri),
        });

        if (!existing) {
          // Create entry
          await db.insert(challengeEntries).values({
            id: nanoid(),
            challengeId: challenge.id,
            videoUri,
            userDid,
          });

          // Update challenge entry count
          await db
            .update(challenges)
            .set({
              entryCount: sql`${challenges.entryCount} + 1`,
              updatedAt: new Date(),
            })
            .where(eq(challenges.id, challenge.id));

          // Create or update participation record
          const existingParticipation = await db.query.challengeParticipation.findFirst({
            where: and(
              eq(challengeParticipation.challengeId, challenge.id),
              eq(challengeParticipation.userDid, userDid)
            ),
          });

          if (existingParticipation) {
            await db
              .update(challengeParticipation)
              .set({
                entryCount: sql`${challengeParticipation.entryCount} + 1`,
              })
              .where(eq(challengeParticipation.id, existingParticipation.id));
          } else {
            await db.insert(challengeParticipation).values({
              id: nanoid(),
              challengeId: challenge.id,
              userDid,
            });

            // Update challenge participant count
            await db
              .update(challenges)
              .set({
                participantCount: sql`${challenges.participantCount} + 1`,
                updatedAt: new Date(),
              })
              .where(eq(challenges.id, challenge.id));
          }

          console.log(
            `[PublishingService] Video ${videoUri} auto-entered into challenge ${challenge.name}`
          );
        }
      }
    } catch (error) {
      console.error('[PublishingService] Error checking challenges:', error);
      // Don't throw - challenge entry failure shouldn't block publishing
    }
  }
}

// Singleton
let publishingService: PublishingService | null = null;

export function getPublishingService(): PublishingService {
  if (!publishingService) {
    publishingService = new PublishingService();
  }
  return publishingService;
}

export function initializePublishingService(): PublishingService {
  const service = getPublishingService();
  service.startScheduler();
  return service;
}

export default PublishingService;
