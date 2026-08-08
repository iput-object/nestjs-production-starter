import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma-client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private readonly pool: Pool;

  constructor(private readonly config: ConfigService) {
    const pool = new Pool({
      connectionString: config.getOrThrow<string>('database.url'),
      max: config.get<number>('database.poolSize') ?? 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 2_000,
      statement_timeout: 10_000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10_000,
      ssl:
        config.get<boolean>('database.ssl') !== false
          ? { rejectUnauthorized: false }
          : undefined,
    });

    // must attach before super(), pool exists but 'this' isn't ready for logger yet —
    // so attach after construction, see onModuleInit note below
    const adapter = new PrismaPg(pool);
    super({ adapter });

    this.pool = pool;

    // safe to attach here — 'this' is bound, class fields assigned
    this.pool.on('error', (err) => {
      this.logger.error('Unexpected idle client error on pg pool', err);
      // do NOT rethrow — this is what prevents the process crash
    });
  }

  async onModuleInit(): Promise<void> {
    const maxRetries = 5;
    for (let i = 1; i <= maxRetries; i++) {
      try {
        await this.$connect();
        this.logger.log('Database connected');
        return;
      } catch (err) {
        this.logger.error(`DB connect attempt ${i}/${maxRetries} failed`, err);
        if (i === maxRetries) throw err;
        await new Promise((r) => setTimeout(r, 1000 * i));
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    await this.pool.end();
    this.logger.log('Database disconnected, pool closed');
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  getPoolStats() {
    return {
      total: this.pool.totalCount,
      idle: this.pool.idleCount,
      waiting: this.pool.waitingCount,
    };
  }
}
