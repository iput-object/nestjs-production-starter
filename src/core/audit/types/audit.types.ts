import type { AuditOutcome, Prisma } from '@prisma-client';
import type { Pagination } from '@/common/pagination/pagination.types';

export interface RecordAuditInput {
  module: string;
  action: string;
  outcome?: AuditOutcome;
  userId?: string | null;
  resourceType?: string;
  resourceId?: string;
  metadata?: Prisma.InputJsonValue;
}

export interface AuditActivityRow {
  module: string;
  action: string;
  outcome: AuditOutcome;
  userId: string | null;
  resourceType: string | null;
  resourceId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
  metadata?: Prisma.InputJsonValue;
  createdAt: string;
}

export interface ListAuditFilter {
  module?: string;
  action?: string;
  userId?: string;
  resourceType?: string;
  resourceId?: string;
  outcome?: AuditOutcome;
  from?: Date;
  to?: Date;
  pagination?: Pagination;
}
