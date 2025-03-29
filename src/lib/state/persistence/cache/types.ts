/**
 * Cache management types
 */

export interface CacheConfig {
  stdTTL: number;
  checkperiod: number;
  maxKeys: number;
}

export interface CacheManager {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttl?: number): Promise<void>;
  del(key: string): Promise<void>;
  clear(): Promise<void>;
  invalidate(pattern: string): Promise<void>;
}
