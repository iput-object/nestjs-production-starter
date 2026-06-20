import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import { tap } from 'rxjs';
import type { Request, Response } from 'express';
import { MetricsService } from '@/infrastructure/observability/metrics.service';

/**
 * Records http_requests_total / http_errors_total / http_request_duration_ms
 * for every HTTP request. Skips non-HTTP execution contexts (rpc, ws).
 */
@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const startedAt = process.hrtime.bigint();
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    const finalize = (statusOverride?: number): void => {
      const durationMs =
        Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      const route =
        (request.route as { path?: string } | undefined)?.path ??
        request.originalUrl ??
        request.url;
      this.metrics.recordHttpRequest(
        {
          'http.request.method': request.method,
          'http.route': route,
          'http.response.status_code': statusOverride ?? response.statusCode,
        },
        durationMs,
      );
    };

    return next.handle().pipe(
      tap({
        next: () => finalize(),
        error: (err: unknown) => {
          const status =
            typeof err === 'object' &&
            err !== null &&
            'status' in err &&
            typeof err.status === 'number'
              ? (err as { status: number }).status
              : 500;
          finalize(status);
        },
      }),
    );
  }
}
