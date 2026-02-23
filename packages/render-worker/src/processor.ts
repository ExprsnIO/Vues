import ffmpeg from 'fluent-ffmpeg';
import { promises as fs } from 'fs';
import path from 'path';
import { uploadToStorage, getContentType, getStorageConfigFromEnv } from './storage.js';

export interface RenderJobData {
  jobId: string;
  projectId: string;
  userDid: string;
  format: string;
  quality: string;
  width: number;
  height: number;
  fps: number;
  duration: number;
  timeline: TimelineData;
  outputPath?: string;
}

export interface TimelineData {
  tracks: Track[];
  duration: number;
}

export interface Track {
  id: string;
  type: 'video' | 'audio' | 'image' | 'text';
  clips: Clip[];
}

export interface Clip {
  id: string;
  startTime: number;
  duration: number;
  source: string;
  trim?: { start: number; end: number };
  effects?: Effect[];
}

export interface Effect {
  type: string;
  params: Record<string, unknown>;
}

export interface RenderProgress {
  percent: number;
  currentTime: number;
  totalTime: number;
  fps: number;
}

export interface RenderResult {
  success: boolean;
  outputPath?: string;
  outputUrl?: string;
  outputKey?: string;
  fileSize?: number;
  duration?: number;
  error?: string;
}

// Quality presets
const QUALITY_PRESETS: Record<string, { crf: number; preset: string; bitrate?: string }> = {
  draft: { crf: 28, preset: 'ultrafast' },
  low: { crf: 26, preset: 'fast' },
  medium: { crf: 23, preset: 'medium' },
  high: { crf: 20, preset: 'slow' },
  ultra: { crf: 18, preset: 'veryslow' },
};

// Format settings
const FORMAT_SETTINGS: Record<string, { codec: string; ext: string }> = {
  mp4: { codec: 'libx264', ext: 'mp4' },
  webm: { codec: 'libvpx-vp9', ext: 'webm' },
  mov: { codec: 'prores', ext: 'mov' },
  gif: { codec: 'gif', ext: 'gif' },
};

export class RenderProcessor {
  private ffmpegPath: string;
  private ffprobePath: string;
  private outputDir: string;
  private tempDir: string;

  constructor(options?: {
    ffmpegPath?: string;
    ffprobePath?: string;
    outputDir?: string;
    tempDir?: string;
  }) {
    this.ffmpegPath = options?.ffmpegPath || process.env.FFMPEG_PATH || 'ffmpeg';
    this.ffprobePath = options?.ffprobePath || process.env.FFPROBE_PATH || 'ffprobe';
    this.outputDir = options?.outputDir || process.env.RENDER_OUTPUT_DIR || '/data/renders';
    this.tempDir = options?.tempDir || process.env.RENDER_TEMP_DIR || '/tmp/renders';

    ffmpeg.setFfmpegPath(this.ffmpegPath);
    ffmpeg.setFfprobePath(this.ffprobePath);
  }

