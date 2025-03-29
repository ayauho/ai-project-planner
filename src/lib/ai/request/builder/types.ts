// Types for request builders
import { OperationType } from '../types';

export interface SystemPromptOptions {
  operation: OperationType;
  context?: Record<string, unknown>;
}

export interface RequestDataOptions {
  operation: OperationType;
  data: Record<string, unknown>;
}

export interface FormatOptions {
  operation: OperationType;
}

export interface Builder<T> {
  build(): T;
}
