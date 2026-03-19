/**
 * Streaming API Routes
 *
 * Endpoints for adaptive streaming manifest delivery,
 * quality selection, and offline downloads.
 */

import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import * as schema from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { authMiddleware, optionalAuthMiddleware } from '../auth/middleware.js';
import {
  adaptiveTranscodeService,
  QUALITY_PRESETS,
  getBandwidthRequirement,
  getQualityForBandwidth,
  type QualityLevel,
} from '../services/streaming/index.js';
import { getSignedUrl, CDN_URL } from '../utils/s3.js';

const streamingRouter = new Hono();

/**
 * Get streaming manifest URLs for a video
 * Returns HLS and DASH manifest URLs along with available qualities
 */
streamingRouter.get('/manifest/:videoUri', optionalAuthMiddleware, async (c) => {
  const videoUriParam = c.req.param('videoUri');
  if (!videoUriParam) {
    return c.json({ error: 'videoUri is required' }, 400);
  }
  const videoUri = decodeURIComponent(videoUriParam);

  const [video] = await db
    .select({
      uri: schema.videos.uri,
      hlsMasterUrl: schema.videos.hlsMasterUrl,
      dashManifestUrl: schema.videos.dashManifestUrl,
      thumbnailSpriteUrl: schema.videos.thumbnailSpriteUrl,
      thumbnailVttUrl: schema.videos.thumbnailVttUrl,
      availableQualities: schema.videos.availableQualities,
      transcodeStatus: schema.videos.transcodeStatus,
      duration: schema.videos.duration,
    })
    .from(schema.videos)
    .where(eq(schema.videos.uri, videoUri))
    .limit(1);

  if (!video) {
    return c.json({ error: 'Video not found' }, 404);
  }

  if (video.transcodeStatus !== 'completed') {
    return c.json({
      error: 'Video not ready',
      status: video.transcodeStatus,
    }, 202);
  }

  // Get variant details
  const variants = await db
    .select()
    .from(schema.videoVariants)
    .where(eq(schema.videoVariants.videoUri, videoUri));

  const hlsVariants = variants
    .filter(v => v.format === 'hls')
    .map(v => ({
      quality: v.quality,
      width: v.width,
      height: v.height,
      bitrate: v.bitrate,
      bandwidth: getBandwidthRequirement(v.quality as QualityLevel),
      playlistUrl: v.playlistUrl,
    }));

  const dashVariants = variants
    .filter(v => v.format === 'dash')
    .map(v => ({
      quality: v.quality,
      width: v.width,
      height: v.height,
      bitrate: v.bitrate,
      bandwidth: getBandwidthRequirement(v.quality as QualityLevel),
    }));

  return c.json({
    videoUri: video.uri,
    duration: video.duration,
    hls: video.hlsMasterUrl ? {
      masterPlaylist: video.hlsMasterUrl,
      variants: hlsVariants,
    } : null,
    dash: video.dashManifestUrl ? {
      manifest: video.dashManifestUrl,
      variants: dashVariants,
    } : null,
    thumbnails: video.thumbnailSpriteUrl ? {
      sprite: video.thumbnailSpriteUrl,
      vtt: video.thumbnailVttUrl,
    } : null,
    availableQualities: video.availableQualities || [],
    defaultQuality: getDefaultQuality(video.availableQualities as QualityLevel[] || []),
  });
});

/**
 * Get quality levels with bandwidth requirements
 * Used by player for ABR decisions
 */
streamingRouter.get('/quality-levels/:videoUri', async (c) => {
  const videoUriParam = c.req.param('videoUri');
  if (!videoUriParam) {
    return c.json({ error: 'videoUri is required' }, 400);
  }
  const videoUri = decodeURIComponent(videoUriParam);

  const variants = await db
    .select({
      quality: schema.videoVariants.quality,
      width: schema.videoVariants.width,
      height: schema.videoVariants.height,
      bitrate: schema.videoVariants.bitrate,
      format: schema.videoVariants.format,
    })
    .from(schema.videoVariants)
    .where(
      and(
        eq(schema.videoVariants.videoUri, videoUri),
        eq(schema.videoVariants.format, 'hls')
      )
    );

  if (variants.length === 0) {
    return c.json({ error: 'No quality levels found' }, 404);
  }

  const levels = variants.map(v => ({
    quality: v.quality,
    width: v.width,
    height: v.height,
    bitrate: v.bitrate,
    bandwidth: getBandwidthRequirement(v.quality as QualityLevel),
    label: getQualityLabel(v.quality as QualityLevel),
  })).sort((a, b) => a.bandwidth - b.bandwidth);

  return c.json({ levels });
});

