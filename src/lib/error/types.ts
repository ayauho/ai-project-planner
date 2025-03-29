import { LogLevel } from '@/lib/logger/types';

export interface ErrorDetails {
  code?: string;
  message: string;
  stack?: string;
  context?: Record<string, unknown>;
}

export interface ProcessedError {
  errorId: string;
  originalError: Error;
  details: ErrorDetails;
  timestamp: Date;
  level: LogLevel;
}

export interface ErrorProcessor {
  processError(error: Error | unknown, context?: Record<string, unknown>): ProcessedError;
}

export interface ErrorReporter {
  reportError(processedError: ProcessedError): void;
}

export interface GlobalErrorHandler {
  handleError(error: Error | unknown, context?: Record<string, unknown>): void;
  handlePromiseRejection(error: Error | unknown): void;
}
