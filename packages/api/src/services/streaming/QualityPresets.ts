/**
 * Quality Presets Configuration for Adaptive Streaming
 *
 * Defines encoding parameters for each quality level including
 * resolution, bitrate, codec settings, and FFmpeg parameters.
 */

export type QualityLevel = '360p' | '480p' | '720p' | '1080p' | '1440p' | '4k';

export interface QualityPreset {
  name: QualityLevel;
  width: number;
  height: number;
  videoBitrate: number; // kbps
  audioBitrate: number; // kbps
  maxFps: number;
  profile: 'baseline' | 'main' | 'high';
  level: string; // H.264 level
  crf: number; // Constant Rate Factor (18-28, lower = better quality)
  gopSize: number; // Group of Pictures size in frames
  keyintMin: number; // Minimum keyframe interval
}

export interface StreamingConfig {
  segmentDuration: number; // HLS/DASH segment duration in seconds
  thumbnailInterval: number; // Seconds between thumbnail captures
  spriteColumns: number; // Thumbnails per row in sprite
  spriteRows: number; // Rows in sprite sheet
  thumbnailWidth: number; // Individual thumbnail width
  thumbnailHeight: number; // Individual thumbnail height
  offlineQualities: QualityLevel[]; // Qualities available for download
  defaultQuality: QualityLevel; // Default playback quality
}

/**
 * Standard quality presets optimized for short-form video
 */
export const QUALITY_PRESETS: Record<QualityLevel, QualityPreset> = {
  '360p': {
    name: '360p',
    width: 640,
    height: 360,
    videoBitrate: 800,
    audioBitrate: 64,
    maxFps: 30,
    profile: 'baseline',
    level: '3.0',
    crf: 23,
    gopSize: 60, // 2 seconds at 30fps
    keyintMin: 30,
  },
  '480p': {
    name: '480p',
    width: 854,
    height: 480,
    videoBitrate: 1400,
    audioBitrate: 96,
    maxFps: 30,
    profile: 'main',
    level: '3.1',
    crf: 23,
    gopSize: 60,
    keyintMin: 30,
  },
  '720p': {
    name: '720p',
    width: 1280,
    height: 720,
    videoBitrate: 2800,
    audioBitrate: 128,
    maxFps: 30,
    profile: 'high',
    level: '4.0',
    crf: 22,
    gopSize: 60,
    keyintMin: 30,
  },
  '1080p': {
    name: '1080p',
    width: 1920,
    height: 1080,
    videoBitrate: 5000,
    audioBitrate: 192,
    maxFps: 30,
    profile: 'high',
    level: '4.1',
    crf: 21,
    gopSize: 60,
    keyintMin: 30,
  },
  '1440p': {
    name: '1440p',
    width: 2560,
    height: 1440,
    videoBitrate: 8000,
    audioBitrate: 192,
    maxFps: 30,
    profile: 'high',
    level: '5.0',
    crf: 20,
    gopSize: 60,
    keyintMin: 30,
  },
  '4k': {
    name: '4k',
    width: 3840,
    height: 2160,
    videoBitrate: 14000,
    audioBitrate: 256,
    maxFps: 30,
    profile: 'high',
    level: '5.1',
    crf: 19,
    gopSize: 60,
    keyintMin: 30,
  },
};

/**
 * Default streaming configuration
 */
export const DEFAULT_STREAMING_CONFIG: StreamingConfig = {
  segmentDuration: 4, // 4-second segments for VOD
  thumbnailInterval: 1, // Capture thumbnail every second
  spriteColumns: 10,
  spriteRows: 10,
  thumbnailWidth: 160,
  thumbnailHeight: 90,
  offlineQualities: ['360p', '720p'],
  defaultQuality: '720p',
};

/**
 * Quality level order from lowest to highest
 */
export const QUALITY_ORDER: QualityLevel[] = [
  '360p',
  '480p',
  '720p',
  '1080p',
  '1440p',
  '4k',
];

/**
 * Get quality levels that should be generated based on source resolution
 * Only generates qualities at or below the source resolution
 */
