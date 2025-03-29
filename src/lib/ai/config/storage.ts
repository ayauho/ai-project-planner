//src/lib/ai/config/storage.ts:
'use client';

import CryptoJS from 'crypto-js';
import { ApiKeyStorage, ApiKeyConfig } from './types';
import { ApiKeyStorageError, ApiKeyEnvironmentError } from './errors';
import { logger } from '@/lib/client/logger';

const STORAGE_PREFIX = 'ai_project_planner_';
const DEFAULT_ENCRYPTION_KEY = 'default-encryption-key-7219';

export class LocalStorageKeyManager implements ApiKeyStorage {
  private readonly storageKey: string;
  private readonly encryptionKey: string;

  constructor(config: ApiKeyConfig) {
    this.storageKey = `${STORAGE_PREFIX}${config.storageKey}`;
    // Ensure consistent encryption key across reloads
    this.encryptionKey = config.encryptionKey || DEFAULT_ENCRYPTION_KEY;
  }

  async storeKey(key: string): Promise<void> {
    // In development with USE_DEV_AI_API_KEY, don't store the key
    if (process.env.NODE_ENV === 'development' && process.env.USE_DEV_AI_API_KEY === 'true') {
      logger.debug('Skipping API key storage in development mode with USE_DEV_AI_API_KEY', {}, 'api-key storage');
      return;
    }

    try {
      if (typeof window === 'undefined') {
        throw new ApiKeyEnvironmentError('API key storage is only available in browser environment');
      }

      const encrypted = CryptoJS.AES.encrypt(key, this.encryptionKey).toString();
      localStorage.setItem(this.storageKey, encrypted);
      
      // Verify storage was successful
      const storedKey = localStorage.getItem(this.storageKey);
      if (!storedKey) {
        throw new ApiKeyStorageError('Failed to verify key storage');
      }
      
      logger.info('API key stored and verified successfully', {}, 'api-key storage');
    } catch (error) {
      logger.error('Failed to store API key', { error }, 'api-key storage-error');
      throw new ApiKeyStorageError('Failed to store API key');
    }
  }

  async getKey(): Promise<string | null> {
    try {
      // In development, check USE_DEV_AI_API_KEY flag
      if (process.env.NODE_ENV === 'development' && process.env.USE_DEV_AI_API_KEY === 'true') {
        const devKey = process.env.OPENAI_API_KEY;
        if (!devKey) {
          logger.warn('No API key found in .env.development', {}, 'api-key storage');
          return null;
        }
        logger.debug('Using development API key', {}, 'api-key storage');
        return devKey;
      }

      // Check for browser environment
      if (typeof window === 'undefined') {
        throw new ApiKeyEnvironmentError('API key storage is only available in browser environment');
      }

      // Use encrypted localStorage
      const encrypted = localStorage.getItem(this.storageKey);
      if (!encrypted) {
        logger.debug('No API key found in storage', {}, 'api-key storage');
        return null;
      }

      try {
        const decrypted = CryptoJS.AES.decrypt(encrypted, this.encryptionKey);
        const key = decrypted.toString(CryptoJS.enc.Utf8);
        
        // Validate decrypted key
        if (!key || !key.startsWith('sk-')) {
          logger.warn('Invalid key format found in storage', {}, 'api-key storage-error');
          this.removeKey(); // Clean up invalid key
          return null;
        }
        
        return key;
      } catch (decryptError) {
        logger.error('Failed to decrypt stored API key', { error: decryptError }, 'api-key storage-error');
        this.removeKey(); // Clean up corrupted key
        return null;
      }
    } catch (error) {
      logger.error('Failed to retrieve API key', { error }, 'api-key storage-error');
      throw new ApiKeyStorageError('Failed to retrieve API key');
    }
  }

  async removeKey(): Promise<void> {
    if (process.env.NODE_ENV === 'development' && process.env.USE_DEV_AI_API_KEY === 'true') {
      logger.debug('Skipping API key removal in development mode with USE_DEV_AI_API_KEY', {}, 'api-key storage');
      return;
    }

    try {
      if (typeof window === 'undefined') {
        throw new ApiKeyEnvironmentError('API key removal is only available in browser environment');
      }

      localStorage.removeItem(this.storageKey);
      logger.info('API key removed successfully', {}, 'api-key storage');
    } catch (error) {
      logger.error('Failed to remove API key', { error }, 'api-key storage-error');
      throw new ApiKeyStorageError('Failed to remove API key');
    }
  }
}
