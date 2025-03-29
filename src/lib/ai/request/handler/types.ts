// Types for request handler
import { OpenAI } from 'openai';
import { RequestOptions, RequestResult } from '../types';

export interface RequestExecutor {
  execute(messages: OpenAI.ChatCompletionMessageParam[], options?: RequestOptions): Promise<RequestResult>;
}

export interface RetryableRequest {
  attempt: number;
  execute(): Promise<RequestResult>;
}
