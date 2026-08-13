import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose, Transform } from 'class-transformer';
import {
  DEVICE_PLATFORM_API_VALUES,
  DEVICE_PLATFORM_TO_API,
  type DevicePlatformApiValue,
} from '@/core/fcm-token/constants/device-platform.constants';

@Exclude()
export class FcmTokenResponseDto {
  @Expose()
  @ApiProperty()
  id!: string;

  @Expose()
  @ApiProperty()
  userId!: string;

  @Expose()
  @ApiProperty()
  token!: string;

  @Expose()
  @ApiProperty()
  deviceId!: string;

  @Expose()
  @Transform(
    ({ value }) =>
      DEVICE_PLATFORM_TO_API[value as keyof typeof DEVICE_PLATFORM_TO_API],
    { toClassOnly: true },
  )
  @ApiProperty({ enum: DEVICE_PLATFORM_API_VALUES })
  platform!: DevicePlatformApiValue;

  @Expose()
  @Transform(({ value }: { value: Date }) => value.toISOString(), {
    toClassOnly: true,
  })
  @ApiProperty()
  lastSeenAt!: string;
}
