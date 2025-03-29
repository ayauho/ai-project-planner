/**
 * OpenAI client implementation for browser environment
 */
import OpenAI from 'openai';

export interface ChatCompletionMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export const TEST_MODEL = 'gpt-4o-mini';

export interface OpenAIClient {
  chat: {
    completions: {
      create(params: {
        model: string;
        messages: Array<{
          role: 'system' | 'user' | 'assistant';
          content: string;
        }>;
        temperature?: number;
      }): Promise<OpenAI.Chat.ChatCompletion>;
    };
  };
}

export const createRealOpenAIClient = (apiKey: string): OpenAIClient => {
  if (!apiKey) throw new Error('OpenAI API key is required');
  
  // Create OpenAI configuration for fetch environment
  const config = {
    apiKey,
    dangerouslyAllowBrowser: true // Enable browser usage
  };
  
  return new OpenAI(config);
};
