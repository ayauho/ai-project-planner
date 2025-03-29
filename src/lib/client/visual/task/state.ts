'use client';

import { logger } from '@/lib/client/logger';
import { TaskVisualState } from '@/lib/task/types';
import { TaskEventEmitter } from './events';
import { workspaceStateManager } from '@/lib/workspace/state/manager';
import { TaskHierarchyState } from '@/lib/workspace/state/types';

class TaskStateManagerImpl {
  private emitter: TaskEventEmitter;

  constructor() {
    this.emitter = TaskEventEmitter.getInstance();
    this.setupEventListeners();
  }

  private setupEventListeners() {
    this.emitter.addListener((event) => {
      if (event.type === 'split') {
        this.handleSplitStart(event.taskId);
      } else if (event.type === 'splitComplete') {
        this.handleSplitComplete(event.taskId, event.data?.childIds as string[]);
      }
    });
  }

  private handleSplitStart(taskId: string) {
    logger.debug('Handling split start', { taskId }, 'task-state-manager split-operation');
    
    const hierarchyState: TaskHierarchyState = {
      expandedTaskId: taskId,
      parentState: 'semi-transparent',
      siblingState: 'hidden',
      childState: 'active'
    };

    workspaceStateManager.updateTaskVisualStates(hierarchyState);
  }

  private handleSplitComplete(taskId: string, childIds: string[] = []) {
    logger.debug('Handling split complete', { taskId, childIds }, 'task-state-manager split-operation');
    
    const hierarchyState: TaskHierarchyState = {
      expandedTaskId: taskId,
      parentState: 'semi-transparent',
      siblingState: 'hidden',
      childState: 'active'
    };

    workspaceStateManager.updateTaskVisualStates(hierarchyState);
  }

  getState(taskId: string): TaskVisualState {
    const state = workspaceStateManager.getState();
    return state.taskVisualStates.get(taskId) || 'active';
  }

  reset() {
    const hierarchyState: TaskHierarchyState = {
      expandedTaskId: '',
      parentState: 'active',
      siblingState: 'active',
      childState: 'active'
    };
    
    workspaceStateManager.updateTaskVisualStates(hierarchyState);
  }
}

export const taskStateManager = new TaskStateManagerImpl();
