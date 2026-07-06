import { randomUUID } from 'node:crypto';
import { FILE_KEY_PREFIX } from '@/core/files/files.constants';

const MAX_NAME_LENGTH = 100;

/**
 * Derive a collision-free, traversal-safe object key. The random segment keeps
 * two uploads of the same filename from clobbering each other, and the owner
 * segment scopes objects per user for easy lifecycle rules on the bucket.
 */
export function buildObjectKey(ownerId: string, filename: string): string {
  const safeName = sanitizeFilename(filename);
  return `${FILE_KEY_PREFIX}/${ownerId}/${randomUUID()}/${safeName}`;
}

function sanitizeFilename(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? 'file';
  const cleaned = base
    .replace(/[^\w.-]+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^[._]+/, '')
    .slice(0, MAX_NAME_LENGTH);
  return cleaned || 'file';
}
