import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

@Exclude()
export class EmailChangeResponseDto {
  @Expose()
  @ApiProperty()
  userId!: string;

  @Expose()
  @ApiProperty()
  email!: string;
}
