'use client';

import { Builder, FormatOptions } from './types';
import { logger } from '@/lib/client/logger';

export class FormatBuilder implements Builder<string> {
  constructor(private options: FormatOptions) {}

  build(): string {
    logger.debug('Building response format', { operation: this.options.operation }, 'ai-client format-builder');

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
               Each subtask should be an object with:
               - name: string (concise task name)
               - description: string (detailed task description)`;
              
      case 'regenerate':
        return `Provide your response as a JSON object with:
               - name: string (concise task name)
               - description: string (detailed task description)`;
              
      default:
        throw new Error(`Invalid operation type: ${this.options.operation}`);
    }
  }
}
