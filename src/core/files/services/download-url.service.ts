import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { Config } from '@/configs/environment.config';
import { STORAGE_PORT } from '@/infrastructure/storage/storage.constants';
import { GetDownloadUrlResponseDto } from '@/core/files/dto/response/get-download-url.response.dto';
import type { StoragePort } from '@/infrastructure/storage/storage.types';
import { FileObjectRepository } from '@/core/files/repositories/file-object.repository';
import locals from '@/locals';

@Injectable()
export class DownloadUrlService {
  constructor(
    private readonly files: FileObjectRepository,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    private readonly config: ConfigService<Config>,
  ) {}

  async execute(ownerId: string, fileId: string) {
    const file = await this.files.findByIdForOwner(fileId, ownerId);
    if (!file) {
      throw new NotFoundException(locals.files.file_not_found);
    }

    if (file.status !== 'UPLOADED') {
      throw new BadRequestException(locals.files.file_not_uploaded);
    }

    if (file.visibility === 'PUBLIC') {
      const publicUrl = this.storage.publicUrl(file.key);
      if (publicUrl) {
        return {
          message: locals.files.download_url_created,
          data: plainToInstance(
            GetDownloadUrlResponseDto,
            { url: publicUrl },
            { excludeExtraneousValues: true },
          ),
        };
      }
    }

    const url = await this.storage.createDownloadUrl(file.key);
    const storageConfig = this.config.getOrThrow<Config['storage']>('storage');
    return {
      message: locals.files.download_url_created,
      data: plainToInstance(
        GetDownloadUrlResponseDto,
        { url, expiresIn: storageConfig.downloadUrlTtlSeconds },
        { excludeExtraneousValues: true },
      ),
    };
  }
}
