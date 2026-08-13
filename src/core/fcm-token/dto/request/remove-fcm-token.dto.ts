import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength } from 'class-validator';

export class RemoveFcmTokenDto {
  @Transform(({ value }: { value: string }) => value?.trim())
  @IsString()
  @Matches(/^[\w:-]+$/)
  @MaxLength(1024)
  @ApiProperty()
  token!: string;
}
