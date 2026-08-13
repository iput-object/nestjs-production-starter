import { Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { FileObjectRepository } from '@/core/files/repositories/file-object.repository';
import { ListFilesResponseDto } from '@/core/files/dto/response/list-files.response.dto';

const DEFAULT_LIMIT = 50;

@Injectable()
export class ListFilesService {
  constructor(private readonly files: FileObjectRepository) {}

  async execute(ownerId: string) {
    const files = await this.files.listForOwner(ownerId, DEFAULT_LIMIT);
    return {
      data: plainToInstance(ListFilesResponseDto, files, {
        excludeExtraneousValues: true,
      }),
    };
  }
}