export function getTargetQualities(
  sourceWidth: number,
  sourceHeight: number,
  maxQuality: QualityLevel = '1080p'
): QualityLevel[] {
  const maxIndex = QUALITY_ORDER.indexOf(maxQuality);
  const qualities: QualityLevel[] = [];

  for (let i = 0; i <= maxIndex; i++) {
    const quality = QUALITY_ORDER[i]!;
    const preset = QUALITY_PRESETS[quality];

    // Only include quality if source is at least as large
    if (sourceWidth >= preset.width && sourceHeight >= preset.height) {
      qualities.push(quality);
    } else if (qualities.length === 0) {
      // Always include at least one quality (the lowest that fits)
      qualities.push(quality);
      break;
    }
  }

  // If source is larger than max quality, include up to max
  if (qualities.length === 0) {
    qualities.push('360p'); // Fallback to minimum
  }

  return qualities;
}

/**
 * Calculate bandwidth requirement for adaptive streaming
 * Returns bandwidth in bits per second
 */
export function getBandwidthRequirement(quality: QualityLevel): number {
  const preset = QUALITY_PRESETS[quality];
  // Total bitrate = video + audio, convert to bps with 10% overhead
  return (preset.videoBitrate + preset.audioBitrate) * 1000 * 1.1;
}

/**
 * Get the best quality level for a given bandwidth
 */
export function getQualityForBandwidth(
  bandwidthBps: number,
  availableQualities: QualityLevel[]
): QualityLevel {
  // Sort available qualities by bandwidth requirement (descending)
  const sorted = [...availableQualities].sort((a, b) => {
    return getBandwidthRequirement(b) - getBandwidthRequirement(a);
  });

  // Find the highest quality that fits within bandwidth
  for (const quality of sorted) {
    if (getBandwidthRequirement(quality) <= bandwidthBps * 0.8) {
      // 80% of available bandwidth
      return quality;
    }
  }

  // Fallback to lowest available quality
  return sorted[sorted.length - 1] || '360p';
}

/**
 * Get FFmpeg video filter for scaling to a quality level
 * Handles both landscape and portrait videos
 */
export function getScaleFilter(
  quality: QualityLevel,
  sourceWidth: number,
  sourceHeight: number
): string {
  const preset = QUALITY_PRESETS[quality];

  // Determine if source is portrait
  const isPortrait = sourceHeight > sourceWidth;

  if (isPortrait) {
    // For portrait videos, swap width/height to maintain aspect ratio
    return `scale=${preset.height}:${preset.width}:force_original_aspect_ratio=decrease,pad=${preset.height}:${preset.width}:(ow-iw)/2:(oh-ih)/2`;
  }

  // Landscape video
  return `scale=${preset.width}:${preset.height}:force_original_aspect_ratio=decrease,pad=${preset.width}:${preset.height}:(ow-iw)/2:(oh-ih)/2`;
}

/**
 * Codec string for HLS master playlist
 */
export function getCodecString(quality: QualityLevel): string {
  const preset = QUALITY_PRESETS[quality];
  // avc1 = H.264, mp4a.40.2 = AAC-LC
  const profileMap = { baseline: '42', main: '4d', high: '64' };
  const levelHex = parseInt(preset.level.replace('.', ''), 10)
    .toString(16)
    .padStart(2, '0');
  return `avc1.${profileMap[preset.profile]}00${levelHex},mp4a.40.2`;
}

/**
 * Generate master playlist content for HLS
 */
export function generateMasterPlaylist(
  qualities: QualityLevel[],
  baseUrl: string
): string {
  let playlist = '#EXTM3U\n#EXT-X-VERSION:6\n\n';

  for (const quality of qualities) {
    const preset = QUALITY_PRESETS[quality];
    const bandwidth = getBandwidthRequirement(quality);
    const codecs = getCodecString(quality);

    playlist += `#EXT-X-STREAM-INF:BANDWIDTH=${Math.round(bandwidth)},RESOLUTION=${preset.width}x${preset.height},CODECS="${codecs}",NAME="${quality}"\n`;
    playlist += `${baseUrl}/${quality}/playlist.m3u8\n\n`;
  }

  return playlist;
}

export default {
  QUALITY_PRESETS,
  DEFAULT_STREAMING_CONFIG,
  QUALITY_ORDER,
  getTargetQualities,
  getBandwidthRequirement,
  getQualityForBandwidth,
  getScaleFilter,
  getCodecString,
  generateMasterPlaylist,
};
