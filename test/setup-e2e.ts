import { config } from 'dotenv';

config({ quiet: true });

// Keep OpenTelemetry from exporting (and blocking shutdown) during tests.
process.env.OTEL_SDK_DISABLED ??= 'true';
process.env.OTEL_LOGS_ENABLED ??= 'false';
