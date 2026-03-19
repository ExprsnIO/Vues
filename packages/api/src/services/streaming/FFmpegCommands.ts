/**
 * FFmpeg Command Templates for Adaptive Streaming
 *
 * Generates FFmpeg commands for HLS, DASH, and thumbnail generation
 */

import {
  QUALITY_PRESETS,
  QualityLevel,
  getScaleFilter,
  DEFAULT_STREAMING_CONFIG,
} from './QualityPresets.js';

export interface FFmpegOptions {
  inputPath: string;
  outputDir: string;
  quality: QualityLevel;
  sourceWidth: number;
  sourceHeight: number;
  sourceFps?: number;
  segmentDuration?: number;
  hwaccel?: 'none' | 'vaapi' | 'nvenc' | 'videotoolbox';
  threads?: number;
  preset?: 'ultrafast' | 'superfast' | 'veryfast' | 'faster' | 'fast' | 'medium' | 'slow' | 'slower' | 'veryslow';
}

export interface HLSOutput {
  playlistPath: string;
  initSegmentPath: string;
  segmentPattern: string;
}

export interface DASHOutput {
  manifestPath: string;
  initPattern: string;
  segmentPattern: string;
}

/**
 * Generate FFmpeg arguments for HLS variant transcoding
 */
export function getHLSTranscodeArgs(options: FFmpegOptions): string[] {
  const preset = QUALITY_PRESETS[options.quality];
  const scaleFilter = getScaleFilter(options.quality, options.sourceWidth, options.sourceHeight);
  const segmentDuration = options.segmentDuration || DEFAULT_STREAMING_CONFIG.segmentDuration;
  const ffmpegPreset = options.preset || 'medium';
  const threads = options.threads || 0; // 0 = auto

  const outputPath = `${options.outputDir}/${options.quality}`;
  const fps = Math.min(options.sourceFps || 30, preset.maxFps);
  const gopSize = Math.round(fps * 2); // 2 second GOP

  const args: string[] = [
    // Input
    '-i', options.inputPath,

    // Video codec settings
    '-c:v', 'libx264',
    '-preset', ffmpegPreset,
    '-crf', preset.crf.toString(),
    '-profile:v', preset.profile,
    '-level', preset.level,

    // Video filters
    '-vf', `${scaleFilter},fps=${fps}`,

    // Keyframe settings for clean segment cuts
    '-g', gopSize.toString(),
    '-keyint_min', Math.round(gopSize / 2).toString(),
    '-sc_threshold', '0',

    // Bitrate constraints
    '-maxrate', `${preset.videoBitrate}k`,
    '-bufsize', `${preset.videoBitrate * 2}k`,

    // Audio codec settings
    '-c:a', 'aac',
    '-b:a', `${preset.audioBitrate}k`,
    '-ac', '2',
    '-ar', '48000',

    // Threading
    '-threads', threads.toString(),

    // HLS output settings
    '-f', 'hls',
    '-hls_time', segmentDuration.toString(),
    '-hls_playlist_type', 'vod',
    '-hls_segment_type', 'fmp4',
    '-hls_fmp4_init_filename', 'init.mp4',
    '-hls_segment_filename', `${outputPath}/segment_%04d.m4s`,
    '-hls_flags', 'independent_segments',

    // Output playlist
    `${outputPath}/playlist.m3u8`,
  ];

  return args;
}

/**
 * Generate FFmpeg arguments for multi-bitrate DASH output
 * Creates all quality variants in a single FFmpeg command
 */
