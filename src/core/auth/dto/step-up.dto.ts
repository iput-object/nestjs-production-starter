import { IsString, MinLength, MaxLength } from 'class-validator';

export class DisableTwoFactorDto {
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  currentPassword!: string;
}

export class RegenerateBackupCodesDto {
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  currentPassword!: string;
}
