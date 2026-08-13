import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

@Exclude()
export class SessionResponseDto {
  @Expose()
  @ApiProperty()
  id!: string;

  @Expose()
  @ApiProperty({ nullable: true })
  ipAddress!: string | null;

  @Expose()
  @ApiProperty({ nullable: true })
  userAgent!: string | null;

  @Expose()
  @ApiProperty({ nullable: true })
  deviceId!: string | null;

  @Expose()
  @ApiProperty({ nullable: true })
  deviceLabel!: string | null;

  @Expose()
  @ApiProperty()
  createdAt!: Date;

  @Expose()
  @ApiProperty()
  expiresAt!: Date;

  @Expose()
  @ApiProperty()
  current!: boolean;
}
