import { z } from 'zod';
import { SignInInput, ValidationResult } from '../types';
import { logger } from '@/lib/logger';

const signInSchema = z.object({
  email: z.string()
    .email('Invalid email format'),
  password: z.string()
    .min(1, 'Password is required')
});

export const validateSignIn = (input: SignInInput): ValidationResult => {
  try {
    signInSchema.parse(input);
    return { isValid: true, errors: [] };
  } catch (error) {
    logger.warn('Sign in validation failed', { error }, 'auth validation');
    if (error instanceof z.ZodError) {
      const errors = error.errors.map(err => ({
        field: err.path[0] as string,
        message: err.message
      }));
      return { isValid: false, errors };
    }
    return {
      isValid: false,
      errors: [{ field: 'form', message: 'Invalid input data' }]
    };
  }
};
