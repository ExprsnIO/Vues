/**
 * Studio Routes
 * Video export, rendering, and publishing workflow
 */

import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { authMiddleware } from '../auth/middleware.js';
import {
  getRenderService,
  getPublishingService,
  getEditorService,
  getEffectsService,
  EFFECT_DEFINITIONS,
} from '../services/studio/index.js';

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

// =============================================================================
// Editor Project Endpoints
// =============================================================================

/**
 * Create a new editor project
 * POST /xrpc/io.exprsn.studio.createProject
 */
studioRouter.post('/io.exprsn.studio.createProject', authMiddleware, async (c) => {
  const { name, settings } = await c.req.json();
  const userDid = c.get('did');

  if (!name) {
    throw new HTTPException(400, { message: 'Project name is required' });
  }

  const editorService = getEditorService();
  const projectId = await editorService.createProject(userDid, name, settings);

  return c.json({ success: true, projectId });
});

/**
 * Get an editor project
 * GET /xrpc/io.exprsn.studio.getProject
 */
studioRouter.get('/io.exprsn.studio.getProject', authMiddleware, async (c) => {
  const projectId = c.req.query('projectId');
  const userDid = c.get('did');

  if (!projectId) {
    throw new HTTPException(400, { message: 'Project ID is required' });
  }

  const editorService = getEditorService();
  const project = await editorService.getProject(projectId);

  if (!project) {
    throw new HTTPException(404, { message: 'Project not found' });
  }

  if (project.ownerDid !== userDid) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  return c.json({ project });
});

/**
 * Get user's editor projects
 * GET /xrpc/io.exprsn.studio.listProjects
 */
studioRouter.get('/io.exprsn.studio.listProjects', authMiddleware, async (c) => {
  const userDid = c.get('did');
  const limit = Math.min(parseInt(c.req.query('limit') || '20', 10), 100);
  const cursor = c.req.query('cursor');

  const editorService = getEditorService();
  const projects = await editorService.getUserProjects(userDid, limit, cursor);

  return c.json({ projects });
});

/**
 * Duplicate a project
 * POST /xrpc/io.exprsn.studio.duplicateProject
 */
studioRouter.post('/io.exprsn.studio.duplicateProject', authMiddleware, async (c) => {
  const { projectId, newName } = await c.req.json();
  const userDid = c.get('did');

  if (!projectId) {
    throw new HTTPException(400, { message: 'Project ID is required' });
  }

  const editorService = getEditorService();
  const project = await editorService.getProject(projectId);

  if (!project || project.ownerDid !== userDid) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const newProject = await editorService.duplicateProject(projectId, newName);

  return c.json({ success: true, project: newProject });
});

/**
 * Update project settings
 * POST /xrpc/io.exprsn.studio.updateProjectSettings
 */
studioRouter.post('/io.exprsn.studio.updateProjectSettings', authMiddleware, async (c) => {
  const { projectId, settings } = await c.req.json();
  const userDid = c.get('did');

  if (!projectId) {
    throw new HTTPException(400, { message: 'Project ID is required' });
  }

  const editorService = getEditorService();
  const project = await editorService.getProject(projectId);

  if (!project || project.ownerDid !== userDid) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  await editorService.updateProjectSettings(projectId, settings);

  return c.json({ success: true });
});

/**
 * Delete a project
 * POST /xrpc/io.exprsn.studio.deleteProject
 */
studioRouter.post('/io.exprsn.studio.deleteProject', authMiddleware, async (c) => {
  const { projectId } = await c.req.json();
  const userDid = c.get('did');

  if (!projectId) {
    throw new HTTPException(400, { message: 'Project ID is required' });
  }

  const editorService = getEditorService();
  const project = await editorService.getProject(projectId);

  if (!project || project.ownerDid !== userDid) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  await editorService.deleteProject(projectId);

  return c.json({ success: true });
});

// =============================================================================
// Track Endpoints
// =============================================================================

/**
 * Create a track
 * POST /xrpc/io.exprsn.studio.createTrack
 */
