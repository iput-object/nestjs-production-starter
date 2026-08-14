import { Inject, Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { AUDIT_PIPELINE } from '@/core/audit/constants/audit.constants';
import type { AuditActivityRow } from '@/core/audit/types/audit.types';
import { REDIS_CLIENT } from '@/infrastructure/redis/redis.constants';

@Injectable()
export class AuditBufferService {
  private readonly logger = new Logger(AuditBufferService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async push(rows: AuditActivityRow[]): Promise<number> {
    if (rows.length === 0) {
      return this.length();
    }
    const payloads = rows.map((row) => JSON.stringify(row));
    await this.redis.lpush(AUDIT_PIPELINE.bufferKey, ...payloads);
    return this.length();
  }

  async length(): Promise<number> {
    return this.redis.llen(AUDIT_PIPELINE.bufferKey);
  }

  async drain(limit = AUDIT_PIPELINE.batchSize): Promise<AuditActivityRow[]> {
    if (limit <= 0) {
      return [];
    }

    const pipeline = this.redis.pipeline();
    for (let i = 0; i < limit; i += 1) {
      pipeline.rpop(AUDIT_PIPELINE.bufferKey);
    }
    const results = await pipeline.exec();
    if (!results) {
      return [];
    }

    const rows: AuditActivityRow[] = [];
    for (const [err, value] of results) {
      if (err) {
        this.logger.warn(`Audit buffer RPOP failed: ${err.message}`);
        continue;
      }
      if (typeof value !== 'string') {
        continue;
      }
      try {
        rows.push(JSON.parse(value) as AuditActivityRow);
      } catch {
        this.logger.warn('Dropped malformed audit buffer payload');
      }
    }
    return rows;
  }
}
