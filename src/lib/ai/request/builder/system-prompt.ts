// System prompt builder implementation
import { Builder, SystemPromptOptions } from './types';
import logger from '@/lib/logger';

export class SystemPromptBuilder implements Builder<string> {
  constructor(private options: SystemPromptOptions) {}

  build(): string {
    logger.debug('Building system prompt', { operation: this.options.operation });
    
    const basePrompt = `You are a specialized AI trained to assist with project planning and task organization.`;
    
    switch (this.options.operation) {
      case 'decompose':
        return `${basePrompt} Break down the given project into manageable, independent tasks, which should be executed in parallel and holistically to implement the project.`;
      case 'split':
        return `${basePrompt} Split the given task into manageable, independent sub-tasks, which should be executed in parallel and holistically to implement the given first ancestor task.`;
      case 'regenerate':
        return `${basePrompt} Generate a complementary task based on existing tasks. All existing tasks are independent and manageable tasks, which should be executed in parallel and holistically to implement the given first ancestor task or project.`;
      default:
        throw new Error(`Invalid operation type: ${this.options.operation}`);
    }
  }
}
