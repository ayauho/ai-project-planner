'use client';

import { ApiKeyManager, ApiKeyConfig } from './types';
import { LocalStorageKeyManager } from './storage';
import { OpenAIKeyValidator } from './validator';
import { ApiKeyEnvironmentError } from './errors';
import { logger } from '@/lib/client/logger';

export class ApiKeyManagerImpl implements ApiKeyManager {
  private storage: LocalStorageKeyManager;
  private validator: OpenAIKeyValidator;

  constructor(config: ApiKeyConfig) {
    this.storage = new LocalStorageKeyManager(config);
    this.validator = new OpenAIKeyValidator(config);
  }

  async getKey(): Promise<string | null> {
    return this.storage.getKey();
  }

  async setKey(key: string): Promise<void> {
    const isValid = await this.validateKey(key);
    if (!isValid) {
      logger.error('Invalid API key provided', {}, 'api-key validation');
      throw new Error('Invalid API key');
    }
    await this.storage.storeKey(key);
  }

  async validateKey(key: string): Promise<boolean> {
    return this.validator.validateKey(key);
  }

  async removeKey(): Promise<void> {
    return this.storage.removeKey();
  }
}

export function createApiKeyManager(config: ApiKeyConfig): ApiKeyManager {
  // Ensure we're in a browser environment when not using development key
  if (typeof window === 'undefined' && 
      !(process.env.NODE_ENV === 'development' && process.env.USE_DEV_AI_API_KEY === 'true')) {
    throw new ApiKeyEnvironmentError('API key manager can only be created in browser environment');
  }
  return new ApiKeyManagerImpl(config);
}

// Get user-specific storage key
export const getUserApiKeyStorageKey = (userId?: string): string => {
  if (!userId) {
    return 'openai-api-key'; // Fallback for backward compatibility
  }
  return `openai-api-key-user-${userId}`;
};

// Default configuration - will be enhanced with user ID when available
export const defaultConfig: ApiKeyConfig = {
  storageKey: 'openai-api-key', // This will be overridden with user-specific key
  encryptionKey: process.env.NEXT_PUBLIC_ENCRYPTION_KEY || 'default-encryption-key',
  provider: 'openai'
};

export * from './types';
export * from './errors';
