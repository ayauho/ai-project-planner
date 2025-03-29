import { CacheManagerImpl } from '../../../../lib/state/persistence/cache/manager';
import { CacheError } from '../../../../lib/state/persistence/errors';
import { logger } from '../../../../lib/logger';

// Mock logger
jest.mock('../../../../lib/logger', () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn()
  }
}));

describe('CacheManager', () => {
  let cacheManager: CacheManagerImpl;

  beforeEach(() => {
    jest.clearAllMocks();
    cacheManager = new CacheManagerImpl();
  });

  describe('get', () => {
    it('should retrieve cached item', async () => {
      const testData = { test: 'value' };
      await cacheManager.set('test-key', testData);

      const result = await cacheManager.get('test-key');

      expect(result).toEqual(testData);
      expect(logger.debug).toHaveBeenCalled();
    });

    it('should return null for non-existent key', async () => {
      const result = await cacheManager.get('non-existent');

      expect(result).toBeNull();
      expect(logger.debug).toHaveBeenCalled();
    });

    it('should handle cache errors', async () => {
      jest.spyOn(cacheManager['cache'], 'get').mockImplementation(() => {
        throw new Error('Cache error');
      });

      await expect(cacheManager.get('test-key'))
        .rejects
        .toThrow(CacheError);
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('set', () => {
    it('should cache item with default TTL', async () => {
      const testData = { test: 'value' };
      
      await cacheManager.set('test-key', testData);
      const result = await cacheManager.get('test-key');
      
      expect(result).toEqual(testData);
      expect(logger.debug).toHaveBeenCalled();
    });

    it('should cache item with custom TTL', async () => {
      const testData = { test: 'value' };
      const ttl = 60; // 1 minute
      
      await cacheManager.set('test-key', testData, ttl);
      const result = await cacheManager.get('test-key');
      
      expect(result).toEqual(testData);
      expect(logger.debug).toHaveBeenCalled();
    });

    it('should handle cache errors', async () => {
      jest.spyOn(cacheManager['cache'], 'set').mockImplementation(() => {
        throw new Error('Cache error');
      });

      await expect(cacheManager.set('test-key', { test: 'value' }))
        .rejects
        .toThrow(CacheError);
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('del', () => {
    it('should delete cached item', async () => {
      const testData = { test: 'value' };
      await cacheManager.set('test-key', testData);
      
      await cacheManager.del('test-key');
      const result = await cacheManager.get('test-key');
      
      expect(result).toBeNull();
      expect(logger.debug).toHaveBeenCalled();
    });

    it('should handle deletion errors', async () => {
      jest.spyOn(cacheManager['cache'], 'del').mockImplementation(() => {
        throw new Error('Cache error');
      });

      await expect(cacheManager.del('test-key'))
        .rejects
        .toThrow(CacheError);
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('clear', () => {
    it('should clear all cached items', async () => {
      await cacheManager.set('key1', 'value1');
      await cacheManager.set('key2', 'value2');
      
      await cacheManager.clear();
      
      expect(await cacheManager.get('key1')).toBeNull();
      expect(await cacheManager.get('key2')).toBeNull();
      expect(logger.debug).toHaveBeenCalled();
    });

    it('should handle clear errors', async () => {
      jest.spyOn(cacheManager['cache'], 'flushAll').mockImplementation(() => {
        throw new Error('Cache error');
      });

      await expect(cacheManager.clear())
        .rejects
        .toThrow(CacheError);
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('invalidate', () => {
    it('should invalidate cached items by pattern', async () => {
      await cacheManager.set('test:1', 'value1');
      await cacheManager.set('test:2', 'value2');
      await cacheManager.set('other:1', 'value3');
      
      await cacheManager.invalidate('test:');
      
      expect(await cacheManager.get('test:1')).toBeNull();
      expect(await cacheManager.get('test:2')).toBeNull();
      expect(await cacheManager.get('other:1')).not.toBeNull();
      expect(logger.debug).toHaveBeenCalled();
    });

    it('should handle invalidation errors', async () => {
      jest.spyOn(cacheManager['cache'], 'keys').mockImplementation(() => {
        throw new Error('Cache error');
      });

      await expect(cacheManager.invalidate('test:'))
        .rejects
        .toThrow(CacheError);
      expect(logger.error).toHaveBeenCalled();
    });
  });
});
