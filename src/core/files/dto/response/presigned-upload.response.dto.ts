import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

@Exclude()
export class PresignedUploadResponseDto {
  @Expose()
  @ApiProperty()
  url!: string;

  @Expose()
  @ApiProperty({ enum: ['PUT'] })
  method!: 'PUT';

  @Expose()
  @ApiProperty()
  bucket!: string;

  @Expose()
  @ApiProperty()
  key!: string;

  @Expose()
  @ApiProperty({ type: 'object', additionalProperties: { type: 'string' } })
  headers!: Record<string, string>;

  @Expose()
  @ApiProperty()
  expiresIn!: number;
}
