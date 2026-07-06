export const FILE_KEY_PREFIX = 'uploads';

// MIME types a client is allowed to request an upload URL for. This is an
// allowlist DoS/abuse guard, not a UX hint — extend deliberately.
export const ALLOWED_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'application/pdf',
  'application/zip',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
  'video/mp4',
  'video/webm',
  'audio/mpeg',
  'audio/webm',
] as const;
