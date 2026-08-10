import { IdentifierType } from '@prisma-client';

/** Normalize email for storage and uniqueness checks. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Normalize phone toward E.164-ish form: strip spaces/dashes/parens,
 * keep a leading +, digits only otherwise.
 */
export function normalizePhone(phone: string): string {
  const trimmed = phone.trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/[^\d]/g, '');
  return hasPlus ? `+${digits}` : digits;
}

/** Resolve a free-form contact into a typed, normalized identifier. */
export function resolveIdentifier(raw: string): {
  type: IdentifierType;
  value: string;
} {
  const trimmed = raw.trim();
  if (trimmed.includes('@')) {
    return {
      type: IdentifierType.EMAIL,
      value: normalizeEmail(trimmed),
    };
  }
  return {
    type: IdentifierType.PHONE,
    value: normalizePhone(trimmed),
  };
}