studioRouter.post('/io.exprsn.studio.createTrack', authMiddleware, async (c) => {
  const { projectId, name, type } = await c.req.json();
  const userDid = c.get('did');

  if (!projectId || !type) {
    throw new HTTPException(400, { message: 'Project ID and track type are required' });
  }

  const editorService = getEditorService();
  const project = await editorService.getProject(projectId);

  if (!project || project.ownerDid !== userDid) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const track = await editorService.createTrack(projectId, name, type);

  return c.json({ success: true, track });
});

/**
 * Update a track
 * POST /xrpc/io.exprsn.studio.updateTrack
 */
studioRouter.post('/io.exprsn.studio.updateTrack', authMiddleware, async (c) => {
  const { trackId, name, locked, muted, visible, volume, solo } = await c.req.json();
  const userDid = c.get('did');

  if (!trackId) {
    throw new HTTPException(400, { message: 'Track ID is required' });
  }

  const editorService = getEditorService();
  // Verify ownership via track's project
  const track = await editorService.getTrack(trackId);
  if (!track) {
    throw new HTTPException(404, { message: 'Track not found' });
  }

  const project = await editorService.getProject(track.projectId);
  if (!project || project.ownerDid !== userDid) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  await editorService.updateTrack(trackId, { name, locked, muted, visible, volume, solo });

  return c.json({ success: true });
});

/**
 * Reorder tracks
 * POST /xrpc/io.exprsn.studio.reorderTracks
 */
studioRouter.post('/io.exprsn.studio.reorderTracks', authMiddleware, async (c) => {
  const { projectId, trackIds } = await c.req.json();
  const userDid = c.get('did');

  if (!projectId || !trackIds || !Array.isArray(trackIds)) {
    throw new HTTPException(400, { message: 'Project ID and track IDs array are required' });
  }

  const editorService = getEditorService();
  const project = await editorService.getProject(projectId);

  if (!project || project.ownerDid !== userDid) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  await editorService.reorderTracks(projectId, trackIds);

  return c.json({ success: true });
});

/**
 * Delete a track
 * POST /xrpc/io.exprsn.studio.deleteTrack
 */
studioRouter.post('/io.exprsn.studio.deleteTrack', authMiddleware, async (c) => {
  const { trackId } = await c.req.json();
  const userDid = c.get('did');

  if (!trackId) {
    throw new HTTPException(400, { message: 'Track ID is required' });
  }

  const editorService = getEditorService();
  const track = await editorService.getTrack(trackId);
  if (!track) {
    throw new HTTPException(404, { message: 'Track not found' });
  }

  const project = await editorService.getProject(track.projectId);
  if (!project || project.ownerDid !== userDid) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  await editorService.deleteTrack(trackId);

  return c.json({ success: true });
});

// =============================================================================
// Clip Endpoints
// =============================================================================

/**
 * Add a clip to a track
 * POST /xrpc/io.exprsn.studio.addClip
 */
studioRouter.post('/io.exprsn.studio.addClip', authMiddleware, async (c) => {
  const { trackId, clipData } = await c.req.json();
  const userDid = c.get('did');

  if (!trackId || !clipData) {
    throw new HTTPException(400, { message: 'Track ID and clip data are required' });
  }

  const editorService = getEditorService();
  const track = await editorService.getTrack(trackId);
  if (!track) {
    throw new HTTPException(404, { message: 'Track not found' });
  }

  const project = await editorService.getProject(track.projectId);
  if (!project || project.ownerDid !== userDid) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const clipId = await editorService.addClip(track.projectId, trackId, clipData);

  return c.json({ success: true, clipId });
});

/**
 * Update a clip
 * POST /xrpc/io.exprsn.studio.updateClip
 */
studioRouter.post('/io.exprsn.studio.updateClip', authMiddleware, async (c) => {
  const { clipId, updates } = await c.req.json();
  const userDid = c.get('did');

  if (!clipId || !updates) {
    throw new HTTPException(400, { message: 'Clip ID and updates are required' });
  }

  const editorService = getEditorService();
  const clip = await editorService.getClip(clipId);
  if (!clip) {
    throw new HTTPException(404, { message: 'Clip not found' });
  }

  const project = await editorService.getProject(clip.projectId);
  if (!project || project.ownerDid !== userDid) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  await editorService.updateClip(clipId, updates);

  return c.json({ success: true });
});

/**
 * Move a clip
 * POST /xrpc/io.exprsn.studio.moveClip
 */
