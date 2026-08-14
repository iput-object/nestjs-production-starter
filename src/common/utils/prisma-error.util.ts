import { Prisma } from '@prisma-client';

/** Prisma known-request codes we handle explicitly. */
export const PrismaErrorCode = {
  /** Serializable / write-conflict — transaction should be retried or mapped. */
  SERIALIZATION_FAILURE: 'P2034',
} as const;

export type PrismaErrorCodeValue =
  (typeof PrismaErrorCode)[keyof typeof PrismaErrorCode];

export function isPrismaKnownRequestError(
  err: unknown,
): err is Prisma.PrismaClientKnownRequestError {
  return err instanceof Prisma.PrismaClientKnownRequestError;
}

export function isPrismaErrorCode(
  err: unknown,
  code: PrismaErrorCodeValue | string,
): boolean {
  return isPrismaKnownRequestError(err) && err.code === code;
}

export function isPrismaSerializationFailure(err: unknown): boolean {
  return isPrismaErrorCode(err, PrismaErrorCode.SERIALIZATION_FAILURE);
}

/**
 * Map a serializable-transaction conflict (P2034) to `onConflict`.
 * Any other error is rethrown.
 */
export function mapPrismaSerializationFailure<T>(
  err: unknown,
  onConflict: T,
): T {
  if (isPrismaSerializationFailure(err)) {
    return onConflict;
  }
  throw err;
}
