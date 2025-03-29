import OpenAI from 'openai';
import { logger } from '@/lib/client/logger';

export type OpenAIClient = OpenAI;
export type ChatCompletionMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

export const createOpenAIClient = (apiKey: string) => {
  const client = new OpenAI({
    apiKey,
    timeout: 600000,
    maxRetries: 2,
    baseURL: 'https://api.openai.com/v1'
  });
  
  logger.debug('Created OpenAI client', {
    timeout: 600000,
    maxRetries: 2,
    baseURL: 'https://api.openai.com/v1'
  }, 'ai-client creation');
  
  return client;
};

export const TEST_MODEL = 'gpt-4o-mini';
