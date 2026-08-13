import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { DependencyChecksResponseDto } from '@/core/health/dto/response/dependency-checks.response.dto';
import { LivenessResponseDto } from '@/core/health/dto/response/liveness.response.dto';

export class ReadinessResponseDto extends LivenessResponseDto {
  @Expose()
  @Type(() => DependencyChecksResponseDto)
  @ApiProperty({ type: () => DependencyChecksResponseDto })
  checks!: DependencyChecksResponseDto;
}
