import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@/core/auth/guards/jwt.guard';
import { VerifiedGuard } from '@/core/auth/guards/verified.guard';
import { CurrentUser } from '@/core/auth/decorators/current-user.decorator';
import { TokenType } from '@/core/auth/decorators/token-type.decorator';
import type { JwtPayload } from '@/core/auth/types/jwt-payload.type';
import { CompleteUploadResponseDto } from '@/core/files/dto/response/complete-upload.response.dto';
import { GetDownloadUrlResponseDto } from '@/core/files/dto/response/get-download-url.response.dto';
import { ListFilesResponseDto } from '@/core/files/dto/response/list-files.response.dto';
import { RemoveFileResponseDto } from '@/core/files/dto/response/remove-file.response.dto';
import { RequestUploadUrlResponseDto } from '@/core/files/dto/response/request-upload-url.response.dto';
import { CreateUploadUrlDto } from '@/core/files/dto/request/create-upload-url.dto';
import { CreateUploadUrlService } from '@/core/files/services/create-upload-url.service';
import { ConfirmUploadService } from '@/core/files/services/confirm-upload.service';
import { DownloadUrlService } from '@/core/files/services/download-url.service';
import { DeleteFileService } from '@/core/files/services/delete-file.service';
import { ListFilesService } from '@/core/files/services/list-files.service';

@Controller({ path: 'files', version: '1' })
@UseGuards(JwtAuthGuard, VerifiedGuard)
@TokenType('access')
export class FilesController {
  constructor(
    private readonly createUploadUrl: CreateUploadUrlService,
    private readonly confirmUpload: ConfirmUploadService,
    private readonly downloadUrl: DownloadUrlService,
    private readonly deleteFile: DeleteFileService,
    private readonly listFiles: ListFilesService,
  ) {}

  /** Issue a presigned URL for the client to upload a file directly to storage */
  @Post('upload-url')
  @ApiOperation({ summary: 'Get a presigned upload URL' })
  @ApiCreatedResponse({ type: RequestUploadUrlResponseDto })
  requestUploadUrl(
    @CurrentUser() user: JwtPayload,
    @Body() payload: CreateUploadUrlDto,
  ) {
    return this.createUploadUrl.execute(user.sub, payload);
  }

  /** Confirm a previously issued upload actually landed in storage */
  @Post(':id/complete')
  @ApiOperation({ summary: 'Confirm an upload completed' })
  @ApiCreatedResponse({ type: CompleteUploadResponseDto })
  complete(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.confirmUpload.execute(user.sub, id);
  }

  /** Issue a presigned URL to download a private file */
  @Get(':id/download-url')
  @ApiOperation({ summary: 'Get a presigned download URL' })
  @ApiOkResponse({ type: GetDownloadUrlResponseDto })
  getDownloadUrl(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.downloadUrl.execute(user.sub, id);
  }

  /** List the caller's files */
  @Get()
  @ApiOperation({ summary: "List the caller's files" })
  @ApiOkResponse({ type: ListFilesResponseDto, isArray: true })
  list(@CurrentUser() user: JwtPayload) {
    return this.listFiles.execute(user.sub);
  }

  /** Delete a file from storage and drop its metadata */
  @Delete(':id')
  @ApiOperation({ summary: 'Delete a file' })
  @ApiOkResponse({ type: RemoveFileResponseDto })
  remove(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.deleteFile.execute(user.sub, id);
  }
}
