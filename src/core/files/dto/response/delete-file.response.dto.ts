import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

@Exclude()
export class DeleteFileResponseDto {
  @Expose()
  @ApiProperty()
  id!: string;
}
