/**
 * User input validation
 */

import { CreateUserInput, ValidationResult } from './types';
import { logger } from '@/lib/logger';

export class UserValidation {
  private static readonly NICKNAME_REGEX = /^[a-zA-Z0-9_-]+$/;
  private static readonly EMAIL_REGEX = /^[^@]+@[^@]+\.[^@]+$/;

  validateCreateInput(input: CreateUserInput): ValidationResult {
    const errors: string[] = [];

    if (!input.nickname || input.nickname.length < 3 || input.nickname.length > 30) {
      errors.push('Nickname must be between 3 and 30 characters');
    }
    if (!UserValidation.NICKNAME_REGEX.test(input.nickname)) {
      errors.push('Nickname can only contain letters, numbers, underscores and hyphens');
    }

    if (!input.email || !UserValidation.EMAIL_REGEX.test(input.email)) {
      errors.push('Invalid email format');
    }

    if (!input.password || input.password.length < 8) {
      errors.push('Password must be at least 8 characters long');
    }

    if (errors.length > 0) {
      logger.warn('User input validation failed', { 
        errors,
        input: { ...input, password: '[REDACTED]' }
      }, 'user validation warning');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

export const userValidation = new UserValidation();
