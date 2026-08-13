import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsPhoneNumber, IsString, MaxLength, MinLength } from 'class-validator';

export class ConfirmPhoneVerificationOtpDto {
  @Transform(({ value }: { value?: string }) => value?.trim())
  @IsPhoneNumber()
  @ApiProperty()
  phone!: string;

  @IsString()
  @MinLength(4)
  @MaxLength(10)
  @ApiProperty()
  code!: string;
}

/** Authenticated confirm — phone is taken from the session user. */
export class ConfirmPhoneVerificationSessionOtpDto {
  @IsString()
  @MinLength(4)
  @MaxLength(10)
  @ApiProperty()
  code!: string;
}

export class ResendPhoneVerificationDto {
  @Transform(({ value }: { value?: string }) => value?.trim())
  @IsPhoneNumber()
  @ApiProperty()
  phone!: string;
}