  async process(
    data: RenderJobData,
    onProgress?: (progress: RenderProgress) => void
  ): Promise<RenderResult> {
    const startTime = Date.now();
    const qualityPreset = QUALITY_PRESETS[data.quality] || QUALITY_PRESETS.medium;
    const formatSettings = FORMAT_SETTINGS[data.format] || FORMAT_SETTINGS.mp4;

    // Create temp and output directories
    const jobTempDir = path.join(this.tempDir, data.jobId);
    const outputFileName = `${data.projectId}_${Date.now()}.${formatSettings.ext}`;
    const outputPath = data.outputPath || path.join(this.outputDir, data.userDid, outputFileName);

    try {
      await fs.mkdir(jobTempDir, { recursive: true });
      await fs.mkdir(path.dirname(outputPath), { recursive: true });

      // Build FFmpeg command based on timeline
      const command = this.buildCommand(data, qualityPreset, formatSettings, jobTempDir, outputPath);

      // Execute render
      await this.executeRender(command, data.duration, onProgress);

      // Get output file stats
      const stats = await fs.stat(outputPath);
      const renderDuration = Math.floor((Date.now() - startTime) / 1000);

      // Upload to storage
      const storageKey = `renders/${data.userDid}/${data.jobId}/${outputFileName}`;
      const contentType = getContentType(formatSettings.ext);

      let outputUrl: string | undefined;
      let outputKey: string | undefined;

      try {
        const uploadResult = await uploadToStorage(outputPath, storageKey, contentType);
        outputUrl = uploadResult.url;
        outputKey = uploadResult.key;
        console.log(`Uploaded to storage: ${outputKey} -> ${outputUrl}`);
      } catch (uploadErr) {
        console.error('Storage upload failed, keeping local file:', uploadErr);
        // Continue without storage URL - file is still available locally
      }

      // Clean up temp directory
      await fs.rm(jobTempDir, { recursive: true, force: true });

      return {
        success: true,
        outputPath,
        outputUrl,
        outputKey,
        fileSize: stats.size,
        duration: renderDuration,
      };
    } catch (err) {
      // Clean up on error
      try {
        await fs.rm(jobTempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }

      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }

  private buildCommand(
    data: RenderJobData,
    quality: { crf: number; preset: string; bitrate?: string },
    format: { codec: string; ext: string },
    tempDir: string,
    outputPath: string
  ): ffmpeg.FfmpegCommand {
    let command = ffmpeg();

    // Add video tracks as inputs
    const videoTracks = data.timeline.tracks.filter((t) => t.type === 'video');
    const audioTracks = data.timeline.tracks.filter((t) => t.type === 'audio');

    // For now, use a simplified approach - take the first video clip as main input
    // A full implementation would use complex filter graphs
    const firstVideoClip = videoTracks[0]?.clips[0];
    if (firstVideoClip) {
      command = command.input(firstVideoClip.source);

      // Apply trim if specified
      if (firstVideoClip.trim) {
        command = command
          .seekInput(firstVideoClip.trim.start)
          .duration(firstVideoClip.trim.end - firstVideoClip.trim.start);
      }
    }

    // Add first audio track if exists
    const firstAudioClip = audioTracks[0]?.clips[0];
    if (firstAudioClip && firstAudioClip.source !== firstVideoClip?.source) {
      command = command.input(firstAudioClip.source);
    }

    // Set output options
    command = command
      .size(`${data.width}x${data.height}`)
      .fps(data.fps)
      .videoCodec(format.codec)
      .outputOptions([
        `-crf ${quality.crf}`,
        `-preset ${quality.preset}`,
        '-movflags +faststart', // Enable streaming
      ]);

    // Audio codec
    if (format.ext === 'webm') {
      command = command.audioCodec('libopus');
    } else if (format.ext !== 'gif') {
      command = command.audioCodec('aac').audioBitrate('192k');
    }

    command = command.output(outputPath);

    return command;
  }

  private executeRender(
    command: ffmpeg.FfmpegCommand,
    totalDuration: number,
    onProgress?: (progress: RenderProgress) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      command
        .on('start', (cmdLine) => {
          console.log('FFmpeg command:', cmdLine);
        })
        .on('progress', (progress) => {
          if (onProgress && progress.timemark) {
            const currentTime = this.parseTimemark(progress.timemark);
            onProgress({
              percent: Math.min(100, (currentTime / totalDuration) * 100),
              currentTime,
              totalTime: totalDuration,
              fps: progress.currentFps || 0,
            });
          }
        })
        .on('error', (err, stdout, stderr) => {
          console.error('FFmpeg error:', err.message);
          console.error('FFmpeg stderr:', stderr);
          reject(err);
        })
        .on('end', () => {
          console.log('Render completed');
          resolve();
        })
        .run();
    });
  }

  private parseTimemark(timemark: string): number {
    const parts = timemark.split(':');
    if (parts.length === 3) {
      const hours = parseFloat(parts[0]);
      const minutes = parseFloat(parts[1]);
      const seconds = parseFloat(parts[2]);
      return hours * 3600 + minutes * 60 + seconds;
    }
    return 0;
  }

  async probe(inputPath: string): Promise<ffmpeg.FfprobeData> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(inputPath, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });
  }
}
