import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

@Exclude()
export class LivenessResponseDto {
  @Expose()
  @ApiProperty({ enum: ['ok'] })
  status!: 'ok';

  @Expose()
  @ApiProperty()
  uptimeSeconds!: number;

  @Expose()
  @ApiProperty()
  timestamp!: string;
}
