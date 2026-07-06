import { z } from 'zod';

const envSchema = z
  .object({
    app: z.object({
      name: z.string().trim().min(1).default('nest-prisma-template'),
      port: z.coerce.number().int().min(1).max(65535).default(3000),
      nodeEnv: z
        .enum(['development', 'production', 'test'])
        .default('development'),
      debug: z.boolean().default(false),
      url: z.url().optional(),
      frontendUrl: z.url().default('http://localhost:5173'),
      rateLimitTtl: z.coerce.number().int().positive().default(60),
      rateLimitLimit: z.coerce.number().int().positive().default(100),
    }),
    database: z.object({
      url: z.url(),
      poolSize: z.coerce.number().int().positive().default(10),
    }),
    redis: z.object({
      url: z.url(),
      ttlSeconds: z.coerce.number().int().positive().default(300),
      keyPrefix: z.string().trim().min(1).default('app:'),
    }),
    auth: z.object({
      jwtAccessSecret: z.string().trim().min(16),
      jwtAccessExpiresIn: z.string().trim().min(1).default('15m'),
      jwtRefreshSecret: z.string().trim().min(16),
      jwtRefreshExpiresIn: z.string().trim().min(1).default('30d'),
      // Cookie scoping for web clients. Empty domain => host-only cookie.
      cookieDomain: z
        .string()
        .trim()
        .optional()
        .transform((value) => value || undefined),
      cookieSameSite: z.enum(['lax', 'strict', 'none']).default('lax'),
      encryptionKey: z
        .string()
        .trim()
        .min(32, 'AUTH_ENCRYPTION_KEY must be 32 bytes (base64-encoded)'),
    }),
    totp: z.object({
      issuer: z.string().trim().min(1).default('NestPrismaTemplate'),
      window: z.coerce.number().int().nonnegative().default(1),
    }),
    mail: z.object({
      host: z.string().trim().min(1).default('smtp.gmail.com'),
      port: z.coerce.number().int().min(1).max(65535).default(587),
      secure: z.coerce.boolean().default(false),
      user: z.string().trim().min(1),
      pass: z.string().trim().min(1),
      from: z.string().trim().min(1),
    }),
    sms: z.object({
      accountSid: z.string().trim().optional(),
      authToken: z.string().trim().optional(),
      fromNumber: z.string().trim().optional(),
    }),
    storage: z.object({
      // S3 is optional. Leave bucket/keys unset to run without file storage —
      // the app boots fine and only the /files endpoints report 503.
      region: z.string().trim().min(1).default('us-east-1'),
      bucket: z.string().trim().min(1).optional(),
      accessKeyId: z.string().trim().min(1).optional(),
      secretAccessKey: z.string().trim().min(1).optional(),
      // Custom endpoint for S3-compatible stores (e.g. LocalStack). Unset =>
      // real AWS S3. forcePathStyle must be true for most non-AWS stores.
      endpoint: z.url().optional(),
      forcePathStyle: z.coerce.boolean().default(false),
      // Public base URL (CDN or bucket website) for PUBLIC objects; unset falls
      // back to a presigned GET even for public files.
      publicBaseUrl: z.url().optional(),
      uploadUrlTtlSeconds: z.coerce.number().int().positive().default(900),
      downloadUrlTtlSeconds: z.coerce.number().int().positive().default(900),
      // Hard ceiling on a single upload (DoS guard, enforced on the presign
      // request and mirrored in the DTO bound).
      maxUploadBytes: z.coerce
        .number()
        .int()
        .positive()
        .default(10 * 1024 * 1024),
    }),
    observability: z.object({
      // service.name comes from app.name (APP_NAME); service.version is derived
      // at boot from SERVICE_VERSION (optional override) or package.json#version.
      // Neither is restated here.
      logLevel: z
        .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
        .default('info'),
      otlpEndpoint: z.url().default('http://localhost:4318'),
      logsEnabled: z.coerce.boolean().default(true),
      logsProtocol: z
        .enum(['http/protobuf', 'grpc', 'http/json'])
        .default('http/protobuf'),
    }),
    oauth: z.object({
      google: z.object({
        // Comma-separated list of accepted audiences. The first entry is used
        // for issuing-side checks; the verifier accepts any. Supply at least
        // one (web/iOS/Android client IDs).
        clientIds: z
          .string()
          .trim()
          .optional()
          .transform((value) =>
            value
              ? value
                  .split(',')
                  .map((id) => id.trim())
                  .filter(Boolean)
              : [],
          ),
      }),
      apple: z.object({
        // Apple Service ID / bundle ID(s) that issued the ID token (audience).
        clientIds: z
          .string()
          .trim()
          .optional()
          .transform((value) =>
            value
              ? value
                  .split(',')
                  .map((id) => id.trim())
                  .filter(Boolean)
              : [],
          ),
      }),
    }),
  })
  .superRefine((cfg, ctx) => {
    const isProd = cfg.app.nodeEnv === 'production';
    if (!isProd) return;

    const weakMarkers = ['replace-with', 'changeme', 'example', 'password'];
    const hasWeakMarker = (value: string) =>
      weakMarkers.some((marker) => value.toLowerCase().includes(marker));

    if (hasWeakMarker(cfg.auth.jwtAccessSecret)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['auth', 'jwtAccessSecret'],
        message:
          'JWT_ACCESS_SECRET looks like a placeholder. Use a strong production secret.',
      });
    }

    if (hasWeakMarker(cfg.auth.jwtRefreshSecret)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['auth', 'jwtRefreshSecret'],
        message:
          'JWT_REFRESH_SECRET looks like a placeholder. Use a strong production secret.',
      });
    }

    if (hasWeakMarker(cfg.auth.encryptionKey)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['auth', 'encryptionKey'],
        message:
          'AUTH_ENCRYPTION_KEY looks like a placeholder. Use a real 32-byte base64 value.',
      });
    }

    if (
      cfg.storage.secretAccessKey &&
      hasWeakMarker(cfg.storage.secretAccessKey)
    ) {
      console.warn(
        'WARNING: S3_SECRET_ACCESS_KEY looks like a placeholder. Use a real IAM secret.',
      );
    }

    if (
      cfg.storage.endpoint &&
      /(localhost|127\.0\.0\.1)/i.test(cfg.storage.endpoint)
    ) {
      console.warn(
        'WARNING: S3_ENDPOINT points to localhost in production. Point it at AWS S3 (unset) or your production object store.',
      );
    }

    if (/(localhost|127\.0\.0\.1)/i.test(cfg.app.frontendUrl)) {
      console.warn(
        'WARNING: FRONTEND_URL points to localhost in production. Set the real frontend URL.',
      );
    }
  });

