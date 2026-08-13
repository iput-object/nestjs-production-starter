import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose, Type } from 'class-transformer';
import { FileResponseDto } from '@/core/files/dto/response/file.response.dto';

@Exclude()
export class FileItemResponseDto {
  @Expose()
  @Type(() => FileResponseDto)
  @ApiProperty({ type: () => FileResponseDto })
  file!: FileResponseDto;
}
