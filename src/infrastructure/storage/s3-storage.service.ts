import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Config } from '@/configs/environment.config';
import { S3_CLIENT } from '@/infrastructure/storage/storage.constants';
import type {
  CreateUploadUrlInput,
  PresignedUpload,
  StoragePort,
} from '@/infrastructure/storage/storage.types';
import locals from '@/locals';

interface ResolvedStorage {
  client: S3Client;
  bucket: string;
  config: Config['storage'];
}

@Injectable()
export class S3StorageService implements StoragePort, OnModuleDestroy {
  private readonly logger = new Logger(S3StorageService.name);

  constructor(
    @Inject(S3_CLIENT) private readonly client: S3Client | null,
    private readonly config: ConfigService<Config>,
  ) {}

  isConfigured(): boolean {
    return this.client !== null;
  }

  async createUploadUrl(input: CreateUploadUrlInput): Promise<PresignedUpload> {
    const { client, bucket, config } = this.resolve();
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: input.key,
      ContentType: input.contentType,
      ContentLength: input.contentLength,
    });

    const url = await getSignedUrl(client, command, {
      expiresIn: config.uploadUrlTtlSeconds,
      // Sign these headers so a client cannot swap the content type or smuggle a
      // larger body than was authorized.
      signableHeaders: new Set(['content-type', 'content-length']),
    });

    return {
      url,
      method: 'PUT',
      bucket,
      key: input.key,
      headers: {
        'Content-Type': input.contentType,
        'Content-Length': String(input.contentLength),
      },
      expiresIn: config.uploadUrlTtlSeconds,
    };
  }

  createDownloadUrl(key: string): Promise<string> {
    const { client, bucket, config } = this.resolve();
    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    return getSignedUrl(client, command, {
      expiresIn: config.downloadUrlTtlSeconds,
    });
  }

  async deleteObject(key: string): Promise<void> {
    const { client, bucket } = this.resolve();
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }

  async objectExists(key: string): Promise<boolean> {
    return (await this.head(key)) !== null;
  }

  async getObjectSize(key: string): Promise<number | null> {
    const head = await this.head(key);
    return head?.ContentLength ?? null;
  }

  publicUrl(key: string): string | null {
    const publicBaseUrl =
      this.config.get<Config['storage']>('storage')?.publicBaseUrl;
    if (!publicBaseUrl) {
      return null;
    }
    return `${publicBaseUrl.replace(/\/+$/, '')}/${key}`;
  }

  async isHealthy(): Promise<boolean> {
    if (!this.client) {
      return false;
    }
    const { client, bucket } = this.resolve();
    try {
      await client.send(new HeadBucketCommand({ Bucket: bucket }));
      return true;
    } catch (error) {
      this.logger.warn(
        `S3 bucket health check failed: ${(error as Error).message}`,
      );
      return false;
    }
  }

  onModuleDestroy(): void {
    this.client?.destroy();
  }

  private async head(key: string): Promise<{ ContentLength?: number } | null> {
    const { client, bucket } = this.resolve();
    try {
      return await client.send(
        new HeadObjectCommand({ Bucket: bucket, Key: key }),
      );
    } catch (error) {
      const name = (error as { name?: string }).name;
      if (name === 'NotFound' || name === 'NoSuchKey') {
        return null;
      }
      throw error;
    }
  }

  private resolve(): ResolvedStorage {
    const config = this.config.get<Config['storage']>('storage');
    if (!this.client || !config?.bucket) {
      throw new ServiceUnavailableException(
        locals.files.storage_not_configured,
      );
    }
    return { client: this.client, bucket: config.bucket, config };
  }
}
