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
  filename!: string;

  @Transform(({ value }: { value?: string }) => value?.trim().toLowerCase())
  @IsString()
  @IsIn(ALLOWED_CONTENT_TYPES)
  contentType!: string;

  @IsInt()
  @Min(1)
  size!: number;

  @IsOptional()
  @IsEnum(FileVisibility)
  visibility?: FileVisibility;
}
