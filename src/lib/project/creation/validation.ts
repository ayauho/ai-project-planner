import { logger } from '@/lib/logger';
import { NAME_EXTRACTION_RULES, VALIDATION_MESSAGES } from './constants';
import type { ValidationResult } from './types';

export function validateProjectInput(input: string): ValidationResult {
  logger.debug('Validating project input', { inputLength: input.length }, 'project validation');

  const errors: string[] = [];

  if (!input || !input.trim()) {
    errors.push(VALIDATION_MESSAGES.EMPTY_INPUT);
  } else if (input.trim().length < NAME_EXTRACTION_RULES.MIN_DESCRIPTION_LENGTH) {
    errors.push(VALIDATION_MESSAGES.DESCRIPTION_TOO_SHORT);
  }

  const isValid = errors.length === 0;
  
  logger.debug('Project input validation result', { isValid, errorCount: errors.length }, 'project validation');
  return { isValid, errors };
}
