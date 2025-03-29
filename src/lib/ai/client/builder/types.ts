'use client';

import { OperationType } from '../../request/types';

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
