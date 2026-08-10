import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { AUDIT_PIPELINE } from '@/common/audit/constants/audit.constants';
import { ActivityRepository } from '@/common/audit/repositories/activity.repository';
import { AuditBufferService } from '@/common/audit/services/audit-buffer.service';
import type { AuditActivityRow } from '@/common/audit/types/audit.types';
import {
  AUDIT_JOB_BULK,
  AUDIT_JOB_FLUSH,
  AUDIT_QUEUE,
} from '@/infrastructure/queue/queue.constants';
import type {
  AuditBulkJobData,
  AuditFlushJobData,
} from '@/infrastructure/queue/queue.types';

@Processor(AUDIT_QUEUE)
export class AuditProcessor extends WorkerHost {
  private readonly logger = new Logger(AuditProcessor.name);

  constructor(
    private readonly buffer: AuditBufferService,
    private readonly activities: ActivityRepository,
  ) {
    super();
  }

  async process(job: Job<AuditFlushJobData | AuditBulkJobData>): Promise<void> {
    try {
      if (job.name === AUDIT_JOB_BULK) {
        const { rows } = job.data as AuditBulkJobData;
        await this.persist(rows);
        return;
      }

      if (job.name === AUDIT_JOB_FLUSH) {
        await this.flushInbox();
        return;
      }

      this.logger.warn(`Unknown audit job name: ${job.name}`);
    } catch (error) {
      this.logger.error(
        `Audit job ${job.id} failed (attempt ${job.attemptsMade + 1}/${job.opts.attempts ?? 1})`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  private async flushInbox(): Promise<void> {
    for (;;) {
      const rows = await this.buffer.drain(AUDIT_PIPELINE.batchSize);
      if (rows.length === 0) {
        return;
      }
      await this.persist(rows);
      if (rows.length < AUDIT_PIPELINE.batchSize) {
        return;
      }
    }
  }

  private async persist(rows: AuditActivityRow[]): Promise<void> {
    if (rows.length === 0) {
      return;
    }
    const result = await this.activities.createMany(
      rows.map((row) => ({
        module: row.module,
        action: row.action,
        outcome: row.outcome,
        userId: row.userId,
        resourceType: row.resourceType,
        resourceId: row.resourceId,
        ipAddress: row.ipAddress,
        userAgent: row.userAgent,
        requestId: row.requestId,
        metadata: row.metadata,
        createdAt: new Date(row.createdAt),
      })),
    );
    this.logger.debug(`Bulk-inserted ${result.count} audit rows`);
  }
}
