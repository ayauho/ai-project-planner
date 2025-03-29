// Request executor implementation
import { OpenAI } from 'openai';
import { RequestExecutor, RetryableRequest } from './types';
import { RequestOptions, RequestResult, RetryConfig } from '../types';
import { RequestError, RateLimitError } from '../errors';
import { RETRY_CONFIG, OPENAI_CONFIG, ERROR_MESSAGES } from '../constants';
import logger from '@/lib/logger';

export class OpenAIRequestExecutor implements RequestExecutor {
  private openai: OpenAI;
  private retryConfig: RetryConfig;

  constructor(apiKey: string, retryConfig: RetryConfig = RETRY_CONFIG) {
    if (!apiKey) {
      throw new RequestError(ERROR_MESSAGES.API_KEY_MISSING);
    }
    
    this.openai = new OpenAI({ 
      apiKey,
      timeout: OPENAI_CONFIG.timeout // Set timeout in client configuration
    });
    this.retryConfig = retryConfig;
  }

  async execute(
    messages: OpenAI.ChatCompletionMessageParam[],
    options: RequestOptions = {}
  ): Promise<RequestResult> {
    const request: RetryableRequest = {
      attempt: 1,
      execute: async () => {
        try {
          logger.debug('Executing OpenAI request', { 
            attempt: request.attempt,
            messageCount: messages.length 
          });

          const response = await this.openai.chat.completions.create({
            model: OPENAI_CONFIG.model,
            messages,
            temperature: options.temperature ?? OPENAI_CONFIG.temperature
          });

          logger.debug('OpenAI response received', { 
            usage: response.usage,
            finishReason: response.choices[0]?.finish_reason
          });

          if (!response.choices[0]?.message?.content) {
            throw new RequestError(ERROR_MESSAGES.INVALID_RESPONSE);
          }

          return {
            content: response.choices[0].message.content,
            usage: response.usage
          };
        } catch (error) {
          this.handleRequestError(error as Error);
          throw error;
        }
      }
    };

    return this.executeWithRetry(request);
  }

  private async executeWithRetry(request: RetryableRequest): Promise<RequestResult> {
    while (request.attempt <= this.retryConfig.maxAttempts) {
      try {
        return await request.execute();
      } catch (error) {
        const shouldRetry = this.shouldRetryError(error as Error)
          && request.attempt < this.retryConfig.maxAttempts;

        if (!shouldRetry) {
          throw error;
        }

        const delayMs = Math.min(
          this.retryConfig.initialDelay * Math.pow(2, request.attempt - 1),
          this.retryConfig.maxDelay
        );

        logger.warn('Retrying request after error', {
          attempt: request.attempt,
          delay: delayMs,
          error: error instanceof Error ? error.message : 'Unknown error'
        });

        await new Promise(resolve => setTimeout(resolve, delayMs));
        request.attempt++;
      }
    }

    throw new RequestError('Max retry attempts reached');
  }

  private shouldRetryError(error: Error): boolean {
    if (error instanceof RateLimitError) {
      return true;
    }

    if (error instanceof RequestError) {
      // Retry on timeout or server errors
      return error.message.includes('timeout') || 
             error.message.includes('server error');
    }

    return false;
  }

  private handleRequestError(error: Error): never {
    logger.error('OpenAI request failed', { error: error.message });

    if (error instanceof OpenAI.APIError) {
      if (error.status === 429) {
        throw new RateLimitError(ERROR_MESSAGES.RATE_LIMIT);
      }
      throw new RequestError(error.message, error.code || 'unknown_error');
    }

    throw error;
  }
}
