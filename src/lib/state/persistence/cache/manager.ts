/**
 * Cache management implementation
 */

import NodeCache from 'node-cache';
import { CacheManager, CacheConfig } from './types';
import { CacheError } from '../errors';
import { logger } from '@/lib/logger';

const DEFAULT_CONFIG: CacheConfig = {
  stdTTL: 600, // 10 minutes
  checkperiod: 60, // 1 minute
  maxKeys: 1000
};

export class CacheManagerImpl implements CacheManager {
  private cache: NodeCache;

  constructor(config: Partial<CacheConfig> = {}) {
    this.cache = new NodeCache({
      ...DEFAULT_CONFIG,
      ...config
    });

    this.cache.on('expired', (key) => {
      logger.debug('Cache key expired', { key }, 'cache persistence');
    });
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const value = this.cache.get<T>(key);
      logger.debug('Retrieved item from cache', { key, found: !!value }, 'cache persistence');
      return value || null;
    } catch (error) {
      logger.error('Failed to get item from cache', { key, error }, 'cache persistence error');
      throw new CacheError(`Failed to get cached item: ${key}`, { error });
    }
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    try {
      if (ttl !== undefined) {
        this.cache.set(key, value, ttl);
      } else {
        this.cache.set(key, value);
      }
      logger.debug('Set item in cache', { key, ttl }, 'cache persistence');
    } catch (error) {
      logger.error('Failed to set item in cache', { key, error }, 'cache persistence error');
      throw new CacheError(`Failed to set cached item: ${key}`, { error });
    }
  }

  async del(key: string): Promise<void> {
    try {
      this.cache.del(key);
      logger.debug('Deleted item from cache', { key }, 'cache persistence');
    } catch (error) {
      logger.error('Failed to delete item from cache', { key, error }, 'cache persistence error');
      throw new CacheError(`Failed to delete cached item: ${key}`, { error });
    }
  }

  async clear(): Promise<void> {
    try {
      this.cache.flushAll();
      logger.debug('Cleared cache', {}, 'cache persistence');
    } catch (error) {
      logger.error('Failed to clear cache', { error }, 'cache persistence error');
      throw new CacheError('Failed to clear cache', { error });
    }
  }

  async invalidate(pattern: string): Promise<void> {
    try {
      const keys = this.cache.keys().filter(key => key.includes(pattern));
      this.cache.del(keys);
      logger.debug('Invalidated cache keys', { pattern, count: keys.length }, 'cache persistence');
    } catch (error) {
      logger.error('Failed to invalidate cache', { pattern, error }, 'cache persistence error');
      throw new CacheError(`Failed to invalidate cache: ${pattern}`, { error });
    }
  }
}

export const cacheManager = new CacheManagerImpl();
