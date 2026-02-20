/**
 * Audio Analysis API Routes
 * Provides endpoints for audio analysis including beat detection and waveform generation
 */

import { Hono } from 'hono';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { v4 as uuid } from 'uuid';
import { requireAuth } from '../auth/middleware.js';

const audioRouter = new Hono();

// Redis connection for status storage
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

// Audio analysis job queue
const audioQueue = new Queue('audio-analysis', {
  connection: {
    host: new URL(process.env.REDIS_URL || 'redis://localhost:6379').hostname,
    port: parseInt(new URL(process.env.REDIS_URL || 'redis://localhost:6379').port || '6379', 10),
  },
});

/**
 * Queue audio analysis job
 */
audioRouter.post('/io.exprsn.audio.analyze', requireAuth, async (c) => {
  const userDid = c.get('userDid');
  const body = await c.req.json<{
    videoUri?: string;
    soundId?: string;
    sourceUrl?: string;
    options?: {
      includeSpectral?: boolean;
      targetWaveformPeaks?: number;
    };
  }>();

  const { videoUri, soundId, sourceUrl, options } = body;

  if (!videoUri && !soundId && !sourceUrl) {
    return c.json(
      { error: 'InvalidRequest', message: 'Must provide videoUri, soundId, or sourceUrl' },
      400
    );
  }

  const analysisId = uuid();

  // Store initial status
  await redis.setex(
    `audio-analysis:${analysisId}`,
    7200, // 2 hour expiry
    JSON.stringify({
      status: 'queued',
      progress: 0,
      userDid,
      videoUri,
      soundId,
      sourceUrl,
      createdAt: new Date().toISOString(),
    })
  );

  // Add job to queue
  await audioQueue.add('analyze', {
    analysisId,
    userDid,
    videoUri,
    soundId,
    sourceUrl,
    options,
  });

  return c.json({
    analysisId,
    status: 'queued',
    message: 'Audio analysis queued',
  });
});

/**
 * Get analysis status and results
 */
audioRouter.get('/io.exprsn.audio.getAnalysis', requireAuth, async (c) => {
  const analysisId = c.req.query('analysisId');

  if (!analysisId) {
    return c.json({ error: 'InvalidRequest', message: 'analysisId is required' }, 400);
  }

  const data = await redis.get(`audio-analysis:${analysisId}`);

  if (!data) {
    return c.json({ error: 'NotFound', message: 'Analysis not found' }, 404);
  }

  return c.json(JSON.parse(data));
});

/**
 * Get waveform data for a video or sound
 */
audioRouter.get('/io.exprsn.audio.getWaveform', requireAuth, async (c) => {
  const videoUri = c.req.query('videoUri');
  const soundId = c.req.query('soundId');
  const startTime = parseFloat(c.req.query('startTime') || '0');
  const endTime = parseFloat(c.req.query('endTime') || '-1');
  const targetPeaks = parseInt(c.req.query('targetPeaks') || '300', 10);

  if (!videoUri && !soundId) {
    return c.json(
      { error: 'InvalidRequest', message: 'Must provide videoUri or soundId' },
      400
    );
  }

  // Look up cached analysis
  const cacheKey = videoUri
    ? `waveform:video:${videoUri}`
    : `waveform:sound:${soundId}`;

  const cached = await redis.get(cacheKey);

  if (!cached) {
    return c.json(
      {
        error: 'NotFound',
        message: 'Waveform not found. Run analysis first.',
      },
      404
    );
  }

  const waveformData = JSON.parse(cached);

  // If time range specified, extract subset
  if (endTime > 0 && startTime >= 0) {
    const totalDuration = waveformData.duration;
    const peaks = waveformData.peaks;

    const startIdx = Math.floor((startTime / totalDuration) * peaks.length);
    const endIdx = Math.ceil((endTime / totalDuration) * peaks.length);

    let rangePeaks = peaks.slice(
      Math.max(0, startIdx),
      Math.min(peaks.length, endIdx)
    );

    // Downsample if needed
    if (rangePeaks.length > targetPeaks) {
      const ratio = rangePeaks.length / targetPeaks;
      const downsampled = [];

      for (let i = 0; i < targetPeaks; i++) {
        const start = Math.floor(i * ratio);
        const end = Math.min(Math.floor((i + 1) * ratio), rangePeaks.length);

        let min = Infinity;
        let max = -Infinity;

        for (let j = start; j < end; j++) {
          if (rangePeaks[j].min < min) min = rangePeaks[j].min;
          if (rangePeaks[j].max > max) max = rangePeaks[j].max;
        }

        downsampled.push({ min, max });
      }

      rangePeaks = downsampled;
    }

    return c.json({
      peaks: rangePeaks,
      startTime,
      endTime,
      duration: endTime - startTime,
    });
  }

  return c.json(waveformData);
});

/**
 * Get beat markers for a video or sound
 */
audioRouter.get('/io.exprsn.audio.getBeats', requireAuth, async (c) => {
  const videoUri = c.req.query('videoUri');
  const soundId = c.req.query('soundId');
  const startTime = parseFloat(c.req.query('startTime') || '0');
  const endTime = parseFloat(c.req.query('endTime') || '-1');
  const minStrength = parseFloat(c.req.query('minStrength') || '0');

  if (!videoUri && !soundId) {
    return c.json(
      { error: 'InvalidRequest', message: 'Must provide videoUri or soundId' },
      400
    );
  }

  // Look up cached analysis
  const cacheKey = videoUri
    ? `beats:video:${videoUri}`
    : `beats:sound:${soundId}`;

  const cached = await redis.get(cacheKey);

  if (!cached) {
    return c.json(
      {
        error: 'NotFound',
        message: 'Beat data not found. Run analysis first.',
      },
      404
    );
  }

  const beatData = JSON.parse(cached);
  let beats = beatData.beats;

  // Filter by time range
  if (endTime > 0) {
    beats = beats.filter(
      (b: { time: number }) => b.time >= startTime && b.time <= endTime
    );
  } else if (startTime > 0) {
    beats = beats.filter((b: { time: number }) => b.time >= startTime);
  }

  // Filter by strength
  if (minStrength > 0) {
    beats = beats.filter((b: { strength: number }) => b.strength >= minStrength);
  }

  return c.json({
    beats,
    bpm: beatData.bpm,
    duration: beatData.duration,
  });
});

