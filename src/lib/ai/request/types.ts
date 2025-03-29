// Core types for request management
import { OpenAI } from 'openai';

export type OperationType = 'decompose' | 'split' | 'regenerate';

export interface RequestOptions {
  maxRetries?: number;
  temperature?: number;
}

export interface RequestResult {
  content: string;
  usage?: OpenAI.CompletionUsage;
}

export interface ErrorResponse {
  error: {
    message: string;
    type: string;
    code?: string;
  };
}

export interface RetryConfig {
  maxAttempts: number;
  initialDelay: number;
  maxDelay: number;
}
