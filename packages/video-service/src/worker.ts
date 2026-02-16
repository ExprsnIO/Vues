import { Worker, Job } from 'bullmq';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import ffmpeg from 'fluent-ffmpeg';
import { createWriteStream, createReadStream } from 'fs';
import { mkdir, rm, readdir } from 'fs/promises';
import { join } from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { Redis } from 'ioredis';

interface TranscodeJob {
  uploadId: string;
  inputKey: string;
  userId: string;
}

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

const s3 = new S3Client({
  endpoint:
    process.env.DO_SPACES_ENDPOINT ||
    `https://${process.env.DO_SPACES_REGION}.digitaloceanspaces.com`,
  region: process.env.DO_SPACES_REGION || 'nyc3',
  credentials: {
    accessKeyId: process.env.DO_SPACES_KEY!,
    secretAccessKey: process.env.DO_SPACES_SECRET!,
  },
  forcePathStyle: true,
});

const BUCKET = process.env.DO_SPACES_BUCKET || 'exprsn-uploads';
const CDN_BASE = process.env.DO_SPACES_CDN || 'http://localhost:9000/exprsn-processed';

async function updateStatus(
  uploadId: string,
  status: string,
  progress: number,
  extra?: Record<string, string>
) {
  const key = `upload:${uploadId}`;
  const existing = await redis.get(key);
  const data = existing ? JSON.parse(existing) : {};

  await redis.setex(
    key,
    7200,
    JSON.stringify({
      ...data,
      status,
      progress,
      ...extra,
    })
  );
}

async function downloadFromS3(key: string, destPath: string): Promise<void> {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
  });

  const response = await s3.send(command);
  const body = response.Body as Readable;

  await pipeline(body, createWriteStream(destPath));
}

async function uploadToS3(localPath: string, key: string, contentType: string): Promise<void> {
  const command = new PutObjectCommand({
    Bucket: 'exprsn-processed',
    Key: key,
    Body: createReadStream(localPath),
    ContentType: contentType,
    ACL: 'public-read',
  });

  await s3.send(command);
}

async function uploadDirectory(localDir: string, s3Prefix: string): Promise<void> {
  const files = await readdir(localDir, { recursive: true, withFileTypes: true });

  for (const file of files) {
    if (file.isFile()) {
      const localPath = join(file.parentPath || file.path, file.name);
      const relativePath = localPath.replace(localDir, '').replace(/^\//, '');
      const s3Key = `${s3Prefix}/${relativePath}`;

      const contentType = file.name.endsWith('.m3u8')
        ? 'application/vnd.apple.mpegurl'
        : file.name.endsWith('.ts')
          ? 'video/MP2T'
          : file.name.endsWith('.jpg')
            ? 'image/jpeg'
            : 'application/octet-stream';

      await uploadToS3(localPath, s3Key, contentType);
    }
  }
}

async function processVideo(job: Job<TranscodeJob>): Promise<void> {
  const { uploadId, inputKey, userId } = job.data;

  const workDir = `/tmp/transcode-${uploadId}`;
  const inputPath = `${workDir}/input`;
  const outputDir = `${workDir}/output`;

  try {
    // Create work directories
    await mkdir(workDir, { recursive: true });
    await mkdir(outputDir, { recursive: true });

    // Update status: downloading
    await updateStatus(uploadId, 'processing', 20);

    // Download input file
    console.log(`Downloading ${inputKey}...`);
    await downloadFromS3(inputKey, inputPath);

    // Update status: transcoding
    await updateStatus(uploadId, 'processing', 30);

    // Get video info
    const probe = await new Promise<ffmpeg.FfprobeData>((resolve, reject) => {
      ffmpeg.ffprobe(inputPath, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });

    const videoStream = probe.streams.find((s) => s.codec_type === 'video');
    const duration = probe.format.duration || 0;

    console.log(`Video duration: ${duration}s, resolution: ${videoStream?.width}x${videoStream?.height}`);

    // Generate HLS with multiple quality levels
    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .outputOptions([
          '-preset fast',
          '-g 48',
          '-sc_threshold 0',
          '-map 0:v:0',
          '-map 0:a:0?', // Audio optional
          '-map 0:v:0',
          '-map 0:a:0?',
          '-map 0:v:0',
          '-map 0:a:0?',
          '-filter:v:0 scale=640:-2',
          '-b:v:0 800k',
          '-filter:v:1 scale=960:-2',
          '-b:v:1 1400k',
          '-filter:v:2 scale=1280:-2',
          '-b:v:2 2800k',
          '-var_stream_map',
          'v:0,a:0 v:1,a:1 v:2,a:2',
          '-master_pl_name master.m3u8',
          '-f hls',
          '-hls_time 4',
          '-hls_playlist_type vod',
          '-hls_segment_filename',
          `${outputDir}/v%v/segment%d.ts`,
        ])
        .output(`${outputDir}/v%v/playlist.m3u8`)
        .on('progress', (progress) => {
          const percent = Math.min(90, 30 + (progress.percent || 0) * 0.5);
          updateStatus(uploadId, 'processing', Math.floor(percent));
        })
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });

    // Update status: generating thumbnail
    await updateStatus(uploadId, 'processing', 92);

    // Generate thumbnail
    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .screenshots({
          timestamps: ['10%'],
          filename: 'thumbnail.jpg',
          folder: outputDir,
          size: '720x?',
        })
        .on('end', () => resolve())
        .on('error', (err) => reject(err));
    });

    // Update status: uploading
    await updateStatus(uploadId, 'processing', 95);

    // Upload to CDN bucket
    const cdnPrefix = `${userId}/${uploadId}`;
    console.log(`Uploading to ${cdnPrefix}...`);
    await uploadDirectory(outputDir, cdnPrefix);

    // Build CDN URLs
    const cdnUrl = `${CDN_BASE}/${cdnPrefix}`;
    const hlsPlaylist = `${cdnUrl}/master.m3u8`;
    const thumbnail = `${cdnUrl}/thumbnail.jpg`;

    // Update final status
    await updateStatus(uploadId, 'completed', 100, {
      cdnUrl,
      hlsPlaylist,
      thumbnail,
    });

    console.log(`Completed processing ${uploadId}`);
  } catch (error) {
    console.error(`Failed to process ${uploadId}:`, error);
    await updateStatus(uploadId, 'failed', 0, {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  } finally {
    // Cleanup
    try {
      await rm(workDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}

// Create worker
const worker = new Worker<TranscodeJob>('transcode', processVideo, {
  connection: {
    host: new URL(process.env.REDIS_URL || 'redis://localhost:6379').hostname,
    port: parseInt(new URL(process.env.REDIS_URL || 'redis://localhost:6379').port || '6379', 10),
  },
  concurrency: parseInt(process.env.WORKER_CONCURRENCY || '2', 10),
});

worker.on('completed', (job) => {
  console.log(`Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed:`, err);
});

console.log('Video transcoding worker started');
