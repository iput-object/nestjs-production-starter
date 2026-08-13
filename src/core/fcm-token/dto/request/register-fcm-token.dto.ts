import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import {
  DEVICE_PLATFORM_API_VALUES,
  type DevicePlatformApiValue,
} from '@/core/fcm-token/constants/device-platform.constants';

export class RegisterFcmTokenDto {
  @Transform(({ value }: { value: string }) => value?.trim())
  @IsString()
  @Matches(/^[\w:-]+$/)
  @MaxLength(1024)
  @ApiProperty()
  token!: string;

  @IsIn(DEVICE_PLATFORM_API_VALUES)
  @ApiProperty({ enum: DEVICE_PLATFORM_API_VALUES })
  platform!: DevicePlatformApiValue;

  @Transform(({ value }: { value: string }) => value?.trim())
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  @ApiProperty()
  deviceId!: string;
}
