/**
 * Streaming Services Module
 *
 * Provides adaptive bitrate streaming capabilities including:
 * - Multi-quality HLS/DASH transcoding
 * - Thumbnail sprite generation
 * - Offline download support
 * - Bandwidth-aware quality selection
 */

export {
  AdaptiveTranscodeService,
  adaptiveTranscodeService,
  type TranscodeJobData,
  type TranscodeProgress,
  default as adaptiveTranscodeServiceDefault,
} from './AdaptiveTranscodeService.js';

export {
  QUALITY_PRESETS,
  DEFAULT_STREAMING_CONFIG,
  QUALITY_ORDER,
  getTargetQualities,
  getBandwidthRequirement,
  getQualityForBandwidth,
  getScaleFilter,
  getCodecString,
  generateMasterPlaylist,
  type QualityLevel,
  type QualityPreset,
  type StreamingConfig,
} from './QualityPresets.js';

/**
 * Shared streaming provider interfaces used by SRS and AWS IVS providers
 */
export interface CreateStreamOptions {
  title: string;
  description?: string;
  category?: string;
  tags?: string[];
  recordingEnabled?: boolean;
  chatEnabled?: boolean;
}

export interface StreamInfo {
  streamId: string;
  streamKey: string;
  ingestUrl: string;
  playbackUrl: string;
  providerStreamId?: string;
  providerChannelArn?: string;
}

export interface StreamStatus {
  status: string;
  viewerCount: number;
  startedAt?: Date;
  health?: Record<string, unknown>;
}

export interface StreamingProvider {
  readonly name: string;
  readonly type: string;
  createStream(options: CreateStreamOptions): Promise<StreamInfo>;
  startStream(streamId: string): Promise<void>;
  endStream(streamId: string): Promise<void>;
  getStreamStatus(streamId: string): Promise<StreamStatus>;
  getPlaybackUrl(streamId: string): Promise<string>;
  getIngestUrl(streamId: string): Promise<string>;
  deleteStream(streamId: string): Promise<void>;
  testConnection(): Promise<{ success: boolean; error?: string }>;
}

import type { StreamingConfig as _StreamingConfig } from './QualityPresets.js';

export interface StreamingProviderConfig extends _StreamingConfig {
  srs?: {
    apiUrl: string;
    rtmpUrl: string;
    hlsUrl: string;
    apiKey?: string;
  };
  awsIvs?: {
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    recordingBucket?: string;
  };
}

// Stream key generation
export function generateStreamKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let key = 'sk_';
  for (let i = 0; i < 24; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}

// Streaming provider stub
export async function getStreamingProvider(): Promise<Record<string, unknown>> {
  // Returns the configured streaming provider (AWS IVS, SRS, etc.)
  // Falls back to a no-op provider if none configured
  try {
    const awsIvs = await import('./aws-ivs.js');
    const provider = new awsIvs.AWSIVSProvider({} as StreamingProviderConfig);
    return provider as unknown as Record<string, unknown>;
  } catch {
    return {};
  }
}

export {
  getHLSTranscodeArgs,
  getDASHTranscodeArgs,
  getThumbnailExtractionArgs,
  getPosterArgs,
  getOfflineMP4Args,
  getProbeArgs,
  parseProbeOutput,
  getSpriteCommand,
  generateThumbnailVTT,
  type FFmpegOptions,
  type HLSOutput,
  type DASHOutput,
  type VideoMetadata,
} from './FFmpegCommands.js';