/**
 * Report client bandwidth metrics
 * Used for analytics and ABR optimization
 */
streamingRouter.post('/bandwidth-report', optionalAuthMiddleware, async (c) => {
  const userDid = c.get('did');
  const body = await c.req.json();

  const {
    videoUri,
    bandwidth,
    effectiveType,
    qualitySwitches,
    bufferingEvents,
    averageBitrate,
  } = body;

  // Log metrics (could be sent to analytics service)
  console.log('[StreamingMetrics]', {
    userDid,
    videoUri,
    bandwidth,
    effectiveType,
    qualitySwitches,
    bufferingEvents,
    averageBitrate,
    timestamp: new Date().toISOString(),
  });

  return c.json({ success: true });
});

/**
 * Get thumbnail sprite metadata
 */
streamingRouter.get('/thumbnails/:videoUri', async (c) => {
  const videoUriParam = c.req.param('videoUri');
  if (!videoUriParam) {
    return c.json({ error: 'videoUri is required' }, 400);
  }
  const videoUri = decodeURIComponent(videoUriParam);

  const [sprite] = await db
    .select()
    .from(schema.thumbnailSprites)
    .where(eq(schema.thumbnailSprites.videoUri, videoUri))
    .limit(1);

  if (!sprite) {
    // Fallback to video table
    const [video] = await db
      .select({
        thumbnailSpriteUrl: schema.videos.thumbnailSpriteUrl,
        thumbnailVttUrl: schema.videos.thumbnailVttUrl,
      })
      .from(schema.videos)
      .where(eq(schema.videos.uri, videoUri))
      .limit(1);

    if (!video?.thumbnailSpriteUrl) {
      return c.json({ error: 'Thumbnail sprites not found' }, 404);
    }

    return c.json({
      spriteUrl: video.thumbnailSpriteUrl,
      vttUrl: video.thumbnailVttUrl,
    });
  }

  return c.json({
    spriteUrl: sprite.spriteUrl,
    vttUrl: sprite.vttUrl,
    width: sprite.spriteWidth,
    height: sprite.spriteHeight,
    thumbnailWidth: sprite.thumbnailWidth,
    thumbnailHeight: sprite.thumbnailHeight,
    columns: sprite.columns,
    rows: sprite.rows,
    interval: sprite.interval,
    totalThumbnails: sprite.totalThumbnails,
  });
});

/**
 * Request offline download for a video
 * Generates signed URL valid for 24 hours
 */
streamingRouter.post('/download-request', authMiddleware, async (c) => {
  const userDid = c.get('did');
  const body = await c.req.json();
  const { videoUri, quality } = body;

  if (!videoUri || !quality) {
    return c.json({ error: 'videoUri and quality are required' }, 400);
  }

  // Check if quality is available for offline
  const [video] = await db
    .select({
      availableQualities: schema.videos.availableQualities,
    })
    .from(schema.videos)
    .where(eq(schema.videos.uri, videoUri))
    .limit(1);

  if (!video) {
    return c.json({ error: 'Video not found' }, 404);
  }

  // Get transcode job to find offline download URL
  const [transcodeJob] = await db
    .select({
      offlineDownloads: schema.transcodeJobs.offlineDownloads,
    })
    .from(schema.transcodeJobs)
    .where(eq(schema.transcodeJobs.videoUri, videoUri))
    .limit(1);

  const offlineUrl = transcodeJob?.offlineDownloads?.[quality];
  if (!offlineUrl) {
    return c.json({ error: 'Quality not available for download' }, 404);
  }

  // Generate signed URL with 24 hour expiry
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  // Create download record
  const downloadId = nanoid();
  await db.insert(schema.offlineDownloads).values({
    id: downloadId,
    videoUri,
    userDid,
    quality,
    downloadUrl: offlineUrl,
    fileSize: 0, // Would need to get from S3 metadata
    expiresAt,
  }).onConflictDoUpdate({
    target: [schema.offlineDownloads.videoUri, schema.offlineDownloads.userDid, schema.offlineDownloads.quality],
    set: {
      downloadUrl: offlineUrl,
      expiresAt,
    },
  });

  return c.json({
    downloadId,
    downloadUrl: offlineUrl,
    quality,
    expiresAt: expiresAt.toISOString(),
  });
});

