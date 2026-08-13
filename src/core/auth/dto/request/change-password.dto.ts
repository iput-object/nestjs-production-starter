import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @ApiProperty()
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @ApiProperty()
  newPassword!: string;
}
