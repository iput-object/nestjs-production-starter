import { Expose } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class SudoResponseDto {
  @ApiProperty({ description: 'Sudo-elevated short-lived access token' })
  @Expose()
  accessToken: string;

  @ApiProperty({ description: 'When the sudo token expires' })
  @Expose()
  expiresAt: Date;
}
