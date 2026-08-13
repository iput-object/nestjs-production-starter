import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsPhoneNumber,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class EnrollEmailOtpDto {
  @IsOptional()
  @Transform(({ value }: { value: string }) => value?.trim().toLowerCase())
  @IsEmail()
  @MaxLength(320)
  @ApiPropertyOptional()
  email?: string;
}

export class EnrollSmsOtpDto {
  @IsOptional()
  @IsPhoneNumber(undefined)
  @MaxLength(32)
  @ApiPropertyOptional()
  phone?: string;
}

export class ConfirmEnrollmentDto {
  @IsString()
  @Matches(/^\d{4,10}$/)
  @ApiProperty()
  code!: string;
}