studioRouter.post('/io.exprsn.studio.moveClip', authMiddleware, async (c) => {
  const { clipId, newTrackId, newStartFrame } = await c.req.json();
  const userDid = c.get('did');

  if (!clipId || newStartFrame === undefined) {
    throw new HTTPException(400, { message: 'Clip ID and new start frame are required' });
  }

  const editorService = getEditorService();
  const clip = await editorService.getClip(clipId);
  if (!clip) {
    throw new HTTPException(404, { message: 'Clip not found' });
  }

  const project = await editorService.getProject(clip.projectId);
  if (!project || project.ownerDid !== userDid) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  await editorService.moveClip(clipId, { trackId: newTrackId, startFrame: newStartFrame });

  return c.json({ success: true });
});

/**
 * Trim a clip
 * POST /xrpc/io.exprsn.studio.trimClip
 */
studioRouter.post('/io.exprsn.studio.trimClip', authMiddleware, async (c) => {
  const { clipId, newStartFrame, newEndFrame } = await c.req.json();
  const userDid = c.get('did');

  if (!clipId) {
    throw new HTTPException(400, { message: 'Clip ID is required' });
  }

  const editorService = getEditorService();
  const clip = await editorService.getClip(clipId);
  if (!clip) {
    throw new HTTPException(404, { message: 'Clip not found' });
  }

  const project = await editorService.getProject(clip.projectId);
  if (!project || project.ownerDid !== userDid) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  await editorService.trimClip(clipId, { newStartFrame, newEndFrame });

  return c.json({ success: true });
});

/**
 * Split a clip at a specific frame
 * POST /xrpc/io.exprsn.studio.splitClip
 */
studioRouter.post('/io.exprsn.studio.splitClip', authMiddleware, async (c) => {
  const { clipId, splitFrame } = await c.req.json();
  const userDid = c.get('did');

  if (!clipId || splitFrame === undefined) {
    throw new HTTPException(400, { message: 'Clip ID and split frame are required' });
  }

  const editorService = getEditorService();
  const clip = await editorService.getClip(clipId);
  if (!clip) {
    throw new HTTPException(404, { message: 'Clip not found' });
  }

  const project = await editorService.getProject(clip.projectId);
  if (!project || project.ownerDid !== userDid) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const result = await editorService.splitClip(clipId, splitFrame);

  return c.json({ success: true, ...result });
});

/**
 * Duplicate a clip
 * POST /xrpc/io.exprsn.studio.duplicateClip
 */
studioRouter.post('/io.exprsn.studio.duplicateClip', authMiddleware, async (c) => {
  const { clipId, targetTrackId, startFrame } = await c.req.json();
  const userDid = c.get('did');

  if (!clipId) {
    throw new HTTPException(400, { message: 'Clip ID is required' });
  }

  const editorService = getEditorService();
  const clip = await editorService.getClip(clipId);
  if (!clip) {
    throw new HTTPException(404, { message: 'Clip not found' });
  }

  const project = await editorService.getProject(clip.projectId);
  if (!project || project.ownerDid !== userDid) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const newClipId = await editorService.duplicateClip(clipId, startFrame || 0);

  return c.json({ success: true, clipId: newClipId });
});

/**
 * Delete a clip
 * POST /xrpc/io.exprsn.studio.deleteClip
 */
studioRouter.post('/io.exprsn.studio.deleteClip', authMiddleware, async (c) => {
  const { clipId } = await c.req.json();
  const userDid = c.get('did');

  if (!clipId) {
    throw new HTTPException(400, { message: 'Clip ID is required' });
  }

  const editorService = getEditorService();
  const clip = await editorService.getClip(clipId);
  if (!clip) {
    throw new HTTPException(404, { message: 'Clip not found' });
  }

  const project = await editorService.getProject(clip.projectId);
  if (!project || project.ownerDid !== userDid) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  await editorService.deleteClip(clipId);

  return c.json({ success: true });
});

/**
 * Set clip speed
 * POST /xrpc/io.exprsn.studio.setClipSpeed
 */
