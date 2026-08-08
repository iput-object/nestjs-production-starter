import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export enum DevicePlatform {
  IOS = 'ios',
  ANDROID = 'android',
  WEB = 'web',
}

export class RegisterFcmTokenDto {
  @Transform(({ value }: { value: string }) => value?.trim())
  @IsString()
  @Matches(/^[\w:-]+$/)
  @MaxLength(1024)
  token!: string;

  @IsEnum(DevicePlatform)
  platform!: DevicePlatform;

  @Transform(({ value }: { value: string }) => value?.trim())
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  deviceId!: string;
}
