import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import type { Activity } from '@prisma-client';
import { Queue } from 'bullmq';
import { AUDIT_PIPELINE } from '@/core/audit/constants/audit.constants';
import { ActivityRepository } from '@/core/audit/repositories/activity.repository';
import { AuditBufferService } from '@/core/audit/services/audit-buffer.service';
import type {
  AuditActivityRow,
  ListAuditFilter,
  RecordAuditInput,
} from '@/core/audit/types/audit.types';
import type { PaginatedResult } from '@/common/pagination/pagination.types';
import {
  AUDIT_JOB_BULK,
  AUDIT_JOB_FLUSH,
  AUDIT_QUEUE,
} from '@/infrastructure/queue/queue.constants';
import type {
  AuditBulkJobData,
  AuditFlushJobData,
} from '@/infrastructure/queue/queue.types';

@Injectable()
export class AuditService implements OnModuleInit {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    private readonly activities: ActivityRepository,
    private readonly buffer: AuditBufferService,
    @InjectQueue(AUDIT_QUEUE)
    private readonly queue: Queue<AuditFlushJobData | AuditBulkJobData>,
    private readonly cls: ClsService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(
      AUDIT_PIPELINE.flushSchedulerId,
      { every: AUDIT_PIPELINE.flushIntervalMs },
      {
        name: AUDIT_JOB_FLUSH,
        data: {},
        opts: {
          removeOnComplete: true,
          removeOnFail: 100,
        },
      },
    );
  }

  async record(input: RecordAuditInput): Promise<void> {
    try {
      await this.enqueueRows([this.toRow(input)]);
    } catch (err) {
      this.logger.warn(
        `Failed to enqueue ${input.module}.${input.action}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async recordMany(inputs: RecordAuditInput[]): Promise<void> {
    if (inputs.length === 0) {
      return;
    }
    try {
      await this.enqueueRows(inputs.map((input) => this.toRow(input)));
    } catch (err) {
      this.logger.warn(
        `Failed to enqueue ${inputs.length} audit rows: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async importBulk(rows: AuditActivityRow[]): Promise<void> {
    if (rows.length === 0) {
      return;
    }
    await this.queue.add(
      AUDIT_JOB_BULK,
      { rows },
      {
        attempts: 5,
        backoff: { type: 'exponential', delay: 2_000 },
        removeOnComplete: true,
      },
    );
  }

  list(filter: ListAuditFilter = {}): Promise<PaginatedResult<Activity[]>> {
    const { pagination, ...where } = filter;
    return this.activities.list(where, pagination);
  }

  private async enqueueRows(rows: AuditActivityRow[]): Promise<void> {
    const len = await this.buffer.push(rows);
    if (len >= AUDIT_PIPELINE.batchSize) {
      try {
        await this.queue.add(
          AUDIT_JOB_FLUSH,
          {},
          {
            jobId: AUDIT_PIPELINE.flushJobId,
            removeOnComplete: true,
            removeOnFail: 100,
          },
        );
      } catch {
        // A flush is already queued/active — the worker will drain the backlog.
      }
    }
  }

  private toRow(input: RecordAuditInput): AuditActivityRow {
    return {
      module: input.module,
      action: input.action,
      outcome: input.outcome ?? 'SUCCESS',
      userId: input.userId ?? null,
      resourceType: input.resourceType ?? null,
      resourceId: input.resourceId ?? null,
      ipAddress: this.cls.get('ip') ?? null,
      userAgent: this.cls.get('userAgent') ?? null,
      requestId: null,
      metadata: input.metadata,
      createdAt: new Date().toISOString(),
    };
  }
}
