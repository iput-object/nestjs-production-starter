import { IsString, MinLength, MaxLength } from 'class-validator';

export class DeactivateAccountDto {
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  currentPassword!: string;
}
