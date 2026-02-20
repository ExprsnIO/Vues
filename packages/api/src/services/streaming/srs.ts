import type {
  StreamingProvider,
  StreamingConfig,
  CreateStreamOptions,
  StreamInfo,
  StreamStatus,
} from './index.js';
import { generateStreamKey } from './index.js';
import { nanoid } from 'nanoid';

interface SRSStreamData {
  streamId: string;
  streamKey: string;
  title: string;
  status: 'idle' | 'live' | 'ended';
  viewerCount: number;
  startedAt?: Date;
}

/**
 * SRS (Simple Realtime Server) streaming provider
 *
 * SRS is an open-source, simple, high-efficiency and real-time video server.
 * It supports RTMP, HLS, HTTP-FLV, WebRTC, and more.
 *
 * @see https://ossrs.io/
 */
export class SRSProvider implements StreamingProvider {
  readonly name = 'SRS (Simple Realtime Server)';
  readonly type = 'srs' as const;

  private apiUrl: string;
  private rtmpUrl: string;
  private hlsUrl: string;
  private apiKey?: string;

  // In-memory stream storage (in production, this would be in Redis/DB)
  private streams: Map<string, SRSStreamData> = new Map();

  constructor(config: StreamingConfig) {
    if (!config.srs) {
      throw new Error('SRS configuration is required');
    }

    this.apiUrl = config.srs.apiUrl;
    this.rtmpUrl = config.srs.rtmpUrl;
    this.hlsUrl = config.srs.hlsUrl;
    this.apiKey = config.srs.apiKey;
  }

  async createStream(options: CreateStreamOptions): Promise<StreamInfo> {
    const streamId = nanoid();
    const streamKey = generateStreamKey();

    const streamData: SRSStreamData = {
      streamId,
      streamKey,
      title: options.title,
      status: 'idle',
      viewerCount: 0,
    };

    this.streams.set(streamId, streamData);

    // SRS RTMP URL format: rtmp://host:port/app/stream
    const ingestUrl = `${this.rtmpUrl}/${streamKey}`;

    // HLS playback URL format: http://host:port/live/stream.m3u8
    const playbackUrl = `${this.hlsUrl}/${streamKey}.m3u8`;

    return {
      streamId,
      streamKey,
      ingestUrl,
      playbackUrl,
    };
  }

  async startStream(streamId: string): Promise<void> {
    const stream = this.streams.get(streamId);
    if (!stream) {
      throw new Error(`Stream not found: ${streamId}`);
    }

    stream.status = 'live';
    stream.startedAt = new Date();
    this.streams.set(streamId, stream);

    // In production, this would notify SRS via its HTTP API
    // to start publishing to this stream key
  }

  async endStream(streamId: string): Promise<void> {
    const stream = this.streams.get(streamId);
    if (!stream) {
      throw new Error(`Stream not found: ${streamId}`);
    }

    stream.status = 'ended';
    this.streams.set(streamId, stream);

    // In production, this would call SRS API to kick the publisher
    await this.kickPublisher(stream.streamKey);
  }

  async getStreamStatus(streamId: string): Promise<StreamStatus> {
    const stream = this.streams.get(streamId);
    if (!stream) {
      throw new Error(`Stream not found: ${streamId}`);
    }

    // Try to get real-time info from SRS
    try {
      const srsInfo = await this.getSRSStreamInfo(stream.streamKey);
      if (srsInfo) {
        return {
          status: srsInfo.publish ? 'live' : stream.status,
          viewerCount: srsInfo.clients || stream.viewerCount,
          startedAt: stream.startedAt,
          health: srsInfo.video ? {
            bitrate: srsInfo.video.kbps,
            frameRate: srsInfo.video.fps,
            resolution: `${srsInfo.video.width}x${srsInfo.video.height}`,
          } : undefined,
        };
      }
    } catch {
      // Fall back to cached data
    }

    return {
      status: stream.status,
      viewerCount: stream.viewerCount,
      startedAt: stream.startedAt,
    };
  }

  async getPlaybackUrl(streamId: string): Promise<string> {
    const stream = this.streams.get(streamId);
    if (!stream) {
      throw new Error(`Stream not found: ${streamId}`);
    }

    return `${this.hlsUrl}/${stream.streamKey}.m3u8`;
  }

  async getIngestUrl(streamId: string): Promise<string> {
    const stream = this.streams.get(streamId);
    if (!stream) {
      throw new Error(`Stream not found: ${streamId}`);
    }

    return `${this.rtmpUrl}/${stream.streamKey}`;
  }

  async deleteStream(streamId: string): Promise<void> {
    const stream = this.streams.get(streamId);
    if (stream && stream.status === 'live') {
      await this.kickPublisher(stream.streamKey);
    }
    this.streams.delete(streamId);
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      // Try to call SRS API to check if it's running
      const response = await fetch(`${this.apiUrl}/api/v1/versions`);
      if (response.ok) {
        const data = await response.json();
        console.log('SRS version:', data);
        return { success: true };
      }
      return { success: false, error: `SRS API returned ${response.status}` };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to connect to SRS',
      };
    }
  }

  /**
   * Get stream info from SRS HTTP API
   */
  private async getSRSStreamInfo(streamKey: string): Promise<SRSStreamInfo | null> {
    try {
      const response = await fetch(`${this.apiUrl}/api/v1/streams`);
      if (!response.ok) {
        return null;
      }

      const data = await response.json() as { streams: SRSStreamInfo[] };
      const stream = data.streams?.find(s => s.name === streamKey);
      return stream || null;
    } catch {
      return null;
    }
  }

  /**
   * Kick a publisher from SRS
   */
  private async kickPublisher(streamKey: string): Promise<void> {
    try {
      // Get the client ID for this stream
      const response = await fetch(`${this.apiUrl}/api/v1/clients`);
      if (!response.ok) return;

      const data = await response.json() as { clients: { id: number; url: string }[] };
      const client = data.clients?.find(c => c.url?.includes(streamKey));

      if (client) {
        // Kick the client
        await fetch(`${this.apiUrl}/api/v1/clients/${client.id}`, {
          method: 'DELETE',
        });
      }
    } catch {
      // Ignore errors when kicking
    }
  }
}

interface SRSStreamInfo {
  id: number;
  name: string;
  app: string;
  publish: boolean;
  clients: number;
  video?: {
    width: number;
    height: number;
    fps: number;
    kbps: number;
  };
  audio?: {
    sample_rate: number;
    channels: number;
  };
}
