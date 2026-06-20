import { SetMetadata } from '@nestjs/common';

export const CACHE_TTL_KEY = 'cache_ttl_seconds';
export const CACHE_KEY_KEY = 'cache_custom_key';

export const CacheTtl = (seconds: number) =>
  SetMetadata(CACHE_TTL_KEY, seconds);
export const CacheKey = (key: string) => SetMetadata(CACHE_KEY_KEY, key);