studioRouter.post('/io.exprsn.studio.setClipSpeed', authMiddleware, async (c) => {
  const { clipId, speed } = await c.req.json();
  const userDid = c.get('did');

  if (!clipId || speed === undefined) {
    throw new HTTPException(400, { message: 'Clip ID and speed are required' });
  }

  const editorService = getEditorService();
  const clip = await editorService.getClip(clipId);
  if (!clip) {
    throw new HTTPException(404, { message: 'Clip not found' });
  }

  const project = await editorService.getProject(clip.projectId);
  if (!project || project.ownerDid !== userDid) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  await editorService.setClipSpeed(clipId, speed);

  return c.json({ success: true });
});

/**
 * Set clip loop
 * POST /xrpc/io.exprsn.studio.setClipLoop
 */
studioRouter.post('/io.exprsn.studio.setClipLoop', authMiddleware, async (c) => {
  const { clipId, loop, loopCount } = await c.req.json();
  const userDid = c.get('did');

  if (!clipId || loop === undefined) {
    throw new HTTPException(400, { message: 'Clip ID and loop setting are required' });
  }

  const editorService = getEditorService();
  const clip = await editorService.getClip(clipId);
  if (!clip) {
    throw new HTTPException(404, { message: 'Clip not found' });
  }

  const project = await editorService.getProject(clip.projectId);
  if (!project || project.ownerDid !== userDid) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  await editorService.setClipLoop(clipId, loop, loopCount);

  return c.json({ success: true });
});

// =============================================================================
// Effects Endpoints
// =============================================================================

/**
 * Get all available effects
 * GET /xrpc/io.exprsn.studio.getEffects
 */
studioRouter.get('/io.exprsn.studio.getEffects', async (c) => {
  const category = c.req.query('category');

  const effects = category
    ? EFFECT_DEFINITIONS.filter((e) => e.category === category)
    : EFFECT_DEFINITIONS;

  return c.json({ effects });
});

/**
 * Add effect to a clip
 * POST /xrpc/io.exprsn.studio.addClipEffect
 */
studioRouter.post('/io.exprsn.studio.addClipEffect', authMiddleware, async (c) => {
  const { clipId, effectType, params } = await c.req.json();
  const userDid = c.get('did');

  if (!clipId || !effectType) {
    throw new HTTPException(400, { message: 'Clip ID and effect type are required' });
  }

  const editorService = getEditorService();
  const clip = await editorService.getClip(clipId);
  if (!clip) {
    throw new HTTPException(404, { message: 'Clip not found' });
  }

  const project = await editorService.getProject(clip.projectId);
  if (!project || project.ownerDid !== userDid) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const effectId = await editorService.addEffectToClip(clipId, { type: effectType, params });

  return c.json({ success: true, effectId });
});

/**
 * Update clip effect
 * POST /xrpc/io.exprsn.studio.updateClipEffect
 */
studioRouter.post('/io.exprsn.studio.updateClipEffect', authMiddleware, async (c) => {
  const { clipId, effectId, params, enabled } = await c.req.json();
  const userDid = c.get('did');

  if (!clipId || !effectId) {
    throw new HTTPException(400, { message: 'Clip ID and effect ID are required' });
  }

  const editorService = getEditorService();
  const clip = await editorService.getClip(clipId);
  if (!clip) {
    throw new HTTPException(404, { message: 'Clip not found' });
  }

  const project = await editorService.getProject(clip.projectId);
  if (!project || project.ownerDid !== userDid) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  await editorService.updateClipEffect(clipId, effectId, { params, enabled });

  return c.json({ success: true });
});

/**
 * Remove effect from a clip
 * POST /xrpc/io.exprsn.studio.removeClipEffect
 */
studioRouter.post('/io.exprsn.studio.removeClipEffect', authMiddleware, async (c) => {
  const { clipId, effectId } = await c.req.json();
  const userDid = c.get('did');

  if (!clipId || !effectId) {
    throw new HTTPException(400, { message: 'Clip ID and effect ID are required' });
  }

  const editorService = getEditorService();
  const clip = await editorService.getClip(clipId);
  if (!clip) {
    throw new HTTPException(404, { message: 'Clip not found' });
  }

  const project = await editorService.getProject(clip.projectId);
  if (!project || project.ownerDid !== userDid) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  await editorService.removeClipEffect(clipId, effectId);

  return c.json({ success: true });
});

/**
 * Reorder clip effects
 * POST /xrpc/io.exprsn.studio.reorderClipEffects
 */
