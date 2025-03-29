import { logger } from '@/lib/client/logger';
import { NAME_EXTRACTION_RULES, VALIDATION_MESSAGES } from './constants';
import type { NameExtractionResult } from './types';

export function extractProjectName(input: string): NameExtractionResult {
  logger.debug('Extracting project name from input', { inputLength: input.length }, 'project name-extraction');
  
  const trimmedInput = input.trim();
  if (!trimmedInput) {
    throw new Error(VALIDATION_MESSAGES.EMPTY_INPUT);
  }
  if (trimmedInput.length < NAME_EXTRACTION_RULES.MIN_DESCRIPTION_LENGTH) {
    throw new Error(VALIDATION_MESSAGES.DESCRIPTION_TOO_SHORT);
  }

  // Try slash separator format (Name/Description)
  if (input.includes(NAME_EXTRACTION_RULES.DASH_SEPARATOR)) {
    const [name, ...descParts] = input.split(NAME_EXTRACTION_RULES.DASH_SEPARATOR);
    const description = descParts.join(NAME_EXTRACTION_RULES.DASH_SEPARATOR).trim();
    
    if (name && description) {
      const trimmedName = name.trim();
      if (trimmedName.length <= NAME_EXTRACTION_RULES.MAX_NAME_LENGTH) {
        logger.debug('Extracted name using slash separator', { name: trimmedName }, 'project name-extraction');
        return { name: trimmedName, description };
      }
    }
  }

  // Try sentence format (Name. Description)
  const sentenceMatch = input.match(/^([^.]+)\.([\s\S]*)/);
  if (sentenceMatch) {
    const [, name, description] = sentenceMatch;
    const trimmedName = name.trim();
    
    if (trimmedName && description && trimmedName.length <= NAME_EXTRACTION_RULES.MAX_NAME_LENGTH) {
      logger.debug('Extracted name using sentence format', { name: trimmedName }, 'project name-extraction');
      return { name: trimmedName, description: description.trim() };
    }
  }

  // Try new line format (Name\nDescription)
  if (input.includes(NAME_EXTRACTION_RULES.LINE_SEPARATOR)) {
    const [name, ...descParts] = input.split(NAME_EXTRACTION_RULES.LINE_SEPARATOR);
    const description = descParts.join(NAME_EXTRACTION_RULES.LINE_SEPARATOR).trim();
    const trimmedName = name.trim();
    
    if (trimmedName && description && trimmedName.length <= NAME_EXTRACTION_RULES.MAX_NAME_LENGTH) {
      logger.debug('Extracted name using new line separator', { name: trimmedName }, 'project name-extraction');
      return { name: trimmedName, description };
    }
  }

  // If no separator found, use entire input as description
  logger.debug('No separator found, using entire input as description', {}, 'project name-extraction');
  return { 
    name: 'New Project', 
    description: trimmedInput 
  };
}
