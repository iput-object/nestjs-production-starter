import { randomUUID } from 'node:crypto';
import { trace, context } from '@opentelemetry/api';
import type { Params } from 'nestjs-pino';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { serviceName } from '@/infrastructure/observability/service-identity';
import type { Config } from '@/configs/environment.config';

type LoggerConfigSlice = Pick<Config, 'app' | 'observability'>;

const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'req.headers["x-auth-token"]',
  'req.body.password',
  'req.body.passwordConfirmation',
  'req.body.currentPassword',
  'req.body.newPassword',
  'req.body.token',
  'req.body.refreshToken',
];

/**
 * Inject the active OTel span identifiers into every log record so downstream observability tools can
 * correlate logs and traces. Returns empty when no span is active.
 */
const otelMixin = (): Record<string, string> => {
  const span = trace.getSpan(context.active());
  if (!span) return {};
  const ctx = span.spanContext();
  return {
    trace_id: ctx.traceId,
    span_id: ctx.spanId,
    trace_flags: `0${ctx.traceFlags.toString(16)}`,
  };
};

/**
 * Build the nestjs-pino options object. Pretty transport is only enabled in
 * non-production environments — production emits raw JSON for log
 * shippers to parse.
 */
export const buildLoggerOptions = (config: LoggerConfigSlice): Params => {
  const isProduction = config.app.nodeEnv === 'production';
  const level = config.observability.logLevel;
  const otelLogsEnabled = config.observability.logsEnabled;

  return {
    pinoHttp: {
      level,
      mixin: otelMixin,
      genReqId: (req: IncomingMessage, res: ServerResponse) => {
        const existing =
          (req.headers['x-request-id'] as string | undefined) ??
          (req.headers['x-correlation-id'] as string | undefined);
        const id = existing ?? randomUUID();
        res.setHeader('x-request-id', id);
        return id;
      },
      redact: {
        paths: REDACT_PATHS,
        censor: '[REDACTED]',
      },
      customProps: () => ({
        service: serviceName,
      }),
      serializers: {
        req: (
          req: IncomingMessage & { id?: string; raw?: IncomingMessage },
        ) => ({
          id: req.id,
          method: req.method,
          url: req.url,
          remoteAddress: req.socket?.remoteAddress,
        }),
        res: (res: ServerResponse) => ({
          statusCode: res.statusCode,
        }),
      },
      transport: (() => {
        const stdoutTarget = isProduction
          ? { target: 'pino/file', options: { destination: 1 }, level }
          : {
              target: 'pino-pretty',
              level,
              options: {
                colorize: true,
                singleLine: false,
                translateTime: 'SYS:HH:MM:ss.l',
                ignore: 'pid,hostname,service',
              },
            };

        if (!otelLogsEnabled) {
          return { targets: [stdoutTarget] };
        }

        return {
          targets: [
            stdoutTarget,
            {
              target: 'pino-opentelemetry-transport',
              level,
              options: {
                loggerName: serviceName,
                resourceAttributes: {
                  'service.name': serviceName,
                },
              },
            },
          ],
        };
      })(),
    },
  };
};
