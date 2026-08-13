import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';
import { IdentifierType } from '@prisma-client';

@Exclude()
export class IdentifierResponseDto {
  @Expose()
  @ApiProperty()
  id!: string;

  @Expose()
  @ApiProperty({ enum: IdentifierType })
  type!: IdentifierType;

  @Expose()
  @ApiProperty()
  value!: string;

  @Expose()
  @ApiProperty()
  isPrimary!: boolean;

  @Expose()
  @ApiProperty()
  isVerified!: boolean;

  @Expose()
  @ApiProperty({ nullable: true })
  verifiedAt!: Date | null;

  @Expose()
  @ApiProperty()
  createdAt!: Date;
}