studioRouter.post('/io.exprsn.studio.reorderClipEffects', authMiddleware, async (c) => {
  const { clipId, effectIds } = await c.req.json();
  const userDid = c.get('did');

  if (!clipId || !effectIds || !Array.isArray(effectIds)) {
    throw new HTTPException(400, { message: 'Clip ID and effect IDs array are required' });
  }

  const editorService = getEditorService();
  const clip = await editorService.getClip(clipId);
  if (!clip) {
    throw new HTTPException(404, { message: 'Clip not found' });
  }

  const project = await editorService.getProject(clip.projectId);
  if (!project || project.ownerDid !== userDid) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  await editorService.reorderClipEffects(clipId, effectIds);

  return c.json({ success: true });
});

/**
 * Generate filter chain preview
 * POST /xrpc/io.exprsn.studio.previewFilterChain
 */
studioRouter.post('/io.exprsn.studio.previewFilterChain', authMiddleware, async (c) => {
  const { effects } = await c.req.json();

  if (!effects || !Array.isArray(effects)) {
    throw new HTTPException(400, { message: 'Effects array is required' });
  }

  const effectsService = getEffectsService();
  const filterChain = effectsService.generateFilterChain(effects);

  return c.json({ filterChain });
});

// =============================================================================
// Transition Endpoints
// =============================================================================

/**
 * Get transition types
 * GET /xrpc/io.exprsn.studio.getTransitionTypes
 */
studioRouter.get('/io.exprsn.studio.getTransitionTypes', async (c) => {
  const editorService = getEditorService();
  const types = editorService.getTransitionTypes();

  return c.json({ types });
});

/**
 * Add a transition between clips
 * POST /xrpc/io.exprsn.studio.addTransition
 */
studioRouter.post('/io.exprsn.studio.addTransition', authMiddleware, async (c) => {
  const { projectId, clipAId, clipBId, type, duration, easing, params } = await c.req.json();
  const userDid = c.get('did');

  if (!projectId || !clipAId || !clipBId || !type) {
    throw new HTTPException(400, { message: 'Project ID, clip IDs, and transition type are required' });
  }

  const editorService = getEditorService();
  const project = await editorService.getProject(projectId);

  if (!project || project.ownerDid !== userDid) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  // Get trackId from clipA
  const clipA = await editorService.getClip(clipAId);
  if (!clipA) {
    throw new HTTPException(404, { message: 'Clip A not found' });
  }

  const transitionId = await editorService.addTransition(projectId, clipA.trackId, clipAId, clipBId, {
    type,
    duration,
    easing,
    params,
  });

  return c.json({ success: true, transitionId });
});

/**
 * Update a transition
 * POST /xrpc/io.exprsn.studio.updateTransition
 */
studioRouter.post('/io.exprsn.studio.updateTransition', authMiddleware, async (c) => {
  const { transitionId, updates } = await c.req.json();
  const userDid = c.get('did');

  if (!transitionId || !updates) {
    throw new HTTPException(400, { message: 'Transition ID and updates are required' });
  }

  const editorService = getEditorService();
  const transition = await editorService.getTransition(transitionId);
  if (!transition) {
    throw new HTTPException(404, { message: 'Transition not found' });
  }

  const project = await editorService.getProject(transition.projectId);
  if (!project || project.ownerDid !== userDid) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  await editorService.updateTransition(transitionId, updates);

  return c.json({ success: true });
});

/**
 * Delete a transition
 * POST /xrpc/io.exprsn.studio.deleteTransition
 */
studioRouter.post('/io.exprsn.studio.deleteTransition', authMiddleware, async (c) => {
  const { transitionId } = await c.req.json();
  const userDid = c.get('did');

  if (!transitionId) {
    throw new HTTPException(400, { message: 'Transition ID is required' });
  }

  const editorService = getEditorService();
  const transition = await editorService.getTransition(transitionId);
  if (!transition) {
    throw new HTTPException(404, { message: 'Transition not found' });
  }

  const project = await editorService.getProject(transition.projectId);
  if (!project || project.ownerDid !== userDid) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  await editorService.deleteTransition(transitionId);

  return c.json({ success: true });
});

// =============================================================================
// Keyframe Endpoints
// =============================================================================

/**
 * Get easing functions
 * GET /xrpc/io.exprsn.studio.getEasingFunctions
 */
