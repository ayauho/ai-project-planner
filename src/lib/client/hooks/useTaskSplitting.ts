'use client';

import { useCallback } from 'react';
import { useTaskOperations } from '@/lib/client/hooks/useTaskOperations';
import { logger } from '@/lib/client/logger';

export interface TaskSplittingHookResult {
  splitTask: (taskId: string) => Promise<void>;
  isLoading: boolean;
}

export function useTaskSplitting(): TaskSplittingHookResult {
  const { taskGenerator, setLoading, isLoading } = useTaskOperations();

  const splitTask = useCallback(async (taskId: string) => {
    if (isLoading) return;

    try {
      setLoading(true);
      logger.info('Starting task split operation', { taskId }, 'task-operation task-splitting');
      
      await taskGenerator.splitTask(taskId);
      
      logger.info('Task split completed', { taskId }, 'task-operation task-splitting');
    } catch (error) {
      logger.error('Failed to split task', {
        taskId,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'task-operation task-splitting error');
      throw error;
    } finally {
      setLoading(false);
    }
  }, [taskGenerator, setLoading, isLoading]);

  return {
    splitTask,
    isLoading
  };
}
