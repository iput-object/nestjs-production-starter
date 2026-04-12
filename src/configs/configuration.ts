import { z } from 'zod';

const envSchema = z.object({
  app: z.object({
    name: z.string().trim().min(1).default('nest-prisma-template'),
    port: z.coerce.number().int().min(1).max(65535).default(3000),
    nodeEnv: z
      .enum(['development', 'production', 'test'])
      .default('development'),
    debug: z.boolean().default(false),
    url: z.string().url().optional(),
  }),
  database: z.object({
    url: z.string().url(),
    poolSize: z.coerce.number().int().positive().default(10),
  }),
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
    },
    database: {
      url: process.env.DATABASE_URL,
      poolSize: process.env.DATABASE_POOL_SIZE,
    },
  });

export type Config = z.infer<typeof envSchema>;
