import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class SudoDto {
  @ApiProperty({ enum: ['password', 'totp', 'email_otp', 'sms_otp'] })
  @IsEnum(['password', 'totp', 'email_otp', 'sms_otp'])
  method: 'password' | 'totp' | 'email_otp' | 'sms_otp';

  @ApiPropertyOptional({ description: 'Required if method is password' })
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @ApiPropertyOptional({ description: 'Required if method is an OTP/TOTP' })
  @IsOptional()
  @IsString()
  code?: string;
}
