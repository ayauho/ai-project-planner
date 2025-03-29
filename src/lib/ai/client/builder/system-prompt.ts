'use client';

import { Builder, SystemPromptOptions } from './types';
import { logger } from '@/lib/client/logger';

export class SystemPromptBuilder implements Builder<string> {
  constructor(private options: SystemPromptOptions) {}

  build(): string {
    logger.debug('Building system prompt', { operation: this.options.operation }, 'ai-client prompt-builder');
    
    const basePrompt = `You are a specialized AI trained to assist with project planning and task organization. Respond in the language, which used for project name and description.`;
    
    const suffix = `which should be executed in parallel and holistically to implement the first entity in ancestors_chain. Each entity of ancestors_chain, except the latest, is part of a higher-level task or project. Latest entity of the ancestors_chain is the main project.`;

    switch (this.options.operation) {
      case 'decompose':
        return `${basePrompt} Break down the given project into well-defined, manageable, independent tasks, which should be executed in parallel and holistically together implement the project.`;
      case 'split':
        return `${basePrompt} Split the given task into well-defined, manageable, independent sub-tasks, ${suffix}`;
      case 'regenerate':
        return `${basePrompt} Generate a complementary task based on existing sibling_tasks and ancestors_chain. All existing sibling_tasks, including that, which should be generated are independent and manageable tasks, ${suffix}`;
      default:
        throw new Error(`Invalid operation type: ${this.options.operation}`);
    }
  }
}
