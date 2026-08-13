import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ForgotPasswordDto {
  /** Email or phone used to find the account. */
  @Transform(({ value }: { value: string }) => value?.trim())
  @IsString()
  @MinLength(3)
  @MaxLength(320)
  @ApiProperty()
  identifier!: string;
}

export class SendPasswordResetOtpDto {
  @IsString()
  @MinLength(10)
  @ApiProperty()
  resetId!: string;

  @IsString()
  @MinLength(10)
  @ApiProperty()
  channelId!: string;
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(20)
  @ApiProperty()
  token!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @ApiProperty()
  password!: string;
}

export class ResetPasswordByOtpDto {
  @IsString()
  @MinLength(10)
  @ApiProperty()
  resetId!: string;

  @IsString()
  @MinLength(4)
  @MaxLength(10)
  @ApiProperty()
  code!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @ApiProperty()
  password!: string;
}
