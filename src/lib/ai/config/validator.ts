'use client';

import { ApiKeyValidator, ApiKeyConfig } from './types';
import { ApiKeyValidationError, ApiKeyEnvironmentError } from './errors';
import { logger } from '@/lib/client/logger';

export class OpenAIKeyValidator implements ApiKeyValidator {
  private readonly validationEndpoint: string;

  constructor(config: ApiKeyConfig) {
    this.validationEndpoint = config.validationEndpoint || 'https://api.openai.com/v1/models';
  }

  async validateKey(key: string): Promise<boolean> {
    // Skip validation in development with USE_DEV_AI_API_KEY
    if (process.env.NODE_ENV === 'development' && process.env.USE_DEV_AI_API_KEY === 'true') {
      logger.debug('Skipping API key validation in development mode with USE_DEV_AI_API_KEY', {}, 'api-key validation');
      return true;
    }

    try {
      if (typeof window === 'undefined') {
        throw new ApiKeyEnvironmentError('API key validation is only available in browser environment');
      }

      const response = await fetch(this.validationEndpoint, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
      });

      const isValid = response.status === 200;
      if (!isValid) {
        logger.warn('API key validation failed', { status: response.status }, 'api-key validation');
      } else {
        logger.info('API key validated successfully', {}, 'api-key validation');
      }

      return isValid;
    } catch (error) {
      logger.error('API key validation error', { error }, 'api-key validation-error');
      throw new ApiKeyValidationError('Failed to validate API key');
    }
  }
}
