import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ResetPasswordDto {
  @IsString()
  @MinLength(20)
  token!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}

export class ResetPasswordByOtpDto {
  @Transform(({ value }: { value: string }) => value?.trim().toLowerCase())
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsString()
  @MinLength(4)
  @MaxLength(10)
  code!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}

export class ForgotPasswordRequestOptionsDto {
  @Transform(({ value }: { value: string }) => value?.trim().toLowerCase())
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsOptional()
  sendLink?: boolean;

  @IsOptional()
  sendOtp?: boolean;
}
