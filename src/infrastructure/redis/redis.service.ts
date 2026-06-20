import { Injectable, Logger } from '@nestjs/common';
import { CachePort } from '@/infrastructure/redis/redis.types';
import { RedisAdapter } from '@/infrastructure/redis/redis.adapter';

@Injectable()
export class RedisService implements CachePort {
  private readonly logger = new Logger(RedisService.name);

  constructor(private readonly redisAdapter: RedisAdapter) {}

  async get<T>(key: string): Promise<T | null> {
    try {
      const client = await this.redisAdapter.getClient();
      const data = await client.get(key);
      return this.parse<T>(data, key);
    } catch (error) {
      const trace = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Redis get failed for key: ${key}`, trace);
      throw error;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    try {
      const client = await this.redisAdapter.getClient();
      const defaultTtl = this.redisAdapter.getTtl();
      await client.set(
        key,
        JSON.stringify(value),
        'EX',
        ttlSeconds ?? defaultTtl,
      );
    } catch (error) {
      const trace = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Redis set failed for key: ${key}`, trace);
      throw error;
    }
  }

  async del(key: string): Promise<void> {
    try {
      const client = await this.redisAdapter.getClient();
      await client.del(key);
    } catch (error) {
      const trace = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Redis delete failed for key: ${key}`, trace);
      throw error;
    }
  }

  private parse<T>(value: string | null | undefined, key: string): T | null {
    if (!value) {
      return null;
    }

    try {
      return JSON.parse(value) as T;
    } catch {
      this.logger.warn(`Failed to parse cached payload for key: ${key}`);
      return null;
    }
  }
}
