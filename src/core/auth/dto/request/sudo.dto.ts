import { IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SudoDto {
  @ApiProperty({ description: 'Current account password for re-authentication' })
  @IsString()
  @MaxLength(128)
  password: string;
}
