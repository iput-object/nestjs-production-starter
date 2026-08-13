import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { STORAGE_PORT } from '@/infrastructure/storage/storage.constants';
import type { StoragePort } from '@/infrastructure/storage/storage.types';
import { FileObjectRepository } from '@/core/files/repositories/file-object.repository';
import { CompleteUploadResponseDto } from '@/core/files/dto/response/complete-upload.response.dto';
import locals from '@/locals';

@Injectable()
export class ConfirmUploadService {
  constructor(
    private readonly files: FileObjectRepository,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
  ) {}

  async execute(ownerId: string, fileId: string) {
    const file = await this.files.findByIdForOwner(fileId, ownerId);
    if (!file) {
      throw new NotFoundException(locals.files.file_not_found);
    }

    if (file.status === 'UPLOADED') {
      return {
        message: locals.files.upload_confirmed,
        data: plainToInstance(
          CompleteUploadResponseDto,
          { file },
          { excludeExtraneousValues: true },
        ),
      };
    }

    const size = await this.storage.getObjectSize(file.key);
    if (size === null) {
      throw new BadRequestException(locals.files.upload_not_found_in_storage);
    }

    const updated = await this.files.markUploaded(file.id, { size });
    return {
      message: locals.files.upload_confirmed,
      data: plainToInstance(
        CompleteUploadResponseDto,
        { file: updated },
        { excludeExtraneousValues: true },
      ),
    };
  }
}