export function getDASHTranscodeArgs(
  inputPath: string,
  outputDir: string,
  qualities: QualityLevel[],
  sourceWidth: number,
  sourceHeight: number,
  sourceFps: number = 30,
  options: Partial<FFmpegOptions> = {}
): string[] {
  const segmentDuration = options.segmentDuration || DEFAULT_STREAMING_CONFIG.segmentDuration;
  const ffmpegPreset = options.preset || 'medium';
  const threads = options.threads || 0;

  const args: string[] = [
    '-i', inputPath,
  ];

  // Map video stream for each quality level
  for (let i = 0; i < qualities.length; i++) {
    args.push('-map', '0:v');
  }
  // Map audio stream once
  args.push('-map', '0:a');

  // Video filter and encoding for each quality
  for (let i = 0; i < qualities.length; i++) {
    const quality = qualities[i]!;
    const preset = QUALITY_PRESETS[quality];
    const scaleFilter = getScaleFilter(quality, sourceWidth, sourceHeight);
    const fps = Math.min(sourceFps, preset.maxFps);
    const gopSize = Math.round(fps * 2);

    args.push(
      `-filter:v:${i}`, `${scaleFilter},fps=${fps}`,
      `-c:v:${i}`, 'libx264',
      `-preset:v:${i}`, ffmpegPreset,
      `-crf:v:${i}`, preset.crf.toString(),
      `-profile:v:${i}`, preset.profile,
      `-level:v:${i}`, preset.level,
      `-g:v:${i}`, gopSize.toString(),
      `-keyint_min:v:${i}`, Math.round(gopSize / 2).toString(),
      `-sc_threshold:v:${i}`, '0',
      `-b:v:${i}`, `${preset.videoBitrate}k`,
      `-maxrate:v:${i}`, `${preset.videoBitrate}k`,
      `-bufsize:v:${i}`, `${preset.videoBitrate * 2}k`
    );
  }

  // Audio encoding
  args.push(
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ac', '2',
    '-ar', '48000'
  );

  // Threading
  args.push('-threads', threads.toString());

  // DASH output settings
  args.push(
    '-f', 'dash',
    '-use_timeline', '1',
    '-use_template', '1',
    '-seg_duration', segmentDuration.toString(),
    '-init_seg_name', 'init_$RepresentationID$.m4s',
    '-media_seg_name', 'seg_$RepresentationID$_$Number$.m4s',
    '-adaptation_sets', `id=0,streams=v id=1,streams=a`,
    `${outputDir}/dash/manifest.mpd`
  );

  return args;
}

/**
 * Generate FFmpeg arguments for thumbnail extraction
 */
export function getThumbnailExtractionArgs(
  inputPath: string,
  outputDir: string,
  interval: number = DEFAULT_STREAMING_CONFIG.thumbnailInterval,
  width: number = DEFAULT_STREAMING_CONFIG.thumbnailWidth,
  height: number = DEFAULT_STREAMING_CONFIG.thumbnailHeight
): string[] {
  return [
    '-i', inputPath,
    '-vf', `fps=1/${interval},scale=${width}:${height}`,
    '-q:v', '5', // JPEG quality
    `${outputDir}/thumb_%04d.jpg`,
  ];
}

/**
 * Generate FFmpeg arguments for creating poster/thumbnail image
 */
export function getPosterArgs(
  inputPath: string,
  outputPath: string,
  timestamp: number = 1 // Capture at 1 second by default
): string[] {
  return [
    '-ss', timestamp.toString(),
    '-i', inputPath,
    '-vframes', '1',
    '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease',
    '-q:v', '2',
    outputPath,
  ];
}

/**
 * Generate FFmpeg arguments for progressive MP4 (offline download)
 * Includes fast-start for streaming before download completes
 */
export function getOfflineMP4Args(options: FFmpegOptions): string[] {
  const preset = QUALITY_PRESETS[options.quality];
  const scaleFilter = getScaleFilter(options.quality, options.sourceWidth, options.sourceHeight);
  const ffmpegPreset = options.preset || 'medium';
  const threads = options.threads || 0;

  return [
    '-i', options.inputPath,

    // Video
    '-c:v', 'libx264',
    '-preset', ffmpegPreset,
    '-crf', preset.crf.toString(),
    '-profile:v', preset.profile,
    '-level', preset.level,
    '-vf', scaleFilter,
    '-maxrate', `${preset.videoBitrate}k`,
    '-bufsize', `${preset.videoBitrate * 2}k`,

    // Audio
    '-c:a', 'aac',
    '-b:a', `${preset.audioBitrate}k`,
    '-ac', '2',

    // Threading
    '-threads', threads.toString(),

    // Fast-start for progressive download
    '-movflags', '+faststart',

    // Output
    `${options.outputDir}/offline/${options.quality}.mp4`,
  ];
}

/**
 * Generate FFprobe arguments to get video metadata
 */
export function getProbeArgs(inputPath: string): string[] {
  return [
    '-v', 'quiet',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    inputPath,
  ];
}

export interface VideoMetadata {
  width: number;
  height: number;
  duration: number;
  fps: number;
  codec: string;
  bitrate: number;
  audioCodec?: string;
  audioBitrate?: number;
  audioSampleRate?: number;
}

