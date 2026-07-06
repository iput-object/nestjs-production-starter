import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Config } from '@/configs/environment.config';
import { STORAGE_PORT } from '@/infrastructure/storage/storage.constants';
import type { StoragePort } from '@/infrastructure/storage/storage.types';
import { CreateUploadUrlDto } from '@/core/files/dto/create-upload-url.dto';
import { buildObjectKey } from '@/core/files/helpers/file-key.helper';
import { FileObjectRepository } from '@/core/files/repositories/file-object.repository';
import { toFileView } from '@/core/files/files.presenter';
import locals from '@/locals';

@Injectable()
export class CreateUploadUrlService {
  constructor(
    private readonly files: FileObjectRepository,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    private readonly config: ConfigService<Config>,
  ) {}

  async execute(ownerId: string, dto: CreateUploadUrlDto) {
    const storageConfig = this.config.getOrThrow<Config['storage']>('storage');
    if (dto.size > storageConfig.maxUploadBytes) {
      throw new BadRequestException(locals.files.file_too_large);
    }

    const key = buildObjectKey(ownerId, dto.filename);
    const upload = await this.storage.createUploadUrl({
      key,
      contentType: dto.contentType,
      contentLength: dto.size,
    });

    const file = await this.files.create({
      ownerId,
      key,
      bucket: upload.bucket,
      contentType: dto.contentType,
      originalName: dto.filename,
      visibility: dto.visibility ?? 'PRIVATE',
    });

    return {
      message: locals.files.upload_url_created,
      data: { file: toFileView(file), upload },
    };
  }
}
