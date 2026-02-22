import type {
  StreamingProvider,
  StreamingConfig,
  CreateStreamOptions,
  StreamInfo,
  StreamStatus,
} from './index.js';
import { generateStreamKey } from './index.js';
import { nanoid } from 'nanoid';

// AWS IVS types (simplified for implementation)
interface IVSChannel {
  arn: string;
  name: string;
  playbackUrl: string;
  ingestEndpoint: string;
  type: string;
}

interface IVSStreamKey {
  arn: string;
  value: string;
  channelArn: string;
}

interface IVSStream {
  channelArn: string;
  health: string;
  state: string;
  viewerCount: number;
  startTime: string;
}

/**
 * AWS Interactive Video Service (IVS) streaming provider
 *
 * AWS IVS is a managed live streaming solution with low-latency
 * capabilities, automatic transcoding, and built-in recording.
 *
 * @see https://aws.amazon.com/ivs/
 */
export class AWSIVSProvider implements StreamingProvider {
  readonly name = 'AWS Interactive Video Service';
  readonly type = 'aws_ivs' as const;

  private region: string;
  private accessKeyId: string;
  private secretAccessKey: string;
  private recordingBucket?: string;

  // Store channel mappings
  private streamToChannel: Map<string, { channelArn: string; streamKey: string }> = new Map();

  constructor(config: StreamingConfig) {
    if (!config.awsIvs) {
      throw new Error('AWS IVS configuration is required');
    }

    this.region = config.awsIvs.region;
    this.accessKeyId = config.awsIvs.accessKeyId;
    this.secretAccessKey = config.awsIvs.secretAccessKey;
    this.recordingBucket = config.awsIvs.recordingBucket;
  }

  /**
   * Get AWS SDK client (lazy loaded to avoid import issues)
   */
  private async getClient() {
    // Dynamically import AWS SDK
    const { IvsClient } = await import('@aws-sdk/client-ivs');

    return new IvsClient({
      region: this.region,
      credentials: {
        accessKeyId: this.accessKeyId,
        secretAccessKey: this.secretAccessKey,
      },
    });
  }

  async createStream(options: CreateStreamOptions): Promise<StreamInfo> {
    const streamId = nanoid();
    const channelName = `exprsn-${streamId}`;

    const client = await this.getClient();

    // Import commands dynamically
    const { CreateChannelCommand, CreateStreamKeyCommand } = await import('@aws-sdk/client-ivs');

    // Create IVS Channel
    const createChannelResponse = await client.send(new CreateChannelCommand({
      name: channelName,
      type: 'STANDARD', // or 'BASIC' for lower latency but fewer features
      latencyMode: 'LOW', // LOW or NORMAL
      authorized: false, // Set to true for playback authorization
      tags: {
        streamId,
        title: options.title,
      },
      // Recording configuration (if bucket provided)
      ...(this.recordingBucket && options.recordingEnabled !== false ? {
        recordingConfigurationArn: await this.getRecordingConfigArn(),
      } : {}),
    }));

    const channel = createChannelResponse.channel;
    if (!channel?.arn) {
      throw new Error('Failed to create IVS channel');
    }

    // Create Stream Key
    const createStreamKeyResponse = await client.send(new CreateStreamKeyCommand({
      channelArn: channel.arn,
      tags: {
        streamId,
      },
    }));

    const streamKeyObj = createStreamKeyResponse.streamKey;
    if (!streamKeyObj?.value) {
      throw new Error('Failed to create IVS stream key');
    }

    // Store mapping
    this.streamToChannel.set(streamId, {
      channelArn: channel.arn,
      streamKey: streamKeyObj.value,
    });

    // IVS provides RTMPS ingest URL format: rtmps://ingest.{region}.amazonaws.com:443/app/
    const ingestUrl = `rtmps://${channel.ingestEndpoint}/app/${streamKeyObj.value}`;

    return {
      streamId,
      streamKey: streamKeyObj.value,
      ingestUrl,
      playbackUrl: channel.playbackUrl || '',
      providerStreamId: channel.name,
      providerChannelArn: channel.arn,
    };
  }

  async startStream(streamId: string): Promise<void> {
    // AWS IVS streams start automatically when the broadcaster connects
    // This method is a no-op for IVS, but we can use it to verify the stream is ready
    const mapping = this.streamToChannel.get(streamId);
    if (!mapping) {
      throw new Error(`Stream not found: ${streamId}`);
    }

    // Optionally verify the channel exists
    await this.getStreamStatus(streamId);
  }

