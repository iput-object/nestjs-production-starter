import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

@Exclude()
export class DependencyChecksResponseDto {
  @Expose()
  @ApiProperty({ enum: ['up', 'down'] })
  database!: 'up' | 'down';

  @Expose()
  @ApiProperty({ enum: ['up', 'down'] })
  redis!: 'up' | 'down';
}
