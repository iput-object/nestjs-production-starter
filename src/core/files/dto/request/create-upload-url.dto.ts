import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { FileVisibility } from '@prisma-client';
import { ALLOWED_CONTENT_TYPES } from '@/core/files/files.constants';

export class CreateUploadUrlDto {
  @Transform(({ value }: { value?: string }) => value?.trim())
  @IsString()
  @MaxLength(255)
  @ApiProperty()
  filename!: string;

  @Transform(({ value }: { value?: string }) => value?.trim().toLowerCase())
  @IsString()
  @IsIn(ALLOWED_CONTENT_TYPES)
  @ApiProperty({ enum: ALLOWED_CONTENT_TYPES })
  contentType!: string;

  @IsInt()
  @Min(1)
  @ApiProperty()
  size!: number;

  @IsOptional()
  @IsEnum(FileVisibility)
  @ApiPropertyOptional({ enum: FileVisibility })
  visibility?: FileVisibility;
}
