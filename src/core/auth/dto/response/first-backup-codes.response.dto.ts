import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

@Exclude()
export class FirstBackupCodesResponseDto {
  @Expose()
  @ApiProperty({ type: String, isArray: true })
  backupCodes!: string[];
}
