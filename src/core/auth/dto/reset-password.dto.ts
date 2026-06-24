import { Transform } from 'class-transformer';
import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import type { ResetChannel } from '@/core/auth/services/auth-cache.service';

export class ForgotPasswordChannelsDto {
  // Email or phone — the service resolves which and lists reset channels.
  @Transform(({ value }: { value: string }) => value?.trim())
  @IsString()
  @MinLength(3)
  @MaxLength(320)
  identifier!: string;
}

export class SendResetOtpDto {
  @IsString()
  @MinLength(20)
  requestId!: string;

  @IsIn(['email', 'sms'])
  channel!: ResetChannel;
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
  @IsString()
  @MinLength(20)
  requestId!: string;

  @IsString()
  @MinLength(4)
  @MaxLength(10)
  code!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}
