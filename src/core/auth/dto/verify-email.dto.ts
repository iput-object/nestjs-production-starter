import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RequestEmailVerificationDto {
  @Transform(({ value }: { value: string }) => value?.trim().toLowerCase())
  @IsEmail()
  @MaxLength(320)
  email!: string;
}

export class ConfirmEmailVerificationDto {
  @IsString()
  @MinLength(20)
  token!: string;
}

export class ConfirmEmailVerificationOtpDto {
  @Transform(({ value }: { value: string }) => value?.trim().toLowerCase())
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsString()
  @MinLength(4)
  @MaxLength(10)
  code!: string;
}

export class ResendEmailVerificationDto {
  @Transform(({ value }: { value: string }) => value?.trim().toLowerCase())
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsOptional()
  sendLink?: boolean;

  @IsOptional()
  sendOtp?: boolean;
}
