/**
 * Task hierarchy counter implementation for managing children and descendant counts
 */

import { Types } from 'mongoose';
import { logger } from '@/lib/logger';
import { taskRepository } from '../repository';
import { Task, SystemUpdateTaskInput } from '../types';
import { HierarchyCounter, CountUpdateResult } from './types';
import { CountUpdateError } from './errors';

// Type guard for ObjectId-like objects
const isObjectIdLike = (value: unknown): value is Types.ObjectId => {
  return Boolean(
    value &&
    typeof value === 'object' &&
    (
      value instanceof Types.ObjectId ||
      ('_bsontype' in value && value._bsontype === 'ObjectID')
    )
  );
};

class HierarchyCounterImpl implements HierarchyCounter {
  async updateCounts(taskId: string | Types.ObjectId): Promise<void> {
    const id = this.toObjectId(taskId);
    
    try {
      const task = await taskRepository.findById(id);
      if (!task) {
        logger.warn('Task not found during count update', { taskId: String(id) }, 'task-hierarchy counter');
        return;
      }

      const counts = await this.calculateCounts(task);
      const update: SystemUpdateTaskInput = {
        childrenCount: counts.childrenDelta,
        descendantCount: counts.descendantDelta
      };
      await taskRepository.update(id, update);

      logger.debug('Updated task counts', { taskId: String(id), counts }, 'task-hierarchy counter');
    } catch (error) {
      logger.error('Failed to update hierarchy counts', { taskId: String(id), error }, 'task-hierarchy error');
      throw new CountUpdateError(
        String(id), 
        error instanceof Error ? error : new Error('Unknown error')
      );
    }
  }

  async recalculateCounts(taskId: string | Types.ObjectId): Promise<void> {
    const id = this.toObjectId(taskId);
    
    try {
      const task = await taskRepository.findById(id);
      if (!task) {
        logger.warn('Task not found during count recalculation', { taskId: String(id) }, 'task-hierarchy counter');
        return;
      }

      if (!task._id) {
        throw new Error('Task has no ID');
      }

      // Get all children
      const children = await taskRepository.findChildren(task._id);
      const childrenCount = children.length;

      // Calculate total descendants
      let descendantCount = childrenCount;
      for (const child of children) {
        descendantCount += child.descendantCount;
      }

      const update: SystemUpdateTaskInput = {
        childrenCount,
        descendantCount
      };
      await taskRepository.update(id, update);

      logger.debug('Recalculated task counts', { 
        taskId: String(id), 
        childrenCount, 
        descendantCount 
      }, 'task-hierarchy counter');
    } catch (error) {
      logger.error('Failed to recalculate hierarchy counts', { 
        taskId: String(id), 
        error 
      }, 'task-hierarchy error');
      throw new CountUpdateError(
        String(id), 
        error instanceof Error ? error : new Error('Unknown error')
      );
    }
  }

  async getTaskWithCounts(task: Task): Promise<Task> {
    if (!task._id) {
      const error = new Error('Task has no ID');
      logger.error('Failed to get task with counts', { error }, 'task-hierarchy error');
      throw error;
    }

    try {
      const counts = await this.calculateCounts(task);
      return {
        ...task,
        childrenCount: counts.childrenDelta,
        descendantCount: counts.descendantDelta
      };
    } catch (error) {
      logger.error('Failed to get task with counts', { 
        taskId: String(task._id), 
        error 
      }, 'task-hierarchy error');
      throw new CountUpdateError(
        String(task._id), 
        error instanceof Error ? error : new Error('Unknown error')
      );
    }
  }

  private async calculateCounts(task: Task): Promise<CountUpdateResult> {
    if (!task._id) {
      throw new Error('Task has no ID');
    }

    const children = await taskRepository.findChildren(task._id);
    const childrenCount = children.length;
    let descendantCount = childrenCount;

    for (const child of children) {
      descendantCount += child.descendantCount;
    }

    return {
      childrenDelta: childrenCount,
      descendantDelta: descendantCount
    };
  }

  private toObjectId(value: string | Types.ObjectId): Types.ObjectId {
    try {
      // If it's already an ObjectId or ObjectId-like, use it
      if (isObjectIdLike(value)) {
        return value as Types.ObjectId;
      }

      // If it's a string, create new ObjectId
      if (typeof value === 'string') {
        return new Types.ObjectId(value);
      }

      throw new Error('Invalid ObjectId type');
    } catch (error) {
      throw new CountUpdateError(String(value), error instanceof Error ? error : new Error('Invalid task ID'));
    }
  }
}

export const hierarchyCounter = new HierarchyCounterImpl();
