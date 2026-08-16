/**
 * OpenTelemetry SDK bootstrap.
 *
 * IMPORTANT: this file MUST be the very first import in src/main.ts, before
 * @nestjs/core or any instrumented library is loaded. The auto-instrumentations
 * patch modules at require()-time, so anything imported earlier is invisible to
 * traces.
 *
 * Reads from process.env directly (ConfigService doesn't exist yet at this
 * point in the boot sequence):
 *   APP_NAME                     - resource attribute service.name
 *   SERVICE_VERSION              - resource attribute service.version (optional;
 *                                  falls back to package.json#version)
 *   NODE_ENV                     - resource attribute deployment.environment
 *   OTEL_EXPORTER_OTLP_ENDPOINT  - OTLP collector base URL (default localhost:4318)
 *
 * The base endpoint is suffixed with /v1/traces and /v1/metrics for OTLP HTTP.
 */
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';
import {
  serviceName,
  serviceVersion,
} from '@/infrastructure/observability/service-identity';

const environment = process.env.NODE_ENV?.trim() || 'development';
const otlpBase =
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim().replace(/\/+$/, '') ||
  'http://localhost:4318';

if (process.env.OTEL_LOG_LEVEL?.trim().toLowerCase() === 'debug') {
  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
}

const resource = resourceFromAttributes({
  [ATTR_SERVICE_NAME]: serviceName,
  [ATTR_SERVICE_VERSION]: serviceVersion,
  'deployment.environment.name': environment,
});

const traceExporter = new OTLPTraceExporter({
  url: `${otlpBase}/v1/traces`,
});

const metricReader = new PeriodicExportingMetricReader({
  exporter: new OTLPMetricExporter({
    url: `${otlpBase}/v1/metrics`,
  }),
  exportIntervalMillis: 30_000,
});

export const otelSdk = new NodeSDK({
  resource,
  traceExporter,
  metricReaders: [metricReader],
  instrumentations: [
    getNodeAutoInstrumentations({
      // Disable fs spans — extremely noisy and rarely useful.
      '@opentelemetry/instrumentation-fs': { enabled: false },
    }),
  ],
});

otelSdk.start();
