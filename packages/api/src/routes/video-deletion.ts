/**
 * Video Deletion Routes
 * Handles video deletion at multiple permission levels
 */

import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { authMiddleware } from '../auth/middleware.js';
import {
  adminAuthMiddleware,
  requirePermission,
  superAdminMiddleware,
  ADMIN_PERMISSIONS,
} from '../auth/middleware.js';
import { getVideoDeletionService } from '../services/video/VideoDeletionService.js';
import { uploadService } from '../services/upload.js';

export const videoDeletionRouter = new Hono();

// =============================================================================
// User Video Deletion (Own Videos)
// =============================================================================

/**
 * Delete own video (soft delete)
 * POST /xrpc/io.exprsn.video.delete
 */
videoDeletionRouter.post('/io.exprsn.video.delete', authMiddleware, async (c) => {
  const userDid = c.get('did');
  const body = await c.req.json<{
    videoUri: string;
    reason?: string;
  }>();

  if (!body.videoUri) {
    throw new HTTPException(400, { message: 'videoUri is required' });
  }

  const deletionService = getVideoDeletionService();
  const result = await deletionService.deleteOwnVideo(body.videoUri, userDid, body.reason);

  if (!result.success) {
    throw new HTTPException(400, { message: result.error });
  }

  return c.json({
    success: true,
    deletionId: result.deletionId,
  });
});

/**
 * Get user's deleted videos
 * GET /xrpc/io.exprsn.video.getDeleted
 */
videoDeletionRouter.get('/io.exprsn.video.getDeleted', authMiddleware, async (c) => {
  const userDid = c.get('did');
  const limit = Math.min(parseInt(c.req.query('limit') || '20', 10), 50);
  const cursor = c.req.query('cursor');

  const deletionService = getVideoDeletionService();
  const result = await deletionService.getUserDeletedVideos(userDid, limit, cursor);

  return c.json(result);
});

// =============================================================================
// Domain Moderator Video Deletion
// =============================================================================

/**
 * Delete video as domain moderator
 * POST /xrpc/io.exprsn.domain.moderateVideo
 */
videoDeletionRouter.post('/io.exprsn.domain.moderateVideo', authMiddleware, async (c) => {
  const moderatorDid = c.get('did');
  const body = await c.req.json<{
    videoUri: string;
    domainId: string;
    action: 'delete' | 'warn' | 'restrict';
    reason: string;
  }>();

  if (!body.videoUri || !body.domainId || !body.action || !body.reason) {
    throw new HTTPException(400, { message: 'videoUri, domainId, action, and reason are required' });
  }

  if (body.action !== 'delete') {
    throw new HTTPException(400, { message: 'Only delete action is supported in this endpoint' });
  }

  const deletionService = getVideoDeletionService();
  const result = await deletionService.deleteAsDomainModerator(
    body.videoUri,
    moderatorDid,
    body.domainId,
    body.reason
  );

  if (!result.success) {
    throw new HTTPException(403, { message: result.error });
  }

  return c.json({
    success: true,
    deletionId: result.deletionId,
  });
});

// =============================================================================
// Admin Video Deletion
// =============================================================================

/**
 * Soft delete any video (admin)
 * POST /xrpc/io.exprsn.admin.content.delete
 */
videoDeletionRouter.post(
  '/io.exprsn.admin.content.delete',
  adminAuthMiddleware,
  requirePermission(ADMIN_PERMISSIONS.CONTENT_MODERATE),
  async (c) => {
    const adminUser = c.get('adminUser');
    const body = await c.req.json<{
      videoUri: string;
      reason: string;
    }>();

    if (!body.videoUri || !body.reason) {
      throw new HTTPException(400, { message: 'videoUri and reason are required' });
    }

    const deletionService = getVideoDeletionService();
    const result = await deletionService.deleteAsAdmin(body.videoUri, adminUser.id, body.reason);

    if (!result.success) {
      throw new HTTPException(400, { message: result.error });
    }

    return c.json({
      success: true,
      deletionId: result.deletionId,
    });
  }
);

/**
 * Hard delete video (super admin only)
 * Permanently removes video and all media files
 * POST /xrpc/io.exprsn.admin.content.hardDelete
 */
