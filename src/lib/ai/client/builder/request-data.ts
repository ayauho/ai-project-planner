'use client';

import { Builder, RequestDataOptions } from './types';
import { logger } from '@/lib/client/logger';

export class RequestDataBuilder implements Builder<Record<string, unknown>> {
  constructor(private options: RequestDataOptions) {}

  build(): Record<string, unknown> {
    logger.debug('[TRACE] Building client request data', { 
      operation: this.options.operation,
      dataKeys: Object.keys(this.options.data || {})
    }, 'ai-client request-data');

    if (!this.options.data) {
      throw new Error('Request data is required');
    }

    switch (this.options.operation) {
      case 'decompose':
        return this.buildDecomposeData();      
      case 'split':
        return this.buildSplitData();
      case 'regenerate':
        return this.buildRegenerateData();
      default:
        throw new Error(`Invalid operation type: ${this.options.operation}`);
    }
  }

  private buildDecomposeData(): Record<string, unknown> {
    // Log the full data structure to debug
    logger.debug('[TRACE] Building decompose data', {
      data: this.options.data,
      hasProject: !!this.options.data.project,
      projectKeys: this.options.data.project ? Object.keys(this.options.data.project) : []
    }, 'ai-client request-data decompose');

    // Check if we have project data in the expected structure
    if (this.options.data.project) {
      const project = this.options.data.project as Record<string, string>;
      
      if (!project.name || !project.description) {
        logger.error('[TRACE] Invalid project data', { project }, 'ai-client request-data error');
        throw new Error('Project name and description are required');
      }
      
      return {
        name: project.name,
        description: project.description,
        definition: project.definition || 'project'
      };
    }
    
    // If project data is directly in the data object
    const { name, description } = this.options.data as Record<string, string>;
    if (!name || !description) {
      logger.error('[TRACE] Invalid project data at root level', { data: this.options.data }, 'ai-client request-data error');
      throw new Error('Project name and description are required');
    }
    
    return {
      name,
      description,
      definition: 'project'
    };
  }  

  private buildSplitData(): Record<string, unknown> {
    const data = this.options.data;
    logger.debug('[TRACE] Building split request data', {
      dataKeys: Object.keys(data),
      hasTask: !!data.task,
      hasAncestors: !!data.ancestors
    }, 'ai-client request-data split');

    const task = data.task as Record<string, string>;
    const ancestors = data.ancestors as Array<Record<string, string>> || [];

    if (!task || !task.name || !task.description) {
      logger.error('[TRACE] Invalid task data', { task }, 'ai-client request-data error');
      throw new Error('Task data is required');
    }

    const requestData = {
      task_info: {
        name: task.name,
        description: task.description,
        definition: 'task'
      },
      ancestors_chain: ancestors.map(ancestor => ({
        name: ancestor.name,
        description: ancestor.description,
        definition: ancestor.definition || 'task'
      }))
    };

    logger.debug('[TRACE] Built split request data', {
      taskName: requestData.task_info.name,
      ancestorCount: requestData.ancestors_chain.length,
      ancestorNames: requestData.ancestors_chain.map(a => a.name)
    }, 'ai-client request-data split');

    return requestData;
  }

  private buildRegenerateData(): Record<string, unknown> {
    const data = this.options.data;
    logger.debug('[TRACE] Building regenerate request data', {
      dataKeys: Object.keys(data),
      hasAncestors: !!data.ancestors,
      hasSiblings: !!data.siblings,
      ancestorCount: Array.isArray(data.ancestors) ? data.ancestors.length : 0,
      siblingCount: Array.isArray(data.siblings) ? data.siblings.length : 0
    }, 'ai-client request-data regenerate');

    // Ensure ancestors is always an array
    const ancestors = Array.isArray(data.ancestors) ? data.ancestors : [];
    
    // Ensure siblings is always an array, never undefined
    const siblings = Array.isArray(data.siblings) ? data.siblings : [];

    const requestData = {
      ancestors_chain: ancestors,
      sibling_tasks: siblings
    };

    logger.debug('[TRACE] Built regenerate request data', {
      ancestorCount: requestData.ancestors_chain.length,
      siblingCount: requestData.sibling_tasks.length,
      ancestorNames: requestData.ancestors_chain.map((a: Record<string, string>) => a.name),
      siblingNames: requestData.sibling_tasks.map((s: Record<string, string>) => s.name)
    }, 'ai-client request-data regenerate');

    return requestData;
  }
}
