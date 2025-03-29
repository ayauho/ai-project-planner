import { Builder, FormatOptions } from './types';
import { ValidationError } from '../errors';
import logger from '@/lib/logger';

export class FormatBuilder implements Builder<string> {
  constructor(private options: FormatOptions) {}

  build(): string {
    logger.debug('Building response format', { operation: this.options.operation });

    switch (this.options.operation) {
      case 'decompose':
        return `Provide your response as a JSON array of tasks. 
               Return only the raw JSON array without any markdown formatting or code blocks.
               Each task should have:
               - name: string (task name)
               - description: string (detailed task description)
               - definition: "task" (fixed value)`;
              
      case 'split':
        return `Provide your response as a JSON array of subtasks.
               Return only the raw JSON array without any markdown formatting or code blocks.
               Each subtask should have:
               - name: string (subtask name)
               - description: string (detailed subtask description)
               - definition: "task" (fixed value)`;
              
      case 'regenerate':
        return `Provide your response as a JSON object.
               Return only the raw JSON object without any markdown formatting or code blocks.
               The object should have:
               - name: string (task name)
               - description: string (detailed task description)
               - definition: "task" (fixed value)`;
              
      default:
        throw new ValidationError(`Invalid operation type: ${this.options.operation}`);
    }
  }
}