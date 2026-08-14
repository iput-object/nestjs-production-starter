import type { MailMessage } from '@/infrastructure/mailer/mailer.types';
import type { SmsMessage } from '@/infrastructure/sms/sms.types';
import type { AuditActivityRow } from '@/core/audit/types/audit.types';

export type MailJobData = MailMessage;
export type SmsJobData = SmsMessage;

/** Periodic / threshold-triggered drain of the Redis audit inbox. */
export type AuditFlushJobData = Record<string, never>;

/** Explicit bulk import payload (admin / migration / backfill paths). */
export interface AuditBulkJobData {
  rows: AuditActivityRow[];
}
