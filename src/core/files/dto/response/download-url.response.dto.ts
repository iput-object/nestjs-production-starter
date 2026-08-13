import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

@Exclude()
export class DownloadUrlResponseDto {
  @Expose()
  @ApiProperty()
  url!: string;

  @Expose()
  @ApiPropertyOptional()
  expiresIn?: number;
}
