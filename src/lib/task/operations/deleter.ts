/**
 * Task deletion service implementation
 */

import { ObjectId } from 'mongodb';
import { logger } from '@/lib/logger';
import { taskRepository } from '../repository';
import { TaskNotFoundError } from '../errors';
import { TaskDeletionError } from './errors';
import { TaskDeletionService } from './types';

class TaskDeleterImpl implements TaskDeletionService {
  async deleteTask(taskId: string | ObjectId): Promise<void> {
    try {
      logger.info('Starting task deletion', { taskId }, 'task-operations delete');
      
      try {
        const task = await taskRepository.findById(taskId);
        if (!task) {
          logger.error('Task not found for deletion', { taskId }, 'task-operations delete error');
          throw new TaskDeletionError('Task not found');
        }

        if (task.childrenCount > 0) {
          logger.error('Cannot delete task with children', { taskId, childrenCount: task.childrenCount }, 'task-operations delete error');
          throw new TaskDeletionError('Cannot delete task with children');
        }

        await taskRepository.delete(taskId);
        logger.info('Successfully deleted task', { taskId }, 'task-operations delete');

      } catch (error) {
        if (error instanceof TaskNotFoundError) {
          logger.error('Task not found for deletion', { taskId }, 'task-operations delete error');
          throw new TaskDeletionError('Task not found');
        }
        throw error;
      }

    } catch (error) {
      if (error instanceof TaskDeletionError) {
        throw error;
      }
      logger.error('Failed to delete task', { error, taskId }, 'task-operations delete error');
      throw new TaskDeletionError('Failed to delete task', error instanceof Error ? error : undefined);
    }
  }

  async deleteTaskRecursive(taskId: string | ObjectId): Promise<void> {
    try {
      logger.info('Starting recursive task deletion', { taskId }, 'task-operations delete');
      
      try {
        const task = await taskRepository.findById(taskId);
        if (!task) {
          logger.error('Task not found for recursive deletion', { taskId }, 'task-operations delete error');
          throw new TaskDeletionError('Task not found');
        }

        const children = await taskRepository.findChildren(taskId);

        for (const childTask of children) {
          if (childTask._id) {
            await this.deleteTaskRecursive(childTask._id);
          }
        }

        await taskRepository.delete(taskId);
        logger.info('Successfully deleted task recursively', { taskId }, 'task-operations delete');

      } catch (error) {
        if (error instanceof TaskNotFoundError) {
          logger.error('Task not found for recursive deletion', { taskId }, 'task-operations delete error');
          throw new TaskDeletionError('Task not found');
        }
        throw error;
      }

    } catch (error) {
      if (error instanceof TaskDeletionError) {
        throw error;
      }
      logger.error('Failed to delete task recursively', { error, taskId }, 'task-operations delete error');
      throw new TaskDeletionError('Failed to delete task recursively', error instanceof Error ? error : undefined);
    }
  }
}

export const taskDeleter = new TaskDeleterImpl();
