import { Injectable } from '@nestjs/common';
import type { Activity, AuditOutcome, Prisma } from '@prisma-client';
import { PrismaService } from '@/database/prisma.service';
import { prismaPaginate } from '@/common/pagination/prisma-paginate';
import type {
  Pagination,
  PaginatedResult,
} from '@/common/pagination/pagination.types';

export interface CreateActivityInput {
  module: string;
  action: string;
  outcome?: AuditOutcome;
  userId?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  metadata?: Prisma.InputJsonValue;
  createdAt?: Date;
}

export interface ActivityListWhere {
  module?: string;
  action?: string;
  userId?: string;
  resourceType?: string;
  resourceId?: string;
  outcome?: AuditOutcome;
  from?: Date;
  to?: Date;
}

@Injectable()
export class ActivityRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(input: CreateActivityInput): Promise<Activity> {
    return this.prisma.activity.create({
      data: {
        module: input.module,
        action: input.action,
        outcome: input.outcome ?? 'SUCCESS',
        userId: input.userId ?? null,
        resourceType: input.resourceType ?? null,
        resourceId: input.resourceId ?? null,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        requestId: input.requestId ?? null,
        metadata: input.metadata ?? undefined,
      },
    });
  }

  createMany(rows: CreateActivityInput[]): Promise<{ count: number }> {
    if (rows.length === 0) {
      return Promise.resolve({ count: 0 });
    }
    return this.prisma.activity.createMany({
      data: rows.map((row) => ({
        module: row.module,
        action: row.action,
        outcome: row.outcome ?? 'SUCCESS',
        userId: row.userId ?? null,
        resourceType: row.resourceType ?? null,
        resourceId: row.resourceId ?? null,
        ipAddress: row.ipAddress ?? null,
        userAgent: row.userAgent ?? null,
        requestId: row.requestId ?? null,
        metadata: row.metadata ?? undefined,
        ...(row.createdAt ? { createdAt: row.createdAt } : {}),
      })),
    });
  }

  list(
    where: ActivityListWhere,
    pagination?: Pagination,
  ): Promise<PaginatedResult<Activity[]>> {
    return prismaPaginate(
      this.prisma.activity,
      {
        where: this.buildWhere(where),
        orderBy: { createdAt: 'desc' as const },
      },
      pagination,
      { cursorField: 'id', sortField: 'createdAt', sortDirection: 'desc' },
    );
  }

  private buildWhere(filter: ActivityListWhere): Prisma.ActivityWhereInput {
    const createdAt =
      filter.from || filter.to
        ? {
            ...(filter.from ? { gte: filter.from } : {}),
            ...(filter.to ? { lte: filter.to } : {}),
          }
        : undefined;

    return {
      ...(filter.module ? { module: filter.module } : {}),
      ...(filter.action ? { action: filter.action } : {}),
      ...(filter.userId ? { userId: filter.userId } : {}),
      ...(filter.resourceType ? { resourceType: filter.resourceType } : {}),
      ...(filter.resourceId ? { resourceId: filter.resourceId } : {}),
      ...(filter.outcome ? { outcome: filter.outcome } : {}),
      ...(createdAt ? { createdAt } : {}),
    };
  }
}
