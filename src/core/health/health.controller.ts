import { Controller, Get } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { HealthService } from '@/core/health/health.service';

@Controller({ path: 'health', version: '1' })
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /** Liveness probe */
  @Get('liveness')
  @ApiOperation({ summary: 'Liveness probe' })
  liveness() {
    return this.healthService.checkLiveness();
  }

  /** Readiness probe */
  @Get('readiness')
  @ApiOperation({ summary: 'Readiness probe' })
  readiness() {
    return this.healthService.checkReadiness();
  }
}
