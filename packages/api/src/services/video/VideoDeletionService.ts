/**
 * Video Deletion Service
 * Handles multi-level video deletion with audit logging
 */

import { db } from '../../db/index.js';
import {
  videos,
  videoDeletionLog,
  users,
  likes,
  comments,
  reposts,
  bookmarks,
  videoReactions,
  domainModerators,
} from '../../db/schema.js';
import { eq, and, inArray } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { S3Client, DeleteObjectCommand, DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { emitCommitToRelay, isRelayEnabled } from '../relay/index.js';

/**
 * Deletion types mapped to permission levels
 */
export type DeletionType = 'user_soft' | 'domain_mod' | 'global_admin' | 'system_hard';

/**
 * Video deletion result
 */
export interface DeletionResult {
  success: boolean;
  deletionId?: string;
  error?: string;
}

/**
 * Restore result
 */
export interface RestoreResult {
  success: boolean;
  videoUri?: string;
  error?: string;
}

// S3 client for media deletion
const s3 = new S3Client({
  endpoint: process.env.DO_SPACES_ENDPOINT || `https://${process.env.DO_SPACES_REGION}.digitaloceanspaces.com`,
  region: process.env.DO_SPACES_REGION || 'nyc3',
  credentials: {
    accessKeyId: process.env.DO_SPACES_KEY!,
    secretAccessKey: process.env.DO_SPACES_SECRET!,
  },
  forcePathStyle: true,
});

/**
 * Video Deletion Service
 */
export class VideoDeletionService {
  /**
   * Delete a video as the owner (soft delete)
   */
  async deleteOwnVideo(
    videoUri: string,
    userDid: string,
    reason?: string
  ): Promise<DeletionResult> {
    // Verify ownership
    const video = await db.query.videos.findFirst({
      where: eq(videos.uri, videoUri),
    });

    if (!video) {
      return { success: false, error: 'Video not found' };
    }

    if (video.authorDid !== userDid) {
      return { success: false, error: 'Not authorized to delete this video' };
    }

    if (video.deletedAt) {
      return { success: false, error: 'Video already deleted' };
    }

    return this.performSoftDelete(video, userDid, 'user_soft', reason);
  }

  /**
   * Delete a video as a domain moderator
   */
  async deleteAsDomainModerator(
    videoUri: string,
    moderatorDid: string,
    domainId: string,
    reason: string
  ): Promise<DeletionResult> {
    // Verify moderator permissions
    const moderator = await db.query.domainModerators.findFirst({
      where: and(
        eq(domainModerators.domainId, domainId),
        eq(domainModerators.userDid, moderatorDid),
        eq(domainModerators.active, true),
        eq(domainModerators.canDelete, true)
      ),
    });

    if (!moderator) {
      return { success: false, error: 'Not authorized as domain moderator' };
    }

    const video = await db.query.videos.findFirst({
      where: eq(videos.uri, videoUri),
    });

    if (!video) {
      return { success: false, error: 'Video not found' };
    }

    if (video.deletedAt) {
      return { success: false, error: 'Video already deleted' };
    }

    return this.performSoftDelete(video, moderatorDid, 'domain_mod', reason, domainId);
  }

  /**
   * Delete a video as a global admin (soft delete)
   */
  async deleteAsAdmin(
    videoUri: string,
    adminId: string,
    reason: string
  ): Promise<DeletionResult> {
    const video = await db.query.videos.findFirst({
      where: eq(videos.uri, videoUri),
    });

    if (!video) {
      return { success: false, error: 'Video not found' };
    }

    if (video.deletedAt) {
      return { success: false, error: 'Video already deleted' };
    }

    return this.performSoftDelete(video, adminId, 'global_admin', reason);
  }

  /**
   * Permanently delete a video (hard delete - super admin only)
   * This removes all data including media files
   */
  async hardDelete(
    videoUri: string,
    adminId: string,
    reason: string
  ): Promise<DeletionResult> {
    const video = await db.query.videos.findFirst({
      where: eq(videos.uri, videoUri),
    });

    if (!video) {
      return { success: false, error: 'Video not found' };
    }

    const deletionId = nanoid();

    try {
      // Create audit log entry before deletion
      await db.insert(videoDeletionLog).values({
        id: deletionId,
        videoUri: video.uri,
        videoCid: video.cid,
        authorDid: video.authorDid,
        deletedBy: adminId,
        deletionType: 'system_hard',
        reason,
        caption: video.caption,
        tags: video.tags || [],
        cdnUrl: video.cdnUrl,
        thumbnailUrl: video.thumbnailUrl,
        viewCount: video.viewCount,
        likeCount: video.likeCount,
        canRestore: false, // Hard delete cannot be restored
      });

      // Delete media files from S3/Spaces
      if (video.cdnUrl) {
        await this.deleteMediaFiles(video.cdnUrl, video.authorDid);
      }

      // Delete all related records
      await Promise.all([
        db.delete(likes).where(eq(likes.videoUri, videoUri)),
        db.delete(comments).where(eq(comments.videoUri, videoUri)),
        db.delete(reposts).where(eq(reposts.videoUri, videoUri)),
        db.delete(bookmarks).where(eq(bookmarks.videoUri, videoUri)),
        db.delete(videoReactions).where(eq(videoReactions.videoUri, videoUri)),
      ]);

      // Delete the video record
      await db.delete(videos).where(eq(videos.uri, videoUri));

      // Emit to federation relay
      await this.emitDeletionToRelay(video.authorDid, video.uri, video.cid);

      // Update author's video count
      await this.decrementAuthorVideoCount(video.authorDid);

      console.log(`[VideoDeletionService] Hard deleted video: ${videoUri} by admin: ${adminId}`);

      return {
        success: true,
        deletionId,
      };
    } catch (error) {
      console.error('[VideoDeletionService] Hard delete failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Hard delete failed',
      };
    }
  }

  /**
   * Restore a soft-deleted video
   */
  async restoreVideo(
    videoUri: string,
    adminId: string
  ): Promise<RestoreResult> {
    const video = await db.query.videos.findFirst({
      where: eq(videos.uri, videoUri),
    });

    if (!video) {
      // Check deletion log for hard-deleted videos
      const deletionLog = await db.query.videoDeletionLog.findFirst({
        where: eq(videoDeletionLog.videoUri, videoUri),
      });

      if (deletionLog && !deletionLog.canRestore) {
        return { success: false, error: 'Video was permanently deleted and cannot be restored' };
      }

      return { success: false, error: 'Video not found' };
    }

    if (!video.deletedAt) {
      return { success: false, error: 'Video is not deleted' };
    }

    try {
      // Restore the video
      await db
        .update(videos)
        .set({
          deletedAt: null,
          deletedBy: null,
          deletionType: null,
          deletionReason: null,
          moderationStatus: 'approved', // Restored videos are automatically approved
        })
        .where(eq(videos.uri, videoUri));

      // Update deletion log
      await db
        .update(videoDeletionLog)
        .set({
          restoredAt: new Date(),
          restoredBy: adminId,
        })
        .where(and(
          eq(videoDeletionLog.videoUri, videoUri),
          eq(videoDeletionLog.restoredAt, null as unknown as Date)
        ));

      // Update author's video count
      await this.incrementAuthorVideoCount(video.authorDid);

      console.log(`[VideoDeletionService] Restored video: ${videoUri} by admin: ${adminId}`);

      return {
        success: true,
        videoUri,
      };
    } catch (error) {
      console.error('[VideoDeletionService] Restore failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Restore failed',
      };
    }
  }

  /**
   * Get deletion history for a video
   */
  async getDeletionHistory(videoUri: string): Promise<Array<{
    id: string;
    deletionType: string;
    deletedBy: string;
    reason?: string;
    createdAt: Date;
    restoredAt?: Date;
    restoredBy?: string;
  }>> {
    const history = await db
      .select()
      .from(videoDeletionLog)
      .where(eq(videoDeletionLog.videoUri, videoUri))
      .orderBy(videoDeletionLog.createdAt);

    return history.map((entry) => ({
      id: entry.id,
      deletionType: entry.deletionType,
      deletedBy: entry.deletedBy,
      reason: entry.reason || undefined,
      createdAt: entry.createdAt,
      restoredAt: entry.restoredAt || undefined,
      restoredBy: entry.restoredBy || undefined,
    }));
  }

  /**
   * Get user's deleted videos
   */
  async getUserDeletedVideos(
    userDid: string,
    limit = 20,
    cursor?: string
  ): Promise<{
    videos: Array<{
      uri: string;
      caption?: string;
      thumbnailUrl?: string;
      deletedAt: Date;
      deletionType: string;
      deletionReason?: string;
    }>;
    cursor?: string;
  }> {
    const conditions = [
      eq(videos.authorDid, userDid),
    ];

    if (cursor) {
      // Cursor is the deletedAt timestamp
      // Note: We need to handle this differently since deletedAt can be null
    }

    const results = await db
      .select()
      .from(videos)
      .where(and(...conditions))
      .limit(limit + 1);

    // Filter to only deleted videos after fetching
    const deletedVideos = results.filter(v => v.deletedAt !== null);
    const hasMore = deletedVideos.length > limit;
    const returnedVideos = hasMore ? deletedVideos.slice(0, limit) : deletedVideos;

    return {
      videos: returnedVideos.map((v) => ({
        uri: v.uri,
        caption: v.caption || undefined,
        thumbnailUrl: v.thumbnailUrl || undefined,
        deletedAt: v.deletedAt!,
        deletionType: v.deletionType || 'unknown',
        deletionReason: v.deletionReason || undefined,
      })),
      cursor: hasMore && returnedVideos.length > 0
        ? returnedVideos[returnedVideos.length - 1]!.deletedAt?.toISOString()
        : undefined,
    };
  }

  /**
   * Perform soft delete with audit logging
   */
  private async performSoftDelete(
    video: typeof videos.$inferSelect,
    deletedBy: string,
    deletionType: DeletionType,
    reason?: string,
    domainId?: string
  ): Promise<DeletionResult> {
    const deletionId = nanoid();

    try {
      // Create audit log entry
      await db.insert(videoDeletionLog).values({
        id: deletionId,
        videoUri: video.uri,
        videoCid: video.cid,
        authorDid: video.authorDid,
        deletedBy,
        deletionType,
        reason,
        caption: video.caption,
        tags: video.tags || [],
        cdnUrl: video.cdnUrl,
        thumbnailUrl: video.thumbnailUrl,
        viewCount: video.viewCount,
        likeCount: video.likeCount,
        canRestore: true,
        domainId,
      });

      // Soft delete the video
      await db
        .update(videos)
        .set({
          deletedAt: new Date(),
          deletedBy,
          deletionType,
          deletionReason: reason,
        })
        .where(eq(videos.uri, video.uri));

      // Emit to federation relay
      await this.emitDeletionToRelay(video.authorDid, video.uri, video.cid);

      // Update author's video count
      await this.decrementAuthorVideoCount(video.authorDid);

      console.log(`[VideoDeletionService] Soft deleted video: ${video.uri} by: ${deletedBy} (${deletionType})`);

      return {
        success: true,
        deletionId,
      };
    } catch (error) {
      console.error('[VideoDeletionService] Soft delete failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Deletion failed',
      };
    }
  }

  /**
   * Delete media files from S3/Spaces
   */
  private async deleteMediaFiles(cdnUrl: string, userDid: string): Promise<void> {
    try {
      const bucket = process.env.DO_SPACES_BUCKET;
      if (!bucket) {
        console.warn('[VideoDeletionService] No bucket configured, skipping media deletion');
        return;
      }

      // Extract the key prefix from the CDN URL
      // CDN URLs typically look like: https://bucket.region.digitaloceanspaces.com/uploads/user-did/upload-id/...
      const url = new URL(cdnUrl);
      const key = url.pathname.slice(1); // Remove leading /

      // Get the directory prefix to delete all related files (HLS segments, thumbnails, etc.)
      const keyParts = key.split('/');
      keyParts.pop(); // Remove filename
      const prefix = keyParts.join('/');

      if (!prefix) {
        console.warn('[VideoDeletionService] Could not determine key prefix for deletion');
        return;
      }

      // List all objects with the prefix
      const listCommand = new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
      });

      const listResult = await s3.send(listCommand);

      if (!listResult.Contents || listResult.Contents.length === 0) {
        console.log(`[VideoDeletionService] No objects found with prefix: ${prefix}`);
        return;
      }

      // Delete all objects
      const deleteCommand = new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: {
          Objects: listResult.Contents.map((obj) => ({ Key: obj.Key })),
        },
      });

      await s3.send(deleteCommand);
      console.log(`[VideoDeletionService] Deleted ${listResult.Contents.length} media files`);
    } catch (error) {
      console.error('[VideoDeletionService] Failed to delete media files:', error);
      // Don't throw - media deletion failure shouldn't block the deletion
    }
  }

  /**
   * Emit deletion event to federation relay
   */
  private async emitDeletionToRelay(
    authorDid: string,
    videoUri: string,
    videoCid: string
  ): Promise<void> {
    if (!isRelayEnabled()) return;

    try {
      // Extract rkey from URI (format: at://did/collection/rkey)
      const parts = videoUri.split('/');
      const rkey = parts[parts.length - 1] || '';

      await emitCommitToRelay(authorDid, {
        rev: new Date().toISOString(),
        operation: 'delete',
        collection: 'io.exprsn.video.post',
        rkey,
        cid: videoCid,
      });
    } catch (error) {
      console.error('[VideoDeletionService] Failed to emit to relay:', error);
      // Don't throw - relay failure shouldn't block the deletion
    }
  }

  /**
   * Decrement author's video count
   */
  private async decrementAuthorVideoCount(authorDid: string): Promise<void> {
    try {
      await db
        .update(users)
        .set({
          videoCount: db.$count(videos, and(
            eq(videos.authorDid, authorDid),
            eq(videos.deletedAt, null as unknown as Date)
          )),
        })
        .where(eq(users.did, authorDid));
    } catch (error) {
      console.error('[VideoDeletionService] Failed to update video count:', error);
    }
  }

  /**
   * Increment author's video count (for restores)
   */
  private async incrementAuthorVideoCount(authorDid: string): Promise<void> {
    try {
      await db
        .update(users)
        .set({
          videoCount: db.$count(videos, and(
            eq(videos.authorDid, authorDid),
            eq(videos.deletedAt, null as unknown as Date)
          )),
        })
        .where(eq(users.did, authorDid));
    } catch (error) {
      console.error('[VideoDeletionService] Failed to update video count:', error);
    }
  }
}

// Singleton instance
let videoDeletionService: VideoDeletionService | null = null;

export function getVideoDeletionService(): VideoDeletionService {
  if (!videoDeletionService) {
    videoDeletionService = new VideoDeletionService();
  }
  return videoDeletionService;
}

export default VideoDeletionService;