/**
 * Get download status
 */
streamingRouter.get('/download-status/:downloadId', authMiddleware, async (c) => {
  const userDid = c.get('did');
  const downloadId = c.req.param('downloadId');

  if (!downloadId) {
    return c.json({ error: 'downloadId is required' }, 400);
  }

  const [download] = await db
    .select()
    .from(schema.offlineDownloads)
    .where(
      and(
        eq(schema.offlineDownloads.id, downloadId),
        eq(schema.offlineDownloads.userDid, userDid!)
      )
    )
    .limit(1);

  if (!download) {
    return c.json({ error: 'Download not found' }, 404);
  }

  const isExpired = new Date(download.expiresAt) < new Date();

  return c.json({
    id: download.id,
    videoUri: download.videoUri,
    quality: download.quality,
    downloadUrl: isExpired ? null : download.downloadUrl,
    fileSize: download.fileSize,
    expiresAt: download.expiresAt,
    downloadedAt: download.downloadedAt,
    isExpired,
  });
});

/**
 * Queue a new transcode job (admin only)
 */
streamingRouter.post('/transcode', authMiddleware, async (c) => {
  const userDid = c.get('did');
  const body = await c.req.json();

  const {
    videoUri,
    inputKey,
    targetQualities = ['360p', '480p', '720p', '1080p'],
    enableHls = true,
    enableDash = true,
    enableThumbnails = true,
    enableOffline = true,
    offlineQualities = ['360p', '720p'],
    priority = 'normal',
  } = body;

  if (!inputKey) {
    return c.json({ error: 'inputKey is required' }, 400);
  }

  const jobId = await adaptiveTranscodeService.queueTranscode({
    userDid,
    videoUri,
    inputKey,
    config: {
      targetQualities,
      enableHls,
      enableDash,
      enableThumbnails,
      enableOffline,
      offlineQualities,
      segmentDuration: 4,
      thumbnailInterval: 1,
    },
    priority,
  });

  return c.json({ jobId, status: 'queued' });
});

/**
 * Get transcode job status
 */
streamingRouter.get('/transcode/:jobId', authMiddleware, async (c) => {
  const jobId = c.req.param('jobId');

  if (!jobId) {
    return c.json({ error: 'jobId is required' }, 400);
  }

  const job = await adaptiveTranscodeService.getJobStatus(jobId);

  if (!job) {
    return c.json({ error: 'Job not found' }, 404);
  }

  return c.json({
    id: job.id,
    status: job.status,
    phase: job.phase,
    progress: job.progress,
    error: job.error,
    hlsMasterUrl: job.hlsMasterUrl,
    dashManifestUrl: job.dashManifestUrl,
    thumbnailSpriteUrl: job.thumbnailSpriteUrl,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
  });
});

/**
 * Get queue statistics (admin only)
 */
streamingRouter.get('/queue/stats', authMiddleware, async (c) => {
  const stats = await adaptiveTranscodeService.getQueueStats();
  return c.json(stats);
});

// Helper functions

function getDefaultQuality(availableQualities: QualityLevel[]): QualityLevel {
  // Prefer 720p if available, otherwise highest available
  if (availableQualities.includes('720p')) {
    return '720p';
  }
  return availableQualities[availableQualities.length - 1] || '360p';
}

function getQualityLabel(quality: QualityLevel): string {
  const labels: Record<QualityLevel, string> = {
    '360p': '360p (SD)',
    '480p': '480p (SD)',
    '720p': '720p (HD)',
    '1080p': '1080p (Full HD)',
    '1440p': '1440p (2K)',
    '4k': '2160p (4K)',
  };
  return labels[quality] || quality;
}

export default streamingRouter;
