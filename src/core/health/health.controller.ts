import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';
import { LivenessResponseDto } from '@/core/health/dto/response/liveness.response.dto';
import { ReadinessResponseDto } from '@/core/health/dto/response/readiness.response.dto';
import { HealthService } from '@/core/health/health.service';

@Controller({ path: 'health', version: '1' })
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /** Liveness probe */
  @Get('liveness')
  @ApiOperation({ summary: 'Liveness probe' })
  @ApiOkResponse({ type: LivenessResponseDto })
  liveness() {
    return plainToInstance(
      LivenessResponseDto,
      this.healthService.checkLiveness(),
      { excludeExtraneousValues: true },
    );
  }

  /** Readiness probe */
  @Get('readiness')
  @ApiOperation({ summary: 'Readiness probe' })
  @ApiOkResponse({ type: ReadinessResponseDto })
  async readiness() {
    const readiness = await this.healthService.checkReadiness();
    return plainToInstance(ReadinessResponseDto, readiness, {
      excludeExtraneousValues: true,
    });
  }
}
