export const NAME_EXTRACTION_RULES = {
  MIN_DESCRIPTION_LENGTH: 10,
  MAX_NAME_LENGTH: 100,
  DASH_SEPARATOR: '/',
  SENTENCE_SEPARATOR: '.',
  LINE_SEPARATOR: '\n'
} as const;

export const VALIDATION_MESSAGES = {
  DESCRIPTION_TOO_SHORT: 'Project description must be at least 10 characters long',
  EMPTY_INPUT: 'Project description cannot be empty',
  INVALID_FORMAT: 'Invalid project description format',
} as const;
