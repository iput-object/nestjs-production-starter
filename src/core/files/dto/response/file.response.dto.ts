import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';
import { FileStatus, FileVisibility } from '@prisma-client';

@Exclude()
export class FileResponseDto {
  @Expose()
  @ApiProperty()
  id!: string;

  @Expose()
  @ApiProperty()
  key!: string;

  @Expose()
  @ApiProperty()
  contentType!: string;

  @Expose()
  @ApiProperty({ nullable: true })
  size!: number | null;

  @Expose()
  @ApiProperty({ nullable: true })
  originalName!: string | null;

  @Expose()
  @ApiProperty({ enum: FileStatus })
  status!: FileStatus;

  @Expose()
  @ApiProperty({ enum: FileVisibility })
  visibility!: FileVisibility;

  @Expose()
  @ApiProperty()
  createdAt!: Date;
}
