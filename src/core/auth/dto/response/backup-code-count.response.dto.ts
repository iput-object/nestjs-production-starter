import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

@Exclude()
export class BackupCodeCountResponseDto {
  @Expose()
  @ApiProperty()
  remaining!: number;
}
