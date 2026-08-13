import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose, Type } from 'class-transformer';
import { FileResponseDto } from '@/core/files/dto/response/file.response.dto';
import { PresignedUploadResponseDto } from '@/core/files/dto/response/presigned-upload.response.dto';

@Exclude()
export class CreateUploadUrlResponseDto {
  @Expose()
  @Type(() => FileResponseDto)
  @ApiProperty({ type: () => FileResponseDto })
  file!: FileResponseDto;

  @Expose()
  @Type(() => PresignedUploadResponseDto)
  @ApiProperty({ type: () => PresignedUploadResponseDto })
  upload!: PresignedUploadResponseDto;
}
