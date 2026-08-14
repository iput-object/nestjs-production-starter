import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

@Exclude()
export class SudoStatusResponseDto {
  @Expose()
  @ApiProperty()
  active!: boolean;

  @Expose()
  @ApiPropertyOptional({ nullable: true, type: Number })
  expiresAt!: number | null;

  @Expose()
  @ApiPropertyOptional({
    nullable: true,
    enum: ['password', 'otp', '2fa'],
  })
  method!: 'password' | 'otp' | '2fa' | null;
}
