import {
  Global,
  Logger,
  Module,
  OnModuleInit,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { otelSdk } from '@/infrastructure/observability/tracing.bootstrap';
import { buildLoggerOptions } from '@/infrastructure/observability/logger.config';
import { MetricsService } from '@/infrastructure/observability/metrics.service';
import { MetricsInterceptor } from '@/infrastructure/observability/metrics.interceptor';
import type { Config } from '@/configs/environment.config';

@Global()
@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService<Config, true>) =>
        buildLoggerOptions({
          app: configService.get('app', { infer: true }),
          observability: configService.get('observability', { infer: true }),
        }),
    }),
  ],
  providers: [
    MetricsService,
    {
      provide: APP_INTERCEPTOR,
      useClass: MetricsInterceptor,
    },
  ],
  exports: [LoggerModule, MetricsService],
})
export class ObservabilityModule
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly logger = new Logger(ObservabilityModule.name);
  constructor(private readonly configService: ConfigService<Config, true>) {}

  onModuleInit(): void {
    const app = this.configService.get('app', { infer: true });
    const observability = this.configService.get('observability', {
      infer: true,
    });

    if (
      app.nodeEnv === 'production' &&
      observability.logsEnabled &&
      /(localhost|127\.0\.0\.1)/i.test(observability.otlpEndpoint)
    ) {
      this.logger.warn(
        'OTEL log export is enabled in production but OTEL_EXPORTER_OTLP_ENDPOINT points to localhost. This usually means logs will not reach your external collector.',
      );
    }
  }

  async onApplicationShutdown(): Promise<void> {
    try {
      await otelSdk.shutdown();
    } catch (err) {
      this.logger.error('Failed to shut down OpenTelemetry SDK', err);
    }
  }
}
