import { Builder, RequestDataOptions } from './types';
import { ValidationError } from '../errors';
import { logger } from '@/lib/client/logger';

export class RequestDataBuilder implements Builder<Record<string, unknown>> {
  constructor(private options: RequestDataOptions) {}

  build(): Record<string, unknown> {
    logger.debug('[TRACE] Building request data', { 
      operation: this.options.operation,
      hasData: !!this.options.data,
      dataKeys: this.options.data ? Object.keys(this.options.data) : []
    });

    if (!this.options.data) {
      logger.error('Request data missing');
      throw new ValidationError('Request data is required');
    }

    try {
      let result;
      switch (this.options.operation) {
        case 'decompose':
          result = this.buildDecomposeData();
          break;
        case 'split':
          result = this.buildSplitData();
          break;
        case 'regenerate':
          result = this.buildRegenerateData();
          break;
        default:
          logger.error('Invalid operation type', { type: this.options.operation });
          throw new ValidationError(`Invalid operation type: ${this.options.operation}`);
      }

      logger.debug('[TRACE] Built request data', {
        operation: this.options.operation,
        resultKeys: Object.keys(result)
      });

      return result;
    } catch (error) {
      logger.error('Failed to build request data', { 
        operation: this.options.operation,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  private buildSplitData(): Record<string, unknown> {
    const data = this.options.data;
    logger.debug('[TRACE] Starting split data build', {
      dataKeys: Object.keys(data)
    });

    // Validate task data
    if (!data.task || typeof data.task !== 'object') {
      logger.error('[TRACE] Invalid task data', { data });
      throw new ValidationError('Task data is invalid or missing');
    }

    const task = data.task as Record<string, string>;
    if (!task.name || !task.description) {
      logger.error('[TRACE] Missing task properties', { task });
      throw new ValidationError('Task name and description are required');
    }

    // Validate ancestors array
    if (!Array.isArray(data.ancestors)) {
      logger.error('[TRACE] Ancestors is not an array', { 
        ancestorsType: typeof data.ancestors
      });
      throw new ValidationError('Ancestors must be an array');
    }

    logger.debug('[TRACE] Building split request format', {
      taskName: task.name,
      ancestorCount: data.ancestors.length,
      ancestorNames: data.ancestors.map((a: Record<string, string>) => a.name)
    });

    const result = {
      task_info: {
        name: task.name,
        description: task.description,
        definition: task.definition || 'task'
      },
      ancestors_chain: data.ancestors.map((ancestor: Record<string, string>) => ({
        name: ancestor.name,
        description: ancestor.description,
        definition: ancestor.definition || 'task'
      }))
    };

    logger.debug('[TRACE] Built split request data', {
      taskName: result.task_info.name,
      ancestorCount: result.ancestors_chain.length
    });

    return result;
  }

  private buildDecomposeData(): Record<string, unknown> {
    const { name, description } = this.options.data as Record<string, string>;
    
    logger.debug('Building decompose data', { hasName: !!name, hasDescription: !!description });
    
    if (!name || !description) {
      logger.error('Invalid decompose data', { hasName: !!name, hasDescription: !!description });
      throw new ValidationError('Project name and description are required');
    }
    
    return {
      name,
      description,
      definition: 'project'
    };
  }

  private buildRegenerateData(): Record<string, unknown> {
    const { ancestors, siblings } = this.options.data as Record<string, unknown>;
    
    logger.debug('Building regenerate data', {
      hasAncestors: !!ancestors,
      hasSiblings: !!siblings
    });

    if (!ancestors || !siblings) {
      logger.error('Invalid regenerate data', {
        hasAncestors: !!ancestors,
        hasSiblings: !!siblings
      });
      throw new ValidationError('Ancestors chain and sibling tasks are required');
    }

    return {
      ancestors_chain: ancestors,
      sibling_tasks: siblings
    };
  }
}
