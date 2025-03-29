'use client';

import { z } from 'zod';
import { logger } from '@/lib/client/logger';
import type { ValidationResult } from './types';

const projectSchema = z.object({
  description: z.string()
    .min(10, 'Description must be at least 10 characters long')
    .max(1000, 'Description must not exceed 1000 characters')
});

export const validateProjectInput = (description: string): ValidationResult => {
  try {
    projectSchema.parse({ description });
    return { isValid: true, errors: [] };
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn('Project input validation failed', { errors: error.errors }, 'project validation form');
      return {
        isValid: false,
        errors: error.errors.map(err => err.message)
      };
    }
    
    logger.error('Unexpected validation error', { error }, 'project validation error');
    return {
      isValid: false,
      errors: ['An unexpected error occurred during validation']
    };
  }
};