/**
 * Get BPM for a video or sound
 */
audioRouter.get('/io.exprsn.audio.getBPM', requireAuth, async (c) => {
  const videoUri = c.req.query('videoUri');
  const soundId = c.req.query('soundId');

  if (!videoUri && !soundId) {
    return c.json(
      { error: 'InvalidRequest', message: 'Must provide videoUri or soundId' },
      400
    );
  }

  // Look up cached analysis
  const cacheKey = videoUri
    ? `beats:video:${videoUri}`
    : `beats:sound:${soundId}`;

  const cached = await redis.get(cacheKey);

  if (!cached) {
    return c.json(
      {
        error: 'NotFound',
        message: 'BPM data not found. Run analysis first.',
      },
      404
    );
  }

  const beatData = JSON.parse(cached);

  return c.json({
    bpm: beatData.bpm.bpm,
    confidence: beatData.bpm.confidence,
    alternatives: beatData.bpm.alternatives,
  });
});

/**
 * Manually set BPM for a video or sound
 */
audioRouter.post('/io.exprsn.audio.setBPM', requireAuth, async (c) => {
  const body = await c.req.json<{
    videoUri?: string;
    soundId?: string;
    bpm: number;
    offset?: number;
  }>();

  const { videoUri, soundId, bpm, offset = 0 } = body;

  if (!videoUri && !soundId) {
    return c.json(
      { error: 'InvalidRequest', message: 'Must provide videoUri or soundId' },
      400
    );
  }

  if (!bpm || bpm < 20 || bpm > 300) {
    return c.json(
      { error: 'InvalidRequest', message: 'BPM must be between 20 and 300' },
      400
    );
  }

  const cacheKey = videoUri
    ? `beats:video:${videoUri}`
    : `beats:sound:${soundId}`;

  const cached = await redis.get(cacheKey);

  if (!cached) {
    return c.json(
      {
        error: 'NotFound',
        message: 'Beat data not found. Run analysis first.',
      },
      404
    );
  }

  const beatData = JSON.parse(cached);

  // Regenerate beat grid with manual BPM
  const interval = 60 / bpm;
  const duration = beatData.duration;
  const newBeats = [];

  for (let t = offset; t < duration; t += interval) {
    newBeats.push({
      time: t,
      strength: 0.8,
      confidence: 1.0,
      manual: true,
    });
  }

  const updatedData = {
    ...beatData,
    bpm: {
      bpm,
      confidence: 1.0,
      alternatives: beatData.bpm.alternatives,
      manual: true,
    },
    beats: newBeats,
  };

  await redis.setex(cacheKey, 86400 * 7, JSON.stringify(updatedData));

  return c.json({
    success: true,
    bpm,
    beatCount: newBeats.length,
  });
});

/**
 * Delete analysis data
 */
audioRouter.post('/io.exprsn.audio.deleteAnalysis', requireAuth, async (c) => {
  const body = await c.req.json<{
    videoUri?: string;
    soundId?: string;
  }>();

  const { videoUri, soundId } = body;

  if (!videoUri && !soundId) {
    return c.json(
      { error: 'InvalidRequest', message: 'Must provide videoUri or soundId' },
      400
    );
  }

  const identifier = videoUri ? `video:${videoUri}` : `sound:${soundId}`;

  // Delete all related keys
  await redis.del(`waveform:${identifier}`);
  await redis.del(`beats:${identifier}`);
  await redis.del(`spectral:${identifier}`);

  return c.json({ success: true });
});

/**
 * Get spectral data (if analyzed with spectral option)
 */
audioRouter.get('/io.exprsn.audio.getSpectral', requireAuth, async (c) => {
  const videoUri = c.req.query('videoUri');
  const soundId = c.req.query('soundId');
  const startFrame = parseInt(c.req.query('startFrame') || '0', 10);
  const endFrame = parseInt(c.req.query('endFrame') || '-1', 10);

  if (!videoUri && !soundId) {
    return c.json(
      { error: 'InvalidRequest', message: 'Must provide videoUri or soundId' },
      400
    );
  }

  const cacheKey = videoUri
    ? `spectral:video:${videoUri}`
    : `spectral:sound:${soundId}`;

  const cached = await redis.get(cacheKey);

  if (!cached) {
    return c.json(
      {
        error: 'NotFound',
        message: 'Spectral data not found. Run analysis with includeSpectral option.',
      },
      404
    );
  }

  const spectralData = JSON.parse(cached);
  let frames = spectralData.frames;

  // Extract range if specified
  if (endFrame > 0) {
    frames = frames.slice(
      Math.max(0, startFrame),
      Math.min(frames.length, endFrame)
    );
  } else if (startFrame > 0) {
    frames = frames.slice(startFrame);
  }

  return c.json({
    frames,
    fftSize: spectralData.fftSize,
    hopSize: spectralData.hopSize,
    sampleRate: spectralData.sampleRate,
  });
});

export { audioRouter };
