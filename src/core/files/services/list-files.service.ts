import { Injectable } from '@nestjs/common';
import { FileObjectRepository } from '@/core/files/repositories/file-object.repository';
import { toFileView } from '@/core/files/files.presenter';

const DEFAULT_LIMIT = 50;

@Injectable()
export class ListFilesService {
  constructor(private readonly files: FileObjectRepository) {}

  async execute(ownerId: string) {
    const files = await this.files.listForOwner(ownerId, DEFAULT_LIMIT);
    return { data: files.map(toFileView) };
  }
}
