import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { STORAGE_PORT } from '@/infrastructure/storage/storage.constants';
import type { StoragePort } from '@/infrastructure/storage/storage.types';
import { FileObjectRepository } from '@/core/files/repositories/file-object.repository';
import locals from '@/locals';

@Injectable()
export class DeleteFileService {
  constructor(
    private readonly files: FileObjectRepository,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
  ) {}

  async execute(ownerId: string, fileId: string) {
    const file = await this.files.findByIdForOwner(fileId, ownerId);
    if (!file) {
      throw new NotFoundException(locals.files.file_not_found);
    }

    await this.storage.deleteObject(file.key);
    await this.files.delete(file.id);

    return {
      message: locals.files.file_deleted,
      data: { id: file.id },
    };
  }
}
