'use client';

import { logger } from '@/lib/client/logger';
import { CountUpdateError } from '../errors';
import { Types } from 'mongoose';

class HierarchyCounterClientImpl {
  async updateCounts(taskId: string | Types.ObjectId): Promise<void> {
    const id = this.toObjectId(taskId);
    
    try {
      logger.info('Updating hierarchy counts', { taskId: String(id) }, 'task-hierarchy client');
      
      const response = await fetch(`/api/tasks/${id}/counts`, {
        method: 'POST'
      });

      if (!response.ok) {
        throw new Error(`Failed to update counts: ${response.statusText}`);
      }

      logger.debug('Updated task counts', { taskId: String(id) }, 'task-hierarchy client');
    } catch (error) {
      logger.error('Failed to update hierarchy counts', { 
        taskId: String(id),
        error 
      }, 'task-hierarchy client error');
      throw new CountUpdateError(
        String(id),
        error instanceof Error ? error : new Error('Unknown error')
      );
    }
  }

  async recalculateCounts(taskId: string | Types.ObjectId): Promise<void> {
    const id = this.toObjectId(taskId);
    
    try {
      logger.info('Recalculating hierarchy counts', { taskId: String(id) }, 'task-hierarchy client');
      
      const response = await fetch(`/api/tasks/${id}/counts/recalculate`, {
        method: 'POST'
      });

      if (!response.ok) {
        throw new Error(`Failed to recalculate counts: ${response.statusText}`);
      }

      logger.debug('Recalculated task counts', { taskId: String(id) }, 'task-hierarchy client');
    } catch (error) {
      logger.error('Failed to recalculate hierarchy counts', {
        taskId: String(id),
        error
      }, 'task-hierarchy client error');
      throw new CountUpdateError(
        String(id),
        error instanceof Error ? error : new Error('Unknown error')
      );
    }
  }

  private toObjectId(value: string | Types.ObjectId): Types.ObjectId {
    try {
      if (value instanceof Types.ObjectId) {
        return value;
      }
      return new Types.ObjectId(value.toString());
    } catch (error) {
      throw new CountUpdateError(
        String(value),
        error instanceof Error ? error : new Error('Invalid task ID')
      );
    }
  }
}

export const hierarchyCounter = new HierarchyCounterClientImpl();
