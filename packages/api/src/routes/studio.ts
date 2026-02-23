/**
 * Studio Routes
 * Video export, rendering, and publishing workflow
 */

import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { authMiddleware } from '../auth/middleware.js';
import { getRenderService, getPublishingService } from '../services/studio/index.js';

export const studioRouter = new Hono();

// =============================================================================
// Render Job Endpoints
// =============================================================================

/**
 * Create a render job from an editor project
 * POST /xrpc/io.exprsn.studio.createRenderJob
 */
studioRouter.post('/io.exprsn.studio.createRenderJob', authMiddleware, async (c) => {
  const { projectId, format, quality, resolution } = await c.req.json();
  const userDid = c.get('did');

  if (!projectId) {
    throw new HTTPException(400, { message: 'Project ID is required' });
  }

  const renderService = getRenderService();
  const jobId = await renderService.createRenderJob({
    projectId,
    userDid,
    format: format || 'mp4',
    quality: quality || 'high',
    resolution,
  });

  return c.json({
    success: true,
    jobId,
  });
});

/**
 * Get render job status
 * GET /xrpc/io.exprsn.studio.getRenderStatus
 */
studioRouter.get('/io.exprsn.studio.getRenderStatus', authMiddleware, async (c) => {
  const jobId = c.req.query('jobId');
  const userDid = c.get('did');

  if (!jobId) {
    throw new HTTPException(400, { message: 'Job ID is required' });
  }

  const renderService = getRenderService();
  const status = await renderService.getJobStatus(jobId);

  if (!status) {
    throw new HTTPException(404, { message: 'Render job not found' });
  }

  return c.json(status);
});

/**
 * Get user's render jobs
 * GET /xrpc/io.exprsn.studio.listRenderJobs
 */
studioRouter.get('/io.exprsn.studio.listRenderJobs', authMiddleware, async (c) => {
  const userDid = c.get('did');
  const projectId = c.req.query('projectId');
  const status = c.req.query('status');
  const limit = Math.min(parseInt(c.req.query('limit') || '20', 10), 100);

  const renderService = getRenderService();
  const jobs = await renderService.getUserJobs(userDid, { projectId, status, limit });

  return c.json({ jobs });
});

/**
 * Cancel a render job
 * POST /xrpc/io.exprsn.studio.cancelRenderJob
 */
studioRouter.post('/io.exprsn.studio.cancelRenderJob', authMiddleware, async (c) => {
  const { jobId } = await c.req.json();
  const userDid = c.get('did');

  if (!jobId) {
    throw new HTTPException(400, { message: 'Job ID is required' });
  }

  const renderService = getRenderService();
  const cancelled = await renderService.cancelJob(jobId, userDid);

  if (!cancelled) {
    throw new HTTPException(400, { message: 'Unable to cancel job' });
  }

  return c.json({ success: true });
});

/**
 * Retry a failed render job
 * POST /xrpc/io.exprsn.studio.retryRenderJob
 */
studioRouter.post('/io.exprsn.studio.retryRenderJob', authMiddleware, async (c) => {
  const { jobId } = await c.req.json();
  const userDid = c.get('did');

  if (!jobId) {
    throw new HTTPException(400, { message: 'Job ID is required' });
  }

  const renderService = getRenderService();
  const newJobId = await renderService.retryJob(jobId, userDid);

  if (!newJobId) {
    throw new HTTPException(400, { message: 'Unable to retry job' });
  }

  return c.json({
    success: true,
    jobId: newJobId,
  });
});

// =============================================================================
// Publishing Endpoints
// =============================================================================

/**
 * Create a publishing record (draft or scheduled)
 * POST /xrpc/io.exprsn.studio.createPublishing
 */
studioRouter.post('/io.exprsn.studio.createPublishing', authMiddleware, async (c) => {
  const {
    renderJobId,
    uploadJobId,
    videoUrl,
    caption,
    tags,
    thumbnailUrl,
    customThumbnailKey,
    visibility,
    allowComments,
    allowDuet,
    allowStitch,
    soundUri,
    soundTitle,
    scheduledFor,
    timezone,
  } = await c.req.json();
  const userDid = c.get('did');

  if (!renderJobId && !uploadJobId && !videoUrl) {
    throw new HTTPException(400, { message: 'Video source required (renderJobId, uploadJobId, or videoUrl)' });
  }

  const publishingService = getPublishingService();
  const result = await publishingService.createPublishing({
    userDid,
    renderJobId,
    uploadJobId,
    videoUrl,
    caption,
    tags,
    thumbnailUrl,
    customThumbnailKey,
    visibility,
    allowComments,
    allowDuet,
    allowStitch,
    soundUri,
    soundTitle,
    scheduledFor: scheduledFor ? new Date(scheduledFor) : undefined,
    timezone,
  });

  if (!result.success) {
    throw new HTTPException(400, { message: result.error || 'Failed to create publishing' });
  }

  return c.json(result);
});

