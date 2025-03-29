import { z } from 'zod';
import { SignUpInput, ValidationResult } from '../types';
import { logger } from '@/lib/logger';

const signUpSchema = z.object({
  nickname: z.string()
    .min(3, 'Nickname must be at least 3 characters')
    .max(30, 'Nickname must not exceed 30 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Nickname can only contain letters, numbers, underscores and hyphens'),
  email: z.string()
    .email('Invalid email format'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character')
});

export const validateSignUp = (input: SignUpInput): ValidationResult => {
  try {
    signUpSchema.parse(input);
    return { isValid: true, errors: [] };
  } catch (error) {
    logger.warn('Sign up validation failed', { error }, 'auth validation');
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
