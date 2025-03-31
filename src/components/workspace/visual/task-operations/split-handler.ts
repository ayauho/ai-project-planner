'use client';
import { logger } from '@/lib/client/logger';
import { taskGenerator } from '@/lib/task/operations/client';
import { Task } from '@/lib/task/types';
import { workspaceStateManager } from '@/lib/workspace/state/manager';
import { TaskEventEmitter } from '@/lib/client/visual/task/events';
import { taskStateCoordinator } from '../task-hierarchy/state-coordinator';
import { aiErrorConnector } from '@/lib/client/error-connector';

// Add TypeScript declaration for window.saveWorkspaceState
declare global {
  interface Window {
    saveWorkspaceState?: () =>void;
  }
}

/**
 * Handles task splitting operations and related animations
 */
export async function splitHandler(taskId: string): Promise<void>{
  // Skip if the click was on a counter (safety check)
  const isCounterClick = document.activeElement?.classList.contains('counter-display') || 
                         document.activeElement?.classList.contains('project-counter') ||
                         document.activeElement?.getAttribute('data-project-counter') === 'true';
  
  if (isCounterClick) {
    logger.debug('Ignoring split attempt from counter click', { taskId }, 'task-split safety');
    return;
  }

  logger.info('Starting task split operation', { taskId }, 'task-split start');

  try {
    // Add operation tracking class to prevent duplicate operations
    if (document.body.classList.contains('task-split-in-progress')) {
      logger.warn('Split operation already in progress', { taskId }, 'task-split safety');
      return;
    }
    
    // Mark split operation as in progress
    document.body.classList.add('task-split-in-progress');
    
    // Emit split event to signal the beginning of the operation
    TaskEventEmitter.getInstance().emit({
      taskId,
      type: 'split'
    });

    // Get task data to build ancestor chain
    const state = workspaceStateManager.getState();
    const task = state.tasks.find(t =>t._id?.toString() === taskId);

    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    // Get the ancestor chain
    const ancestors = getAncestorChain(task, state.tasks);
    
    logger.debug('Retrieved ancestor chain', { 
      taskId, 
      ancestorCount: ancestors.length 
    }, 'task-split preparation');

    // Execute the split operation
    const subtasks = await taskGenerator.splitTask(taskId);
    
    logger.info('Split operation completed', { 
      taskId, 
      subtaskCount: subtasks.length 
    }, 'task-split complete');

    // Update the tasks in the workspace
    workspaceStateManager.updateTasks([...subtasks, task]);

    // After split, the task becomes the selected element
    if (taskId) {
      taskStateCoordinator.handleTaskSelection(taskId);
    }

    // Emit split complete event to signal the end of the operation
    TaskEventEmitter.getInstance().emit({
      taskId,
      type: 'splitComplete',
      data: {
        subtaskCount: subtasks.length
      }
    });
    
    // Dispatch a custom event for state saving
    // But don't trigger an immediate save - let the centering event handle it
    window.dispatchEvent(new CustomEvent('task-split-complete', {
      detail: {
        taskId,
        subtaskCount: subtasks.length,
        timestamp: Date.now()
      }
    }));
    
    // We don't need to call saveWorkspaceState directly here
    // The centering completion event will take care of saving state
    // after the viewport is properly positioned
    logger.info('Split complete, state will be saved after centering', {
      taskId,
      subtaskCount: subtasks.length
    }, 'task-split complete');

    return;
  } catch (error) {
    logger.error('Failed to split task', { 
      taskId, 
      error: error instanceof Error ? error.message : String(error) 
    }, 'task-split error');
    
    // Emit error event - but only do this once to avoid duplicate error messages
    // We'll rely on the error connector for UI notifications
    try {
      aiErrorConnector.reportAIError(
        error instanceof Error ? error.message : String(error),
        'split'
      );
    } catch (reportError) {
      // If error connector fails, fall back to task event emitter
      TaskEventEmitter.getInstance().emit({
        taskId,
        type: 'error',
        data: {
          error: error instanceof Error ? error.message : String(error),
          operation: 'split'
        }
      });
    }
    
    throw error;
  } finally {
    // Always remove the in-progress class, even if there was an error
    document.body.classList.remove('task-split-in-progress');
  }
}

/**
 * Gets array of ancestor tasks from given task
 */
export function getAncestorChain(task: Task, tasks: Task[]): Task[] {
  const ancestors: Task[] = [];
  let currentTask = task;

  while (currentTask.parentId) {
    const parent = tasks.find(t =>t._id && t._id.toString() === currentTask.parentId?.toString());
    if (!parent) break;

    ancestors.push(parent);
    currentTask = parent;
  }

  return ancestors;
}
