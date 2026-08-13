import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';
import { Role } from '@prisma-client';

@Exclude()
export class AuthUserResponseDto {
  @Expose()
  @ApiProperty()
  id!: string;

  @Expose()
  @ApiProperty({ nullable: true })
  email!: string | null;

  @Expose()
  @ApiProperty({ nullable: true })
  name!: string | null;

  @Expose()
  @ApiProperty({ nullable: true })
  avatar!: string | null;

  @Expose()
  @ApiProperty({ enum: Role })
  role!: Role;

  @Expose()
  @ApiProperty({ nullable: true })
  phone!: string | null;

  @Expose()
  @ApiProperty()
  isAccountVerified!: boolean;
}