videoDeletionRouter.post(
  '/io.exprsn.admin.content.hardDelete',
  adminAuthMiddleware,
  superAdminMiddleware,
  async (c) => {
    const adminUser = c.get('adminUser');
    const body = await c.req.json<{
      videoUri: string;
      reason: string;
      confirmPermanent: boolean;
    }>();

    if (!body.videoUri || !body.reason) {
      throw new HTTPException(400, { message: 'videoUri and reason are required' });
    }

    if (!body.confirmPermanent) {
      throw new HTTPException(400, {
        message: 'Must confirm permanent deletion with confirmPermanent: true',
      });
    }

    const deletionService = getVideoDeletionService();
    const result = await deletionService.hardDelete(body.videoUri, adminUser.id, body.reason);

    if (!result.success) {
      throw new HTTPException(400, { message: result.error });
    }

    return c.json({
      success: true,
      deletionId: result.deletionId,
      permanent: true,
    });
  }
);

/**
 * Restore a soft-deleted video (admin)
 * POST /xrpc/io.exprsn.admin.content.restore
 */
videoDeletionRouter.post(
  '/io.exprsn.admin.content.restore',
  adminAuthMiddleware,
  requirePermission(ADMIN_PERMISSIONS.CONTENT_MODERATE),
  async (c) => {
    const adminUser = c.get('adminUser');
    const body = await c.req.json<{
      videoUri: string;
    }>();

    if (!body.videoUri) {
      throw new HTTPException(400, { message: 'videoUri is required' });
    }

    const deletionService = getVideoDeletionService();
    const result = await deletionService.restoreVideo(body.videoUri, adminUser.id);

    if (!result.success) {
      throw new HTTPException(400, { message: result.error });
    }

    return c.json({
      success: true,
      videoUri: result.videoUri,
    });
  }
);

/**
 * Get deletion history for a video (admin)
 * GET /xrpc/io.exprsn.admin.content.getDeletionHistory
 */
videoDeletionRouter.get(
  '/io.exprsn.admin.content.getDeletionHistory',
  adminAuthMiddleware,
  requirePermission(ADMIN_PERMISSIONS.CONTENT_VIEW),
  async (c) => {
    const videoUri = c.req.query('videoUri');

    if (!videoUri) {
      throw new HTTPException(400, { message: 'videoUri query parameter is required' });
    }

    const deletionService = getVideoDeletionService();
    const history = await deletionService.getDeletionHistory(videoUri);

    return c.json({ history });
  }
);

// =============================================================================
// Upload Retry Routes
// =============================================================================

/**
 * Retry a failed upload
 * POST /xrpc/io.exprsn.upload.retry
 */
videoDeletionRouter.post('/io.exprsn.upload.retry', authMiddleware, async (c) => {
  const userDid = c.get('did');
  const body = await c.req.json<{
    uploadId: string;
  }>();

  if (!body.uploadId) {
    throw new HTTPException(400, { message: 'uploadId is required' });
  }

  const result = await uploadService.retryUpload(body.uploadId, userDid);

  if (!result.success) {
    throw new HTTPException(400, { message: result.error });
  }

  return c.json({ success: true });
});

/**
 * Get retry information for an upload
 * GET /xrpc/io.exprsn.upload.getRetryInfo
 */
videoDeletionRouter.get('/io.exprsn.upload.getRetryInfo', authMiddleware, async (c) => {
  const uploadId = c.req.query('uploadId');

  if (!uploadId) {
    throw new HTTPException(400, { message: 'uploadId query parameter is required' });
  }

  const info = await uploadService.getRetryInfo(uploadId);

  if (!info) {
    throw new HTTPException(404, { message: 'Upload not found' });
  }

  return c.json(info);
});

/**
 * Get user's failed uploads
 * GET /xrpc/io.exprsn.upload.getFailedUploads
 */
videoDeletionRouter.get('/io.exprsn.upload.getFailedUploads', authMiddleware, async (c) => {
  const userDid = c.get('did');
  const limit = Math.min(parseInt(c.req.query('limit') || '10', 10), 50);

  const uploads = await uploadService.getUserFailedUploads(userDid, limit);

  return c.json({ uploads });
});

/**
 * Force retry an upload (admin only)
 * POST /xrpc/io.exprsn.admin.upload.forceRetry
 */
videoDeletionRouter.post(
  '/io.exprsn.admin.upload.forceRetry',
  adminAuthMiddleware,
  requirePermission(ADMIN_PERMISSIONS.CONTENT_MODERATE),
  async (c) => {
    const adminUser = c.get('adminUser');
    const body = await c.req.json<{
      uploadId: string;
    }>();

    if (!body.uploadId) {
      throw new HTTPException(400, { message: 'uploadId is required' });
    }

    const result = await uploadService.forceRetry(body.uploadId, adminUser.id);

    if (!result.success) {
      throw new HTTPException(400, { message: result.error });
    }

    return c.json({ success: true });
  }
);

export default videoDeletionRouter;