  async endStream(streamId: string): Promise<void> {
    const mapping = this.streamToChannel.get(streamId);
    if (!mapping) {
      throw new Error(`Stream not found: ${streamId}`);
    }

    const client = await this.getClient();
    const { StopStreamCommand } = await import('@aws-sdk/client-ivs');

    try {
      await client.send(new StopStreamCommand({
        channelArn: mapping.channelArn,
      }));
    } catch (error: unknown) {
      // Ignore if stream is already stopped
      if ((error as { name?: string }).name !== 'ChannelNotBroadcasting') {
        throw error;
      }
    }
  }

  async getStreamStatus(streamId: string): Promise<StreamStatus> {
    const mapping = this.streamToChannel.get(streamId);
    if (!mapping) {
      throw new Error(`Stream not found: ${streamId}`);
    }

    const client = await this.getClient();
    const { GetStreamCommand } = await import('@aws-sdk/client-ivs');

    try {
      const response = await client.send(new GetStreamCommand({
        channelArn: mapping.channelArn,
      }));

      const stream = response.stream;
      if (!stream) {
        return { status: 'idle', viewerCount: 0 };
      }

      return {
        status: stream.state === 'LIVE' ? 'live' : stream.state === 'OFFLINE' ? 'ended' : 'idle',
        viewerCount: stream.viewerCount || 0,
        startedAt: stream.startTime ? new Date(stream.startTime) : undefined,
        health: stream.health ? {
          // IVS health values: HEALTHY, STARVING, etc.
        } : undefined,
      };
    } catch (error: unknown) {
      if ((error as { name?: string }).name === 'ChannelNotBroadcasting') {
        return { status: 'idle', viewerCount: 0 };
      }
      throw error;
    }
  }

  async getPlaybackUrl(streamId: string): Promise<string> {
    const mapping = this.streamToChannel.get(streamId);
    if (!mapping) {
      throw new Error(`Stream not found: ${streamId}`);
    }

    const client = await this.getClient();
    const { GetChannelCommand } = await import('@aws-sdk/client-ivs');

    const response = await client.send(new GetChannelCommand({
      arn: mapping.channelArn,
    }));

    return response.channel?.playbackUrl || '';
  }

  async getIngestUrl(streamId: string): Promise<string> {
    const mapping = this.streamToChannel.get(streamId);
    if (!mapping) {
      throw new Error(`Stream not found: ${streamId}`);
    }

    const client = await this.getClient();
    const { GetChannelCommand } = await import('@aws-sdk/client-ivs');

    const response = await client.send(new GetChannelCommand({
      arn: mapping.channelArn,
    }));

    const ingestEndpoint = response.channel?.ingestEndpoint;
    if (!ingestEndpoint) {
      throw new Error('Ingest endpoint not found');
    }

    return `rtmps://${ingestEndpoint}/app/${mapping.streamKey}`;
  }

