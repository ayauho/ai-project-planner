import { v4 as uuidv4 } from 'uuid';
import { ERROR_CATEGORIES, USER_MESSAGES } from './constants';
import { ErrorProcessor, ProcessedError, ErrorDetails } from './types';

export class ErrorProcessorImpl implements ErrorProcessor {
  private categorizeError(error: Error): string {
    if (error instanceof TypeError || error instanceof RangeError) {
      return ERROR_CATEGORIES.VALIDATION;
    }

    // Check for MongoDB duplicate key error
    if (error.message.includes('E11000 duplicate key error')) {
      return ERROR_CATEGORIES.DUPLICATE_KEY;
    }

    // Add more categorization logic as needed
    return ERROR_CATEGORIES.UNKNOWN;
  }

  private createErrorDetails(error: Error, category: string, context?: Record<string, unknown>): ErrorDetails {
    return {
      code: category,
      message: USER_MESSAGES[category as keyof typeof USER_MESSAGES] || error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      context
    };
  }

  processError(error: Error | unknown, context?: Record<string, unknown>): ProcessedError {
    const actualError = error instanceof Error ? error : new Error(String(error));
    const category = this.categorizeError(actualError);
    return {
      errorId: uuidv4(),
      originalError: actualError,
      details: this.createErrorDetails(actualError, category, context),
      timestamp: new Date(),
      level: category === ERROR_CATEGORIES.VALIDATION ? 'warn' : 'error'
    };
  }
}

export const errorProcessor = new ErrorProcessorImpl();
