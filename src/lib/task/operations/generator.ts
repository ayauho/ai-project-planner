/**
 * Task generation service implementation
 */

import { ObjectId } from 'mongodb';
import { logger } from '@/lib/logger';
import { processRequest } from '@/lib/ai/request/processor';
import { taskRepository } from '../repository';
import { Task } from '../types';
import { TaskGenerationError } from './errors';
import { TaskGenerationService, TaskGenerationOptions, AITaskResponse } from './types';

class TaskGeneratorImpl implements TaskGenerationService {
  async splitTask(taskId: string | ObjectId, options?: TaskGenerationOptions): Promise<Task[]> {
    try {
      logger.info('Starting task split operation', { taskId }, 'task-operations generator');
      
      const task = await taskRepository.findById(taskId);
      if (!task) {
        logger.error('Task not found for splitting', { taskId }, 'task-operations generator error');
        throw new TaskGenerationError('Task not found');
      }

      // Get ancestor chain from parent to project root
      const ancestors = await this.getAncestorChain(task);
      logger.debug('[TRACE] Retrieved ancestor chain', { 
        taskId, 
        ancestorCount: ancestors.length,
        ancestors: ancestors.map(a => ({ id: a._id, name: a.name }))
      }, 'task-operations generator');

      const requestData = {
        task: {
          name: task.name,
          description: task.description,
          definition: 'task'
        },
        ancestors: ancestors.map(ancestor => ({
          name: ancestor.name,
          description: ancestor.description,
          definition: ancestor.isProjectRoot ? 'project' : 'task'
        }))
      };

      logger.debug('[TRACE] Prepared request data', {
        taskId,
        taskName: requestData.task.name,
        ancestorCount: requestData.ancestors.length,
        ancestorNames: requestData.ancestors.map(a => a.name)
      }, 'task-operations generator');

      const aiResponse = await processRequest('split', requestData);

      if (!aiResponse?.content || !Array.isArray(aiResponse.content)) {
        logger.error('Invalid AI response for task splitting', { taskId }, 'task-operations generator error');
        throw new TaskGenerationError('Invalid AI response');
      }

      if (options?.validateOnly) {
        return [];
      }

      const subtasks = await Promise.all(aiResponse.content.map(async (subtask: AITaskResponse) => {
        const position = { x: task.position.x, y: task.position.y + 100 };
        return taskRepository.create({
          projectId: task.projectId,
          parentId: task._id,
          name: subtask.name,
          description: subtask.description,
          position,
          childrenCount: 0,
          descendantCount: 0
        });
      }));

      logger.info('Successfully split task', { 
        taskId, 
        subtasksCount: subtasks.length,
        ancestorCount: ancestors.length 
      }, 'task-operations generator');
      return subtasks;

    } catch (error) {
      if (error instanceof TaskGenerationError) {
        throw error;
      }
      logger.error('Failed to split task', { error, taskId }, 'task-operations generator error');
      throw new TaskGenerationError('Failed to split task', error instanceof Error ? error : undefined);
    }
  }

  private async getAncestorChain(task: Task): Promise<Task[]> {
    const ancestors: Task[] = [];
    let currentTask = task;
    let depth = 0;
    const maxDepth = 10; // Safety limit
    
    logger.debug('[TRACE] Starting ancestor chain collection', {
      taskId: task._id,
      taskName: task.name
    }, 'task-operations generator');

    // Start from parent and go up to project
    while (currentTask.parentId && depth < maxDepth) {
      const parent = await taskRepository.findById(currentTask.parentId);
      if (!parent) {
        logger.warn('[TRACE] Parent not found in chain', {
          childId: currentTask._id,
          parentId: currentTask.parentId
        }, 'task-operations generator warning');
        break;
      }
      
      logger.debug('[TRACE] Found ancestor', {
        depth,
        ancestorId: parent._id,
        ancestorName: parent.name
      }, 'task-operations generator');

      // Add to beginning to maintain project->parent order
      ancestors.unshift(parent);
      currentTask = parent;
      depth++;
    }

    // Add project at the beginning if not already included
    if (!ancestors.find(a => a.isProjectRoot)) {
      const project = await taskRepository.findById(task.projectId);
      if (project) {
        logger.debug('[TRACE] Adding project to chain', {
          projectId: project._id,
          projectName: project.name
        }, 'task-operations generator');
        ancestors.unshift({ ...project, isProjectRoot: true });
      }
    }

    logger.debug('[TRACE] Completed ancestor chain collection', {
      taskId: task._id,
      chainLength: ancestors.length,
      chain: ancestors.map(a => ({ id: a._id, name: a.name }))
    }, 'task-operations generator');

    return ancestors;
  }

  async regenerateTask(taskId: string | ObjectId, options?: TaskGenerationOptions): Promise<Task> {
    try {
      logger.info('Starting task regeneration', { taskId }, 'task-operations generator');
      
      const task = await taskRepository.findById(taskId);
      if (!task) {
        logger.error('Task not found for regeneration', { taskId }, 'task-operations generator error');
        throw new TaskGenerationError('Task not found');
      }

      const aiResponse = await processRequest('regenerate', {
        task: {
          name: task.name,
          description: task.description,
          definition: 'task'
        }
      });

      if (!aiResponse?.content || typeof aiResponse.content !== 'object') {
        logger.error('Invalid AI response for task regeneration', { taskId }, 'task-operations generator error');
        throw new TaskGenerationError('Invalid AI response');
      }

      const newTask = aiResponse.content as AITaskResponse;

      if (options?.validateOnly) {
        return task;
      }

      const updatedTask = await taskRepository.update(taskId, {
        name: newTask.name,
        description: newTask.description
      });

      logger.info('Successfully regenerated task', { taskId }, 'task-operations generator');
      return updatedTask;

    } catch (error) {
      logger.error('Failed to regenerate task', { error, taskId }, 'task-operations generator error');
      throw new TaskGenerationError('Failed to regenerate task', error instanceof Error ? error : undefined);
    }
  }  
}

export const taskGenerator = new TaskGeneratorImpl();
