import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class ForgotPasswordDto {
  @Transform(({ value }: { value: string }) => value?.trim().toLowerCase())
  @IsEmail()
  @MaxLength(320)
  email!: string;
}

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