/**
 * Publish a video immediately
 * POST /xrpc/io.exprsn.studio.publishNow
 */
studioRouter.post('/io.exprsn.studio.publishNow', authMiddleware, async (c) => {
  const { publishingId } = await c.req.json();
  const userDid = c.get('did');

  if (!publishingId) {
    throw new HTTPException(400, { message: 'Publishing ID is required' });
  }

  const publishingService = getPublishingService();
  const result = await publishingService.publishNow(publishingId, userDid);

  if (!result.success) {
    throw new HTTPException(400, { message: result.error || 'Failed to publish' });
  }

  return c.json(result);
});

/**
 * Get publishing record
 * GET /xrpc/io.exprsn.studio.getPublishing
 */
studioRouter.get('/io.exprsn.studio.getPublishing', authMiddleware, async (c) => {
  const publishingId = c.req.query('publishingId');
  const userDid = c.get('did');

  if (!publishingId) {
    throw new HTTPException(400, { message: 'Publishing ID is required' });
  }

  const publishingService = getPublishingService();
  const publishing = await publishingService.getPublishing(publishingId, userDid);

  if (!publishing) {
    throw new HTTPException(404, { message: 'Publishing record not found' });
  }

  return c.json(publishing);
});

/**
 * Get user's publishing records
 * GET /xrpc/io.exprsn.studio.listPublishing
 */
studioRouter.get('/io.exprsn.studio.listPublishing', authMiddleware, async (c) => {
  const userDid = c.get('did');
  const status = c.req.query('status');
  const limit = Math.min(parseInt(c.req.query('limit') || '20', 10), 100);

  const publishingService = getPublishingService();
  const records = await publishingService.getUserPublishing(userDid, status, limit);

  return c.json({ publishing: records });
});

/**
 * Update publishing record
 * POST /xrpc/io.exprsn.studio.updatePublishing
 */
studioRouter.post('/io.exprsn.studio.updatePublishing', authMiddleware, async (c) => {
  const {
    publishingId,
    caption,
    tags,
    thumbnailUrl,
    visibility,
    allowComments,
    allowDuet,
    allowStitch,
    soundUri,
    soundTitle,
    scheduledFor,
    timezone,
  } = await c.req.json();
  const userDid = c.get('did');

  if (!publishingId) {
    throw new HTTPException(400, { message: 'Publishing ID is required' });
  }

  const publishingService = getPublishingService();
  const result = await publishingService.updatePublishing(publishingId, userDid, {
    caption,
    tags,
    thumbnailUrl,
    visibility,
    allowComments,
    allowDuet,
    allowStitch,
    soundUri,
    soundTitle,
    scheduledFor: scheduledFor ? new Date(scheduledFor) : undefined,
    timezone,
  });

  if (!result.success) {
    throw new HTTPException(400, { message: result.error || 'Failed to update publishing' });
  }

  return c.json({ success: true });
});

/**
 * Cancel scheduled publishing
 * POST /xrpc/io.exprsn.studio.cancelPublishing
 */
studioRouter.post('/io.exprsn.studio.cancelPublishing', authMiddleware, async (c) => {
  const { publishingId } = await c.req.json();
  const userDid = c.get('did');

  if (!publishingId) {
    throw new HTTPException(400, { message: 'Publishing ID is required' });
  }

  const publishingService = getPublishingService();
  const result = await publishingService.cancelPublishing(publishingId, userDid);

  if (!result.success) {
    throw new HTTPException(400, { message: result.error || 'Failed to cancel publishing' });
  }

  return c.json({ success: true });
});

/**
 * Delete publishing record
 * POST /xrpc/io.exprsn.studio.deletePublishing
 */
studioRouter.post('/io.exprsn.studio.deletePublishing', authMiddleware, async (c) => {
  const { publishingId } = await c.req.json();
  const userDid = c.get('did');

  if (!publishingId) {
    throw new HTTPException(400, { message: 'Publishing ID is required' });
  }

  const publishingService = getPublishingService();
  const result = await publishingService.deletePublishing(publishingId, userDid);

  if (!result.success) {
    throw new HTTPException(400, { message: result.error || 'Failed to delete publishing' });
  }

  return c.json({ success: true });
});

/**
 * Get scheduling summary
 * GET /xrpc/io.exprsn.studio.getSchedulingSummary
 */
studioRouter.get('/io.exprsn.studio.getSchedulingSummary', authMiddleware, async (c) => {
  const userDid = c.get('did');

  const publishingService = getPublishingService();
  const summary = await publishingService.getSchedulingSummary(userDid);

  return c.json(summary);
});