  async deleteStream(streamId: string): Promise<void> {
    const mapping = this.streamToChannel.get(streamId);
    if (!mapping) {
      return; // Already deleted
    }

    const client = await this.getClient();
    const { DeleteChannelCommand } = await import('@aws-sdk/client-ivs');

    try {
      // Stop stream first if running
      await this.endStream(streamId).catch(() => {});

      // Delete the channel
      await client.send(new DeleteChannelCommand({
        arn: mapping.channelArn,
      }));

      this.streamToChannel.delete(streamId);
    } catch (error: unknown) {
      // Ignore if already deleted
      if ((error as { name?: string }).name !== 'ResourceNotFoundException') {
        throw error;
      }
    }
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      const client = await this.getClient();
      const { ListChannelsCommand } = await import('@aws-sdk/client-ivs');

      await client.send(new ListChannelsCommand({
        maxResults: 1,
      }));

      return { success: true };
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to connect to AWS IVS',
      };
    }
  }

  // Cache recording configuration ARN
  private recordingConfigArn?: string;

  /**
   * Get or create recording configuration ARN
   * This is needed for auto-recording streams to S3
   */
  private async getRecordingConfigArn(): Promise<string | undefined> {
    if (!this.recordingBucket) {
      return undefined;
    }

    // Return cached ARN if available
    if (this.recordingConfigArn) {
      return this.recordingConfigArn;
    }

    const client = await this.getClient();
    const { ListRecordingConfigurationsCommand, CreateRecordingConfigurationCommand } = await import('@aws-sdk/client-ivs');

    const configName = 'exprsn-recording-config';

    try {
      // List existing recording configurations
      const listResponse = await client.send(new ListRecordingConfigurationsCommand({
        maxResults: 100,
      }));

      // Find existing config with our name
      const existingConfig = listResponse.recordingConfigurations?.find(
        (config) => config.name === configName
      );

      if (existingConfig?.arn) {
        this.recordingConfigArn = existingConfig.arn;
        return this.recordingConfigArn;
      }

      // Create new recording configuration
      const createResponse = await client.send(new CreateRecordingConfigurationCommand({
        name: configName,
        destinationConfiguration: {
          s3: {
            bucketName: this.recordingBucket,
          },
        },
        // Optional: Configure thumbnail generation
        thumbnailConfiguration: {
          recordingMode: 'INTERVAL',
          targetIntervalSeconds: 60, // Generate thumbnail every 60 seconds
          storage: ['LATEST', 'SEQUENTIAL'], // Store latest and sequential thumbnails
        },
        // Recording configuration
        recordingReconnectWindowSeconds: 60, // Auto-reconnect window
        tags: {
          application: 'exprsn',
        },
      }));

      this.recordingConfigArn = createResponse.recordingConfiguration?.arn;
      return this.recordingConfigArn;
    } catch (error: unknown) {
      console.error('Failed to get/create recording configuration:', error);
      return undefined;
    }
  }

  /**
   * Get recording status for a stream
   */
  async getRecordingStatus(streamId: string): Promise<{
    isRecording: boolean;
    s3Location?: string;
    recordingDuration?: number;
  }> {
    const mapping = this.streamToChannel.get(streamId);
    if (!mapping) {
      return { isRecording: false };
    }

    const client = await this.getClient();
    const { ListStreamSessionsCommand } = await import('@aws-sdk/client-ivs');

    try {
      const response = await client.send(new ListStreamSessionsCommand({
        channelArn: mapping.channelArn,
        maxResults: 1,
      }));

      const session = response.streamSessions?.[0];
      if (!session) {
        return { isRecording: false };
      }

      // IVS automatically records to S3 when recording config is attached
      const startTime = session.startTime ? new Date(session.startTime) : undefined;
      const recordingDuration = startTime
        ? Math.floor((Date.now() - startTime.getTime()) / 1000)
        : undefined;

      return {
        isRecording: true,
        s3Location: this.recordingBucket
          ? `s3://${this.recordingBucket}/ivs/${mapping.channelArn.split('/').pop()}`
          : undefined,
        recordingDuration,
      };
    } catch {
      return { isRecording: false };
    }
  }

  /**
   * List past recordings for a channel
   */
  async listRecordings(streamId: string, limit: number = 10): Promise<Array<{
    sessionId: string;
    startTime: Date;
    endTime?: Date;
    s3Location: string;
    recordingDuration: number;
  }>> {
    const mapping = this.streamToChannel.get(streamId);
    if (!mapping || !this.recordingBucket) {
      return [];
    }

    const client = await this.getClient();
    const { ListStreamSessionsCommand } = await import('@aws-sdk/client-ivs');

    try {
      const response = await client.send(new ListStreamSessionsCommand({
        channelArn: mapping.channelArn,
        maxResults: limit,
      }));

      return (response.streamSessions || [])
        .filter((session) => session.startTime && session.endTime)
        .map((session) => ({
          sessionId: session.streamId || '',
          startTime: new Date(session.startTime!),
          endTime: session.endTime ? new Date(session.endTime) : undefined,
          s3Location: `s3://${this.recordingBucket}/ivs/${mapping.channelArn.split('/').pop()}/${session.streamId}`,
          recordingDuration: session.endTime && session.startTime
            ? Math.floor((new Date(session.endTime).getTime() - new Date(session.startTime).getTime()) / 1000)
            : 0,
        }));
    } catch (error) {
      console.error('Failed to list recordings:', error);
      return [];
    }
  }

  /**
   * Get stream metrics
   */
  async getStreamMetrics(streamId: string): Promise<{
    ingestBitrate?: number;
    ingestFramerate?: number;
    keyframeInterval?: number;
    videoHeight?: number;
    videoWidth?: number;
    audioChannels?: number;
    audioSampleRate?: number;
  }> {
    const mapping = this.streamToChannel.get(streamId);
    if (!mapping) {
      return {};
    }

    const client = await this.getClient();
    const { GetStreamSessionCommand } = await import('@aws-sdk/client-ivs');

    try {
      const response = await client.send(new GetStreamSessionCommand({
        channelArn: mapping.channelArn,
        streamId,
      }));

      const ingestConfig = response.streamSession?.ingestConfiguration;
      const videoConfig = ingestConfig?.video as Record<string, unknown> | undefined;
      const audioConfig = ingestConfig?.audio as Record<string, unknown> | undefined;

      return {
        ingestBitrate: videoConfig?.bitrate as number | undefined,
        ingestFramerate: videoConfig?.framerate as number | undefined,
        keyframeInterval: videoConfig?.keyframeInterval as number | undefined,
        videoHeight: videoConfig?.height as number | undefined,
        videoWidth: videoConfig?.width as number | undefined,
        audioChannels: audioConfig?.channels as number | undefined,
        audioSampleRate: audioConfig?.sampleRate as number | undefined,
      };
    } catch {
      return {};
    }
  }
}
