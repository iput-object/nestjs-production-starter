import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';
import { RedisAdapter } from '@/infrastructure/redis/redis.adapter';

type DependencyStatus = 'up' | 'down';

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redisAdapter: RedisAdapter,
  ) {}

  async checkReadiness(): Promise<{
    status: 'ok';
    checks: { database: DependencyStatus; redis: DependencyStatus };
    uptimeSeconds: number;
    timestamp: string;
  }> {
    const checks: { database: DependencyStatus; redis: DependencyStatus } = {
      database: 'down',
      redis: 'down',
    };

    try {
      const prismaClient = this.prisma as unknown as {
        $queryRaw: (query: TemplateStringsArray) => Promise<unknown>;
      };
      await prismaClient.$queryRaw`SELECT 1`;
      checks.database = 'up';

      const redisClient = await this.redisAdapter.getClient();
      await redisClient.ping();
      checks.redis = 'up';
    } catch {
      throw new ServiceUnavailableException({
        status: 'error',
        checks,
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
      });
    }

    return {
      status: 'ok',
      checks,
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  checkLiveness(): { status: 'ok'; uptimeSeconds: number; timestamp: string } {
    return {
      status: 'ok',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
