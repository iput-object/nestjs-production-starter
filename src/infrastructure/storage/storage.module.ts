import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client } from '@aws-sdk/client-s3';
import { Config } from '@/configs/environment.config';
import {
  S3_CLIENT,
  STORAGE_PORT,
} from '@/infrastructure/storage/storage.constants';
import { S3StorageService } from '@/infrastructure/storage/s3-storage.service';

@Global()
@Module({
  providers: [
    {
      provide: S3_CLIENT,
      inject: [ConfigService],
      // Returns null when S3 is not configured — the app still boots and only
      // the /files endpoints report 503 (see S3StorageService).
      useFactory: (configService: ConfigService<Config>): S3Client | null => {
        const storage = configService.get<Config['storage']>('storage');
        if (
          !storage?.bucket ||
          !storage.accessKeyId ||
          !storage.secretAccessKey
        ) {
          return null;
        }
        return new S3Client({
          region: storage.region,
          endpoint: storage.endpoint,
          forcePathStyle: storage.forcePathStyle,
          credentials: {
            accessKeyId: storage.accessKeyId,
            secretAccessKey: storage.secretAccessKey,
          },
        });
      },
    },
    S3StorageService,
    { provide: STORAGE_PORT, useExisting: S3StorageService },
  ],
  exports: [STORAGE_PORT],
})
export class StorageModule {}
