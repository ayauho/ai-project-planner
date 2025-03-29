'use client';

/**
 * Client-side localStorage manager implementation
 */
import { logger } from '@/lib/client/logger';

interface StorageManager {
  getItem<T>(key: string): Promise<T | null>;
  setItem<T>(key: string, value: T): Promise<void>;
  removeItem(key: string): Promise<void>;
  clear(): Promise<void>;
}

class LocalStorageManager implements StorageManager {
  async getItem<T>(key: string): Promise<T | null> {
    try {
      const item = localStorage.getItem(key);
      if (!item) {
        return null;
      }
      
      return JSON.parse(item) as T;
    } catch (error) {
      logger.error('Failed to get item from local storage', { key, error }, 'storage local-storage error');
      return null;
    }
  }

  async setItem<T>(key: string, value: T): Promise<void> {
    try {
      const valueStr = JSON.stringify(value);
      localStorage.setItem(key, valueStr);
    } catch (error) {
      logger.error('Failed to set item in local storage', { key, error }, 'storage local-storage error');
    }
  }

  async removeItem(key: string): Promise<void> {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      logger.error('Failed to remove item from local storage', { key, error }, 'storage local-storage error');
    }
  }

  async clear(): Promise<void> {
    try {
      localStorage.clear();
    } catch (error) {
      logger.error('Failed to clear local storage', { error }, 'storage local-storage error');
    }
  }
}

export const localStorageManager = new LocalStorageManager();
