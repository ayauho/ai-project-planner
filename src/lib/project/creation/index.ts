import { logger } from '@/lib/logger';
import { extractProjectName } from './extract-name';
import { validateProjectInput } from './validation';
import type { ProjectCreationService, ProjectCreationOptions, ValidationResult } from './types';
import type { CreateProjectInput } from '../types';

export class ProjectCreationServiceImpl implements ProjectCreationService {
  async validateInput(input: string): Promise<ValidationResult> {
    logger.debug('Validating project creation input', {}, 'project creation');
    return validateProjectInput(input);
  }

  async processInput(input: string, options?: ProjectCreationOptions): Promise<CreateProjectInput> {
    logger.info('Processing project creation input', { validateOnly: options?.validateOnly }, 'project creation');

    const validation = await this.validateInput(input);
    if (!validation.isValid) {
      logger.warn('Project creation input validation failed', { errors: validation.errors }, 'project creation validation');
      throw new Error(validation.errors[0]);
    }

    if (options?.validateOnly) {
      logger.debug('Validation only mode, skipping processing', {}, 'project creation');
      return {} as CreateProjectInput;
    }

    const { name, description } = extractProjectName(input);
    
    logger.info('Successfully processed project creation input', { name }, 'project creation');
    return {
      name,
      description,
      userId: '', // Empty string to be replaced by the caller
    };
  }
}

export const projectCreationService = new ProjectCreationServiceImpl();

export * from './types';
export * from './constants';
