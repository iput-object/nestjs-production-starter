export const AUDIT_MODULE = Object.freeze({
  AUTH: 'auth',
  FILES: 'files',
  SYSTEM: 'system',
} as const);

export type AuditModuleName = (typeof AUDIT_MODULE)[keyof typeof AUDIT_MODULE];

/** Pipeline / buffer policy — code review to change, not env. */
export const AUDIT_PIPELINE = Object.freeze({
  /** Redis list that accumulates rows before bulk insert. */
  bufferKey: 'audit:inbox',
  /** Drain this many rows per flush job. */
  batchSize: 100,
  /** Periodic flush so low-traffic events still land promptly. */
  flushIntervalMs: 2_000,
  /** Stable BullMQ job ids so concurrent triggers collapse to one worker. */
  flushJobId: 'audit-flush',
  /** Job scheduler that periodically drains the inbox. */
  flushSchedulerId: 'audit-flush-repeat',
});
