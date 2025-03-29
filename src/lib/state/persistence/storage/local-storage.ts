/**
 * LocalStorage manager implementation with encryption support
 */

import CryptoJS from 'crypto-js';
import { StorageManager, StorageEncryption } from '../types';
import { StorageError } from '../errors';
import { logger } from '@/lib/logger';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-key';

export class LocalStorageManager implements StorageManager {
  private encryption: StorageEncryption;

  constructor() {
    this.encryption = {
      encrypt: (value: unknown): string => {
        try {
          const stringValue = JSON.stringify(value);
          return CryptoJS.AES.encrypt(stringValue, ENCRYPTION_KEY).toString();
        } catch (error) {
          logger.error('Encryption failed', { error }, 'local-storage encryption error');
          throw new StorageError('Failed to encrypt value', { error });
        }
      },
      decrypt: (encrypted: string): unknown => {
        try {
          const bytes = CryptoJS.AES.decrypt(encrypted, ENCRYPTION_KEY);
          const decrypted = bytes.toString(CryptoJS.enc.Utf8);
          return JSON.parse(decrypted);
        } catch (error) {
          logger.error('Decryption failed', { error }, 'local-storage encryption error');
          throw new StorageError('Failed to decrypt value', { error });
        }
      }
    };
  }

  async getItem<T>(key: string): Promise<T | null> {
    try {
      const item = localStorage.getItem(key);
      if (!item) {
        logger.debug('Item not found in storage', { key }, 'local-storage persistence');
        return null;
      }

      const decrypted = this.encryption.decrypt(item);
      logger.debug('Retrieved item from storage', { key }, 'local-storage persistence');
      return decrypted as T;
    } catch (error) {
      logger.error('Failed to get item from storage', { key, error }, 'local-storage persistence error');
      throw new StorageError(`Failed to get item: ${key}`, { error });
    }
  }

  async setItem<T>(key: string, value: T): Promise<void> {
    try {
      const encrypted = this.encryption.encrypt(value);
      localStorage.setItem(key, encrypted);
      logger.debug('Stored item in storage', { key }, 'local-storage persistence');
    } catch (error) {
      logger.error('Failed to set item in storage', { key, error }, 'local-storage persistence error');
      throw new StorageError(`Failed to set item: ${key}`, { error });
    }
  }

  async removeItem(key: string): Promise<void> {
    try {
      localStorage.removeItem(key);
      logger.debug('Removed item from storage', { key }, 'local-storage persistence');
    } catch (error) {
      logger.error('Failed to remove item from storage', { key, error }, 'local-storage persistence error');
      throw new StorageError(`Failed to remove item: ${key}`, { error });
    }
  }

  async clear(): Promise<void> {
    try {
      localStorage.clear();
      logger.debug('Cleared storage', {}, 'local-storage persistence');
    } catch (error) {
      logger.error('Failed to clear storage', { error }, 'local-storage persistence error');
      throw new StorageError('Failed to clear storage', { error });
    }
  }
}

export const localStorageManager = new LocalStorageManager();