export default () =>
  envSchema.parse({
    app: {
      name: process.env.APP_NAME,
      port: process.env.PORT,
      nodeEnv: process.env.NODE_ENV,
      debug:
        process.env.NODE_ENV === 'development' || process.env.DEBUG === 'true',
      url: process.env.BACKEND_URL,
      frontendUrl: process.env.FRONTEND_URL,
      rateLimitTtl: process.env.RATE_LIMIT_TTL,
      rateLimitLimit: process.env.RATE_LIMIT_LIMIT,
    },
    database: {
      url: process.env.DATABASE_URL,
      poolSize: process.env.DATABASE_POOL_SIZE,
    },
    redis: {
      url: process.env.REDIS_URL,
      ttlSeconds: process.env.REDIS_TTL_SECONDS,
      keyPrefix: process.env.REDIS_KEY_PREFIX,
    },
    auth: {
      jwtAccessSecret: process.env.JWT_ACCESS_SECRET,
      jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN,
      jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
      jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN,
      cookieDomain: process.env.AUTH_COOKIE_DOMAIN,
      cookieSameSite: process.env.AUTH_COOKIE_SAME_SITE,
      encryptionKey: process.env.AUTH_ENCRYPTION_KEY,
    },
    totp: {
      issuer: process.env.TOTP_ISSUER,
      window: process.env.TOTP_WINDOW,
    },
    mail: {
      host: process.env.MAIL_HOST,
      port: process.env.MAIL_PORT,
      secure: process.env.MAIL_SECURE,
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASS,
      from: process.env.MAIL_FROM,
    },
    sms: {
      accountSid: process.env.TWILIO_ACCOUNT_SID,
      authToken: process.env.TWILIO_AUTH_TOKEN,
      fromNumber: process.env.TWILIO_FROM_NUMBER,
    },
    storage: {
      region: process.env.S3_REGION,
      bucket: process.env.S3_BUCKET,
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
      endpoint: process.env.S3_ENDPOINT,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE,
      publicBaseUrl: process.env.S3_PUBLIC_BASE_URL,
      uploadUrlTtlSeconds: process.env.S3_UPLOAD_URL_TTL_SECONDS,
      downloadUrlTtlSeconds: process.env.S3_DOWNLOAD_URL_TTL_SECONDS,
      maxUploadBytes: process.env.S3_MAX_UPLOAD_BYTES,
    },
    observability: {
      logLevel: process.env.LOG_LEVEL,
      otlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
      logsEnabled: process.env.OTEL_LOGS_ENABLED,
      logsProtocol: process.env.OTEL_EXPORTER_OTLP_LOGS_PROTOCOL,
    },
    oauth: {
      google: { clientIds: process.env.GOOGLE_CLIENT_IDS },
      apple: { clientIds: process.env.APPLE_CLIENT_IDS },
    },
  });

export type Config = z.infer<typeof envSchema>;
