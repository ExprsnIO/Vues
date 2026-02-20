import { nanoid } from 'nanoid';

export type StreamingProviderType = 'srs' | 'aws_ivs';

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
  status: 'idle' | 'live' | 'ended';
  viewerCount: number;
  startedAt?: Date;
  health?: {
    bitrate?: number;
    frameRate?: number;
    resolution?: string;
  };
}

export interface StreamingProvider {
  readonly name: string;
  readonly type: StreamingProviderType;

  /**
   * Create a new stream
   */
  createStream(options: CreateStreamOptions): Promise<StreamInfo>;

  /**
   * Start a stream (mark as live)
   */
  startStream(streamId: string): Promise<void>;

  /**
   * End a stream
   */
  endStream(streamId: string): Promise<void>;

  /**
   * Get current stream status
   */
  getStreamStatus(streamId: string): Promise<StreamStatus>;

  /**
   * Get playback URL for a stream
   */
  getPlaybackUrl(streamId: string): Promise<string>;

  /**
   * Get RTMP ingest URL for streaming software
   */
  getIngestUrl(streamId: string): Promise<string>;

  /**
   * Delete a stream (clean up resources)
   */
  deleteStream(streamId: string): Promise<void>;

  /**
   * Test the connection to the streaming provider
   */
  testConnection(): Promise<{ success: boolean; error?: string }>;
}

export interface StreamingConfig {
  provider: StreamingProviderType;

  // SRS Configuration
  srs?: {
    apiUrl: string;
    rtmpUrl: string;
    hlsUrl: string;
    apiKey?: string;
  };

  // AWS IVS Configuration
  awsIvs?: {
    accessKeyId: string;
    secretAccessKey: string;
    region: string;
    recordingBucket?: string;
    playbackKeyPairArn?: string;
  };
}

/**
 * Generate a secure stream key
 */
export function generateStreamKey(): string {
  return `live_${nanoid(32)}`;
}

/**
 * Factory function to create the appropriate streaming provider
 */
export async function createStreamingProvider(config: StreamingConfig): Promise<StreamingProvider> {
  switch (config.provider) {
    case 'srs': {
      const { SRSProvider } = await import('./srs.js');
      return new SRSProvider(config);
    }
    case 'aws_ivs': {
      const { AWSIVSProvider } = await import('./aws-ivs.js');
      return new AWSIVSProvider(config);
    }
    default:
      throw new Error(`Unknown streaming provider: ${config.provider}`);
  }
}

/**
 * Get streaming configuration from environment variables
 */
export function getStreamingConfigFromEnv(): StreamingConfig {
  const provider = (process.env.STREAMING_PROVIDER || 'srs') as StreamingProviderType;

  const baseConfig: StreamingConfig = {
    provider,
  };

  switch (provider) {
    case 'srs':
      return {
        ...baseConfig,
        srs: {
          apiUrl: process.env.SRS_API_URL || 'http://localhost:1985',
          rtmpUrl: process.env.SRS_RTMP_URL || 'rtmp://localhost:1935/live',
          hlsUrl: process.env.SRS_HLS_URL || 'http://localhost:8080/live',
          apiKey: process.env.SRS_API_KEY,
        },
      };

    case 'aws_ivs':
      return {
        ...baseConfig,
        awsIvs: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
          region: process.env.AWS_REGION || 'us-east-1',
          recordingBucket: process.env.AWS_IVS_RECORDING_BUCKET,
          playbackKeyPairArn: process.env.AWS_IVS_PLAYBACK_KEY_PAIR_ARN,
        },
      };

    default:
      return baseConfig;
  }
}

// Singleton instance
let streamingProviderInstance: StreamingProvider | null = null;

export async function getStreamingProvider(): Promise<StreamingProvider> {
  if (!streamingProviderInstance) {
    const config = getStreamingConfigFromEnv();
    streamingProviderInstance = await createStreamingProvider(config);
  }
  return streamingProviderInstance;
}

export function resetStreamingProvider(): void {
  streamingProviderInstance = null;
}
