/**
 * Stream Events Queue
 *
 * Handles async processing of stream lifecycle events (go-live notifications, webhooks)
 * using BullMQ for reliable job processing with retries and error handling.
 */

import { Queue, Worker, Job } from 'bullmq';
import { getRedisConnection } from '../../cache/redis.js';

// ==================== JOB TYPES ====================

export type StreamEventType =
  | 'stream.started'
  | 'stream.ended'
  | 'stream.go_live_notifications';

export interface StreamStartedJob {
  type: 'stream.started';
  streamId: string;
  userDid: string;
}

export interface StreamEndedJob {
  type: 'stream.ended';
  streamId: string;
  userDid: string;
  endedAt: string;
  startedAt: string | null;
}

export interface GoLiveNotificationsJob {
  type: 'stream.go_live_notifications';
  streamId: string;
}

export type StreamEventJob = StreamStartedJob | StreamEndedJob | GoLiveNotificationsJob;

// ==================== QUEUE SETUP ====================

const QUEUE_NAME = 'stream-events';

let queue: Queue<StreamEventJob> | null = null;
let worker: Worker<StreamEventJob> | null = null;

/**
 * Get or create the stream events queue
 */
export function getStreamEventsQueue(): Queue<StreamEventJob> {
  if (!queue) {
    const connection = getRedisConnection();
    queue = new Queue<StreamEventJob>(QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: {
          age: 24 * 3600, // Keep completed jobs for 24 hours
          count: 1000,    // Keep last 1000 completed jobs
        },
        removeOnFail: {
          age: 7 * 24 * 3600, // Keep failed jobs for 7 days
        },
      },
    });
  }
  return queue;
}

// ==================== JOB HANDLERS ====================

/**
 * Process stream.started event
 */
async function handleStreamStarted(job: Job<StreamStartedJob>): Promise<void> {
  const { streamId, userDid } = job.data;

  try {
    const { getStreamWebhookService } = await import('./StreamWebhookService.js');
    const webhookService = getStreamWebhookService();
    await webhookService.onStreamStarted(streamId, userDid);
    console.log(`[StreamEvents] Processed stream.started webhooks for ${streamId}`);
  } catch (error) {
    console.error(`[StreamEvents] Failed to process stream.started for ${streamId}:`, error);
    throw error; // Re-throw to trigger retry
  }
}

/**
 * Process stream.ended event
 */
async function handleStreamEnded(job: Job<StreamEndedJob>): Promise<void> {
  const { streamId, userDid, endedAt, startedAt } = job.data;

  try {
    const { getStreamWebhookService } = await import('./StreamWebhookService.js');
    const { db } = await import('../../db/index.js');
    const { streamViewers, streamChat, liveStreams } = await import('../../db/schema.js');
    const { eq, sql } = await import('drizzle-orm');

    const webhookService = getStreamWebhookService();

    // Calculate duration
    const duration = startedAt
      ? Math.floor((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000)
      : 0;

    // Get viewer stats
    const [viewerStats] = await db
      .select({
        totalViews: sql<number>`COUNT(DISTINCT ${streamViewers.sessionId})::int`,
        peakViewers: sql<number>`COALESCE(MAX(${liveStreams.peakViewers}), 0)::int`,
      })
      .from(streamViewers)
      .leftJoin(liveStreams, eq(liveStreams.id, streamViewers.streamId))
      .where(eq(streamViewers.streamId, streamId));

    // Get chat stats
    const [chatStats] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(streamChat)
      .where(eq(streamChat.streamId, streamId));

    await webhookService.onStreamEnded(streamId, userDid, {
      duration,
      peakViewers: viewerStats?.peakViewers ?? 0,
      totalViews: viewerStats?.totalViews ?? 0,
      chatMessages: chatStats?.count ?? 0,
    });

    console.log(`[StreamEvents] Processed stream.ended webhooks for ${streamId}`);
  } catch (error) {
    console.error(`[StreamEvents] Failed to process stream.ended for ${streamId}:`, error);
    throw error; // Re-throw to trigger retry
  }
}

/**
 * Process go-live notifications
 */
async function handleGoLiveNotifications(job: Job<GoLiveNotificationsJob>): Promise<void> {
  const { streamId } = job.data;

  try {
    const { getLiveNotificationService } = await import('./LiveNotificationService.js');
    const notificationService = getLiveNotificationService();
    const result = await notificationService.notifyGoLive(streamId);
    console.log(
      `[StreamEvents] Go-live notifications sent for ${streamId}: ${result.notificationsSent}/${result.followers} followers`
    );
  } catch (error) {
    console.error(`[StreamEvents] Failed to send go-live notifications for ${streamId}:`, error);
    throw error; // Re-throw to trigger retry
  }
}

// ==================== WORKER ====================

/**
 * Start the stream events worker
 */
export function startStreamEventsWorker(): Worker<StreamEventJob> {
  if (worker) {
    return worker;
  }

  const connection = getRedisConnection();

  worker = new Worker<StreamEventJob>(
    QUEUE_NAME,
    async (job) => {
      console.log(`[StreamEvents] Processing job ${job.id}: ${job.data.type}`);

      switch (job.data.type) {
        case 'stream.started':
          await handleStreamStarted(job as Job<StreamStartedJob>);
          break;
        case 'stream.ended':
          await handleStreamEnded(job as Job<StreamEndedJob>);
          break;
        case 'stream.go_live_notifications':
          await handleGoLiveNotifications(job as Job<GoLiveNotificationsJob>);
          break;
        default:
          console.warn(`[StreamEvents] Unknown job type: ${(job.data as any).type}`);
      }
    },
    {
      connection,
      concurrency: 5, // Process up to 5 jobs concurrently
    }
  );

  worker.on('completed', (job) => {
    console.log(`[StreamEvents] Job ${job.id} completed successfully`);
  });

  worker.on('failed', (job, error) => {
    console.error(`[StreamEvents] Job ${job?.id} failed:`, error.message);
  });

  worker.on('error', (error) => {
    console.error('[StreamEvents] Worker error:', error);
  });

  console.log('[StreamEvents] Worker started');
  return worker;
}

/**
 * Stop the stream events worker
 */
export async function stopStreamEventsWorker(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
    console.log('[StreamEvents] Worker stopped');
  }
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Queue a stream started event
 */
export async function queueStreamStarted(streamId: string, userDid: string): Promise<void> {
  const q = getStreamEventsQueue();
  await q.add(
    'stream.started',
    { type: 'stream.started', streamId, userDid },
    { jobId: `stream-started-${streamId}` }
  );
}

/**
 * Queue a stream ended event
 */
export async function queueStreamEnded(
  streamId: string,
  userDid: string,
  endedAt: Date,
  startedAt: Date | null
): Promise<void> {
  const q = getStreamEventsQueue();
  await q.add(
    'stream.ended',
    {
      type: 'stream.ended',
      streamId,
      userDid,
      endedAt: endedAt.toISOString(),
      startedAt: startedAt?.toISOString() ?? null,
    },
    { jobId: `stream-ended-${streamId}` }
  );
}

/**
 * Queue go-live notifications
 */
export async function queueGoLiveNotifications(streamId: string): Promise<void> {
  const q = getStreamEventsQueue();
  await q.add(
    'stream.go_live_notifications',
    { type: 'stream.go_live_notifications', streamId },
    {
      jobId: `go-live-notifications-${streamId}`,
      priority: 1, // High priority for time-sensitive notifications
    }
  );
}
