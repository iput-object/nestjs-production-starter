import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

@Exclude()
export class BackupCodesResponseDto {
  @Expose()
  @ApiProperty({ type: String, isArray: true })
  codes!: string[];
}
