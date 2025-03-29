import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

export interface ApiError extends Error {
  code?: number;
  details?: Record<string, unknown>;
}

export function handleApiError(error: unknown, context?: Record<string, unknown>): NextResponse {
  const errorResponse = {
    error: 'Internal Server Error',
    message: error instanceof Error ? error.message : 'Unknown error occurred',
    code: 500,
    details: context
  };

  // Log error with context
  logger.error('API Error', {
    error: error instanceof Error ? {
      name: error.name,
      message: error.message,
      stack: error.stack,
      ...(error as ApiError).details
    } : error,
    context
  }, 'api error');

  return NextResponse.json(errorResponse, { 
    status: (error as ApiError).code || 500 
  });
}