studioRouter.get('/io.exprsn.studio.getEasingFunctions', async (c) => {
  const editorService = getEditorService();
  const easings = editorService.getEasingFunctions();

  return c.json({ easings });
});

/**
 * Add a keyframe
 * POST /xrpc/io.exprsn.studio.addKeyframe
 */
studioRouter.post('/io.exprsn.studio.addKeyframe', authMiddleware, async (c) => {
  const { clipId, property, frame, value, easing } = await c.req.json();
  const userDid = c.get('did');

  if (!clipId || !property || frame === undefined || value === undefined) {
    throw new HTTPException(400, { message: 'Clip ID, property, frame, and value are required' });
  }

  const editorService = getEditorService();
  const clip = await editorService.getClip(clipId);
  if (!clip) {
    throw new HTTPException(404, { message: 'Clip not found' });
  }

  const project = await editorService.getProject(clip.projectId);
  if (!project || project.ownerDid !== userDid) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  await editorService.addKeyframe(clipId, property, frame, value, easing);

  return c.json({ success: true });
});

/**
 * Remove a keyframe
 * POST /xrpc/io.exprsn.studio.removeKeyframe
 */
studioRouter.post('/io.exprsn.studio.removeKeyframe', authMiddleware, async (c) => {
  const { clipId, property, frame } = await c.req.json();
  const userDid = c.get('did');

  if (!clipId || !property || frame === undefined) {
    throw new HTTPException(400, { message: 'Clip ID, property, and frame are required' });
  }

  const editorService = getEditorService();
  const clip = await editorService.getClip(clipId);
  if (!clip) {
    throw new HTTPException(404, { message: 'Clip not found' });
  }

  const project = await editorService.getProject(clip.projectId);
  if (!project || project.ownerDid !== userDid) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  await editorService.removeKeyframe(clipId, property, frame);

  return c.json({ success: true });
});

// =============================================================================
// History Endpoints
// =============================================================================

/**
 * Get project history (for undo/redo)
 * GET /xrpc/io.exprsn.studio.getProjectHistory
 */
studioRouter.get('/io.exprsn.studio.getProjectHistory', authMiddleware, async (c) => {
  const projectId = c.req.query('projectId');
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 100);
  const userDid = c.get('did');

  if (!projectId) {
    throw new HTTPException(400, { message: 'Project ID is required' });
  }

  const editorService = getEditorService();
  const project = await editorService.getProject(projectId);

  if (!project || project.ownerDid !== userDid) {
    throw new HTTPException(403, { message: 'Access denied' });
  }

  const history = await editorService.getProjectHistory(projectId, limit);

  return c.json({ history });
});

// =============================================================================
// Assets & Templates Endpoints
// =============================================================================

/**
 * Get user's assets
 * GET /xrpc/io.exprsn.studio.getAssets
 */
studioRouter.get('/io.exprsn.studio.getAssets', authMiddleware, async (c) => {
  const userDid = c.get('did');
  const type = c.req.query('type');
  const projectId = c.req.query('projectId');
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 100);

  const editorService = getEditorService();
  const assets = await editorService.getUserAssets(userDid, { type, projectId, limit });

  return c.json({ assets });
});

/**
 * Get templates
 * GET /xrpc/io.exprsn.studio.getTemplates
 */
studioRouter.get('/io.exprsn.studio.getTemplates', async (c) => {
  const category = c.req.query('category');
  const aspectRatio = c.req.query('aspectRatio');
  const limit = Math.min(parseInt(c.req.query('limit') || '20', 10), 50);

  const editorService = getEditorService();
  const templates = await editorService.getTemplates({ category, aspectRatio, isPublic: true, limit });

  return c.json({ templates });
});

/**
 * Create project from template
 * POST /xrpc/io.exprsn.studio.createFromTemplate
 */
studioRouter.post('/io.exprsn.studio.createFromTemplate', authMiddleware, async (c) => {
  const { templateId, name } = await c.req.json();
  const userDid = c.get('did');

  if (!templateId) {
    throw new HTTPException(400, { message: 'Template ID is required' });
  }

  const editorService = getEditorService();
  const project = await editorService.createProjectFromTemplate(templateId, userDid, name);

  return c.json({ success: true, project });
});
