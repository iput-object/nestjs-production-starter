// IMPORTANT: this MUST be the very first import. The OpenTelemetry SDK patches
// modules at require()-time via auto-instrumentation; anything imported above
// this line will be invisible to traces.
import '@/infrastructure/observability/tracing.bootstrap';

import type { Server } from 'node:http';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { setupSwagger } from '@/configs/swagger.config';
import type { Config } from '@/configs/environment.config';
import { RedisIoAdapter } from '@/infrastructure/redis/redis-io.adapter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  const config = app.get(ConfigService<Config, true>);
  const logger = app.get(Logger);

  // API PREFIX AND VERSION
  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  app.enableShutdownHooks(['SIGINT', 'SIGTERM']);
  // CSP is left to the frontend (this API serves JSON, and helmet's default CSP
  // breaks the Swagger UI); CORP is relaxed so the browser SPA can call the API
  // cross-origin. The useful headers (HSTS, nosniff, no X-Powered-By) stay on.
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(cookieParser());
  // Web clients send the auth cookie cross-origin, which requires a concrete
  // origin (not `*`) plus credentials. Mobile clients don't use CORS.
  const appConfig = config.getOrThrow('app', { infer: true });
  app.enableCors({
    origin: appConfig.frontendUrl,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  if (appConfig.nodeEnv !== 'production') {
    await setupSwagger(app);
  }

  const redisIoAdapter = new RedisIoAdapter(app);
  await redisIoAdapter.connectToRedis();
  app.useWebSocketAdapter(redisIoAdapter);

  const httpServer = app.getHttpServer() as Server;
  httpServer.once('close', () => {
    void redisIoAdapter.close();
  });
  // Graceful connection draining settings suitable for containerized deploys.
  httpServer.keepAliveTimeout = 61_000;
  httpServer.headersTimeout = 65_000;

  await app.listen(appConfig.port);

  logger.log(`API  ready at ${appConfig.url}/api/v1`);
  if (appConfig.nodeEnv !== 'production') {
    logger.log(`Docs ready at ${appConfig.url}/api/docs`);
  }
}

void bootstrap();
