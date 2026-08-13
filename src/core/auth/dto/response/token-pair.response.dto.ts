import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

@Exclude()
export class TokenPairResponseDto {
  @Expose()
  @ApiProperty()
  token!: string;

  @Expose()
  @ApiProperty()
  expiresAt!: Date;
}