/**
 * Parse FFprobe JSON output into VideoMetadata
 */
export function parseProbeOutput(probeOutput: string): VideoMetadata {
  const data = JSON.parse(probeOutput);
  const videoStream = data.streams?.find((s: { codec_type: string }) => s.codec_type === 'video');
  const audioStream = data.streams?.find((s: { codec_type: string }) => s.codec_type === 'audio');

  if (!videoStream) {
    throw new Error('No video stream found');
  }

  // Parse frame rate (could be "30/1" or "29.97")
  let fps = 30;
  if (videoStream.r_frame_rate) {
    const [num, den] = videoStream.r_frame_rate.split('/').map(Number);
    fps = den ? num / den : num;
  }

  return {
    width: videoStream.width || 0,
    height: videoStream.height || 0,
    duration: parseFloat(data.format?.duration || videoStream.duration || '0'),
    fps: Math.round(fps * 100) / 100,
    codec: videoStream.codec_name || 'unknown',
    bitrate: parseInt(data.format?.bit_rate || '0', 10) / 1000, // kbps
    audioCodec: audioStream?.codec_name,
    audioBitrate: audioStream?.bit_rate ? parseInt(audioStream.bit_rate, 10) / 1000 : undefined,
    audioSampleRate: audioStream?.sample_rate ? parseInt(audioStream.sample_rate, 10) : undefined,
  };
}

/**
 * Generate ImageMagick montage command for sprite sheet
 */
export function getSpriteCommand(
  inputPattern: string,
  outputPath: string,
  columns: number = DEFAULT_STREAMING_CONFIG.spriteColumns,
  rows: number = DEFAULT_STREAMING_CONFIG.spriteRows,
  thumbWidth: number = DEFAULT_STREAMING_CONFIG.thumbnailWidth,
  thumbHeight: number = DEFAULT_STREAMING_CONFIG.thumbnailHeight
): string[] {
  return [
    'montage',
    inputPattern,
    '-tile', `${columns}x${rows}`,
    '-geometry', `${thumbWidth}x${thumbHeight}+0+0`,
    outputPath,
  ];
}

/**
 * Generate WebVTT content for thumbnail sprites
 */
export function generateThumbnailVTT(
  duration: number,
  interval: number,
  spriteUrl: string,
  columns: number = DEFAULT_STREAMING_CONFIG.spriteColumns,
  rows: number = DEFAULT_STREAMING_CONFIG.spriteRows,
  thumbWidth: number = DEFAULT_STREAMING_CONFIG.thumbnailWidth,
  thumbHeight: number = DEFAULT_STREAMING_CONFIG.thumbnailHeight
): string {
  let vtt = 'WEBVTT\n\n';
  const thumbsPerSprite = columns * rows;
  let thumbIndex = 0;
  let spriteIndex = 0;

  for (let time = 0; time < duration; time += interval) {
    const endTime = Math.min(time + interval, duration);
    const startTimestamp = formatVTTTime(time);
    const endTimestamp = formatVTTTime(endTime);

    // Calculate position in sprite
    const localIndex = thumbIndex % thumbsPerSprite;
    const col = localIndex % columns;
    const row = Math.floor(localIndex / columns);
    const x = col * thumbWidth;
    const y = row * thumbHeight;

    // Check if we need to move to next sprite
    const currentSpriteUrl = spriteIndex > 0
      ? spriteUrl.replace('.jpg', `_${spriteIndex}.jpg`)
      : spriteUrl;

    vtt += `${startTimestamp} --> ${endTimestamp}\n`;
    vtt += `${currentSpriteUrl}#xywh=${x},${y},${thumbWidth},${thumbHeight}\n\n`;

    thumbIndex++;
    if (thumbIndex > 0 && thumbIndex % thumbsPerSprite === 0) {
      spriteIndex++;
    }
  }

  return vtt;
}

/**
 * Format time in seconds to VTT timestamp format (HH:MM:SS.mmm)
 */
function formatVTTTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
}

export default {
  getHLSTranscodeArgs,
  getDASHTranscodeArgs,
  getThumbnailExtractionArgs,
  getPosterArgs,
  getOfflineMP4Args,
  getProbeArgs,
  parseProbeOutput,
  getSpriteCommand,
  generateThumbnailVTT,
};
