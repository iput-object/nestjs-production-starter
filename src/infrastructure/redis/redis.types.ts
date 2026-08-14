export interface CachePort {
  get<T>(key: string): Promise<T | null>;
  /** Atomically get and delete. Returns null if the key was missing. */
  take<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
}
