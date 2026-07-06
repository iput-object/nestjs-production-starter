import { Module } from '@nestjs/common';
import { FilesController } from '@/core/files/files.controller';
import { FileObjectRepository } from '@/core/files/repositories/file-object.repository';
import { CreateUploadUrlService } from '@/core/files/services/create-upload-url.service';
import { ConfirmUploadService } from '@/core/files/services/confirm-upload.service';
import { DownloadUrlService } from '@/core/files/services/download-url.service';
import { DeleteFileService } from '@/core/files/services/delete-file.service';
import { ListFilesService } from '@/core/files/services/list-files.service';

@Module({
  controllers: [FilesController],
  providers: [
    FileObjectRepository,
    CreateUploadUrlService,
    ConfirmUploadService,
    DownloadUrlService,
    DeleteFileService,
    ListFilesService,
  ],
  exports: [FileObjectRepository],
})
export class FilesModule {}
