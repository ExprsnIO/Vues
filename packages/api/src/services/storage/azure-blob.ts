import {
  BlobServiceClient,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
  ContainerClient,
} from '@azure/storage-blob';
import { Readable } from 'stream';
import type { StorageProvider, StorageConfig, UploadOptions } from './index.js';

export class AzureBlobProvider implements StorageProvider {
  readonly name = 'Azure Blob Storage';
  readonly type = 'azure' as const;

  private client: BlobServiceClient;
  private containerClient: ContainerClient;
  private credential: StorageSharedKeyCredential;
  private accountName: string;
  private containerName: string;
  private cdnUrl?: string;

  constructor(config: StorageConfig) {
    if (!config.azure) {
      throw new Error('Azure configuration is required for Azure Blob provider');
    }

    this.accountName = config.azure.accountName;
    this.containerName = config.azure.containerName;
    this.cdnUrl = config.cdnUrl;

    this.credential = new StorageSharedKeyCredential(
      config.azure.accountName,
      config.azure.accountKey
    );

    this.client = new BlobServiceClient(
      `https://${config.azure.accountName}.blob.core.windows.net`,
      this.credential
    );

    this.containerClient = this.client.getContainerClient(this.containerName);
  }

  async getPresignedUploadUrl(
    key: string,
    contentType: string,
    expiresIn = 3600
  ): Promise<{ url: string; fields?: Record<string, string> }> {
    const blobClient = this.containerClient.getBlobClient(key);
    const blockBlobClient = blobClient.getBlockBlobClient();

    const startsOn = new Date();
    const expiresOn = new Date(startsOn.getTime() + expiresIn * 1000);

    const sasToken = generateBlobSASQueryParameters(
      {
        containerName: this.containerName,
        blobName: key,
        permissions: BlobSASPermissions.parse('w'), // write permission
        startsOn,
        expiresOn,
        contentType,
      },
      this.credential
    ).toString();

    return {
      url: `${blockBlobClient.url}?${sasToken}`,
      fields: {
        'x-ms-blob-type': 'BlockBlob',
        'x-ms-blob-content-type': contentType,
      },
    };
  }

  async getPresignedDownloadUrl(key: string, expiresIn = 3600): Promise<string> {
    const blobClient = this.containerClient.getBlobClient(key);

    const startsOn = new Date();
    const expiresOn = new Date(startsOn.getTime() + expiresIn * 1000);

    const sasToken = generateBlobSASQueryParameters(
      {
        containerName: this.containerName,
        blobName: key,
        permissions: BlobSASPermissions.parse('r'), // read permission
        startsOn,
        expiresOn,
      },
      this.credential
    ).toString();

    return `${blobClient.url}?${sasToken}`;
  }

  getPublicUrl(key: string): string {
    if (this.cdnUrl) {
      return `${this.cdnUrl.replace(/\/$/, '')}/${key}`;
    }
    return `https://${this.accountName}.blob.core.windows.net/${this.containerName}/${key}`;
  }

  async uploadFile(
    key: string,
    body: Buffer | Readable,
    contentType: string,
    options?: UploadOptions
  ): Promise<void> {
    const blockBlobClient = this.containerClient.getBlockBlobClient(key);

    const uploadOptions = {
      blobHTTPHeaders: {
        blobContentType: contentType,
        blobCacheControl: options?.cacheControl,
        blobContentDisposition: options?.contentDisposition,
      },
      metadata: options?.metadata,
    };

    if (Buffer.isBuffer(body)) {
      await blockBlobClient.uploadData(body, uploadOptions);
    } else {
      // Convert Readable stream to buffer for Azure SDK
      const chunks: Buffer[] = [];
      for await (const chunk of body) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const buffer = Buffer.concat(chunks);
      await blockBlobClient.uploadData(buffer, uploadOptions);
    }
  }

  async downloadFile(key: string): Promise<Buffer> {
    const blobClient = this.containerClient.getBlobClient(key);
    const downloadResponse = await blobClient.download(0);

    if (!downloadResponse.readableStreamBody) {
      throw new Error(`File not found: ${key}`);
    }

    const chunks: Buffer[] = [];
    for await (const chunk of downloadResponse.readableStreamBody) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    return Buffer.concat(chunks);
  }

  async deleteFile(key: string): Promise<void> {
    const blobClient = this.containerClient.getBlobClient(key);
    await blobClient.deleteIfExists();
  }

  async fileExists(key: string): Promise<boolean> {
    const blobClient = this.containerClient.getBlobClient(key);
    return blobClient.exists();
  }

  async listFiles(prefix: string, maxKeys = 1000): Promise<string[]> {
    const files: string[] = [];
    let count = 0;

    for await (const blob of this.containerClient.listBlobsFlat({ prefix })) {
      if (count >= maxKeys) break;
      files.push(blob.name);
      count++;
    }

    return files;
  }

  async copyFile(sourceKey: string, destinationKey: string): Promise<void> {
    const sourceBlobClient = this.containerClient.getBlobClient(sourceKey);
    const destBlobClient = this.containerClient.getBlobClient(destinationKey);

    const copyPoller = await destBlobClient.beginCopyFromURL(sourceBlobClient.url);
    await copyPoller.pollUntilDone();
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      // Try to get container properties
      await this.containerClient.getProperties();
      return { success: true };
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
