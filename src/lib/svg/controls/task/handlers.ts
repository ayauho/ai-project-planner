// Event handlers for task controls
import { logger } from '@/lib/logger';
import { ControlEvent, ControlEventHandler } from '../types';
import { ControlEventError } from '../errors';

export const createExpandHandler = (taskId: string): ControlEventHandler => {
  return async (event: ControlEvent) => {
    try {
      logger.info('Handling expand event', { taskId, event }, 'task-controls handler');
      // Expansion logic handled by parent component
    } catch (error) {
      logger.error('Error in expand handler', { taskId, error }, 'task-controls error');
      throw new ControlEventError('Failed to handle expand event', 'expand', { taskId });
    }
  };
};

export const createRegenerateHandler = (taskId: string): ControlEventHandler => {
  return async (event: ControlEvent) => {
    try {
      logger.info('Handling regenerate event', { taskId, event }, 'task-controls handler');
      // Regeneration logic handled by parent component
    } catch (error) {
      logger.error('Error in regenerate handler', { taskId, error }, 'task-controls error');
      throw new ControlEventError('Failed to handle regenerate event', 'regenerate', { taskId });
    }
  };
};

export const createDeleteHandler = (taskId: string): ControlEventHandler => {
  return async (event: ControlEvent) => {
    try {
      logger.info('Handling delete event', { taskId, event }, 'task-controls handler');
      // Deletion logic handled by parent component
    } catch (error) {
      logger.error('Error in delete handler', { taskId, error }, 'task-controls error');
      throw new ControlEventError('Failed to handle delete event', 'delete', { taskId });
    }
  };
};
