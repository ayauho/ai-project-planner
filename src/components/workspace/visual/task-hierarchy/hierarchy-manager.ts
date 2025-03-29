'use client';

import { Task } from '@/lib/task/types';
import { logger } from '@/lib/client/logger';
import { TaskVisualState } from '@/lib/workspace/state/types';
import { svgOrderManager } from '@/lib/client/visual/utils/svg-order';
import { workspaceStateManager } from '@/lib/workspace/state/manager';
import { TaskEventEmitter } from '@/lib/client/visual/task/events';

export interface HierarchyContext {
  tasks: Task[];
  projectId: string | null;
  ancestorIds?: string[];
}

export interface TaskHierarchyResult {
  activeTaskIds: string[];
  semiTransparentTaskIds: string[];
  hiddenTaskIds: string[];
  states: Map<string, TaskVisualState>;
}

class TaskHierarchyManager {
  private static instance: TaskHierarchyManager;
  private taskEventEmitter: TaskEventEmitter;

  private constructor() {
    this.taskEventEmitter = TaskEventEmitter.getInstance();
  }

  public static getInstance(): TaskHierarchyManager {
    if (!TaskHierarchyManager.instance) {
      TaskHierarchyManager.instance = new TaskHierarchyManager();
    }
    return TaskHierarchyManager.instance;
  }

  /**
   * Calculate visibility states when a task is selected
   */
  public calculateTaskHierarchy(selectedTaskId: string, context: HierarchyContext): TaskHierarchyResult {
    const { tasks, projectId } = context;

    logger.info('Calculating task hierarchy', {
      selectedTaskId,
      totalTasks: tasks.length,
      projectId
    }, 'task-hierarchy visibility');

    // Create result collections
    const activeTaskIds: string[] = [];
    const semiTransparentTaskIds: string[] = [];
    const hiddenTaskIds: string[] = [];
    const states = new Map<string, TaskVisualState>();

    try {
      // Find the selected task
      const selectedTask = tasks.find(t => t._id && t._id.toString() === selectedTaskId);
      
      if (!selectedTask) {
        logger.warn('Selected task not found', { selectedTaskId }, 'task-hierarchy visibility');
        return { activeTaskIds, semiTransparentTaskIds, hiddenTaskIds, states };
      }

      // 1. Selected task is active
      activeTaskIds.push(selectedTaskId);
      states.set(selectedTaskId, 'active');
      
      // Register task level for z-index management
      const selectedLevel = svgOrderManager.calculateTaskLevel(selectedTask.parentId?.toString());
      
      // 2. Find parent task or project
      const parentId = selectedTask.parentId?.toString() || projectId;
      if (parentId) {
        if (selectedTask.parentId) {
          // Regular task parent
          semiTransparentTaskIds.push(parentId);
          states.set(parentId, 'semi-transparent');
        } 
        else if (projectId) {
          // Project as parent
          semiTransparentTaskIds.push(projectId);
          states.set(projectId, 'semi-transparent');
        }
      }

      // 3. Build complete ancestor chain
      const ancestorChain: Task[] = [];
      let currentTask = selectedTask;

      while (currentTask.parentId) {
        const parent = tasks.find(t => t._id && t._id.toString() === currentTask.parentId?.toString());
        if (!parent) break;

        ancestorChain.push(parent);
        currentTask = parent;
      }

      // All ancestors are semi-transparent
      for (const ancestor of ancestorChain) {
        if (ancestor._id) {
          const ancestorId = ancestor._id.toString();
          semiTransparentTaskIds.push(ancestorId);
          states.set(ancestorId, 'semi-transparent');
          
          // Register ancestor level for z-index management
          const _ancestorLevel = svgOrderManager.calculateTaskLevel(ancestor.parentId?.toString());
        }
      }

      // 4. Find sibling tasks (share same parent)
      const siblingTasks = tasks.filter(t => 
        t.parentId?.toString() === selectedTask.parentId?.toString() &&
        t._id?.toString() !== selectedTaskId
      );

      // Siblings are hidden
      for (const sibling of siblingTasks) {
        if (sibling._id) {
          const siblingId = sibling._id.toString();
          hiddenTaskIds.push(siblingId);
          states.set(siblingId, 'hidden');
        }
      }

      // 5. Find child tasks (direct descendants)
      const childTasks = tasks.filter(t => 
        t.parentId?.toString() === selectedTaskId
      );

      // Children are active
      for (const child of childTasks) {
        if (child._id) {
          const childId = child._id.toString();
          activeTaskIds.push(childId);
          states.set(childId, 'active');
          
          // Register child level for z-index management
          const _childLevel = selectedLevel + 2;
        }
      }

      // 6. All other tasks are hidden
      for (const task of tasks) {
        if (task._id) {
          const taskId = task._id.toString();
          if (!states.has(taskId)) {
            hiddenTaskIds.push(taskId);
            states.set(taskId, 'hidden');
          }
        }
      }

      logger.debug('Task hierarchy calculated', {
        selectedTaskId,
        activeCount: activeTaskIds.length,
        semiTransparentCount: semiTransparentTaskIds.length,
        hiddenCount: hiddenTaskIds.length
      }, 'task-hierarchy visibility');

      return {
        activeTaskIds,
        semiTransparentTaskIds,
        hiddenTaskIds,
        states
      };
    } catch (error) {
      logger.error('Failed to calculate task hierarchy', {
        selectedTaskId,
        error
      }, 'task-hierarchy error');
      return {
        activeTaskIds: [],
        semiTransparentTaskIds: [],
        hiddenTaskIds: [],
        states: new Map()
      };
    }
  }

  /**
   * Calculate visibility states when a project is selected
   */
  public calculateProjectHierarchy(projectId: string, context: HierarchyContext): TaskHierarchyResult {
    const { tasks } = context;

    logger.info('Calculating project hierarchy', {
      projectId,
      totalTasks: tasks.length
    }, 'task-hierarchy visibility');

    // Create result collections
    const activeTaskIds: string[] = [];
    const semiTransparentTaskIds: string[] = [];
    const hiddenTaskIds: string[] = [];
    const states = new Map<string, TaskVisualState>();

    try {
      // 1. Project is active
      states.set(projectId, 'active');
      activeTaskIds.push(projectId);

      // 2. First-level tasks (direct descendants) are active
      const firstLevelTasks = tasks.filter(t => 
        !t.parentId || (t.parentId && t.parentId.toString() === projectId)
      );

      for (const task of firstLevelTasks) {
        if (task._id) {
          const taskId = task._id.toString();
          activeTaskIds.push(taskId);
          states.set(taskId, 'active');
        }
      }

      // 3. All other tasks are hidden
      for (const task of tasks) {
        if (task._id) {
          const taskId = task._id.toString();
          if (!states.has(taskId)) {
            hiddenTaskIds.push(taskId);
            states.set(taskId, 'hidden');
          }
        }
      }

      logger.debug('Project hierarchy calculated', {
        projectId,
        activeCount: activeTaskIds.length,
        hiddenCount: hiddenTaskIds.length
      }, 'task-hierarchy visibility');

      return {
        activeTaskIds,
        semiTransparentTaskIds,
        hiddenTaskIds,
        states
      };
    } catch (error) {
      logger.error('Failed to calculate project hierarchy', {
        projectId,
        error
      }, 'task-hierarchy error');
      return {
        activeTaskIds: [],
        semiTransparentTaskIds: [],
        hiddenTaskIds: [],
        states: new Map()
      };
    }
  }

  /**
   * Apply calculated hierarchy to workspace state
   */
  public applyHierarchy(hierarchy: TaskHierarchyResult): void {
    try {
      logger.debug('Applying hierarchy to workspace state', {
        activeCount: hierarchy.activeTaskIds.length,
        semiTransparentCount: hierarchy.semiTransparentTaskIds.length,
        hiddenCount: hierarchy.hiddenTaskIds.length
      }, 'task-hierarchy state');

      // Get current state
      const state = workspaceStateManager.getState();
      
      // Apply new states
      workspaceStateManager.updateState({
        ...state,
        taskVisualStates: hierarchy.states
      }, 'visual');

      // Emit events for active tasks to coordinate animations
      setTimeout(() => {
        hierarchy.activeTaskIds.forEach(taskId => {
          this.taskEventEmitter.emit({
            taskId,
            type: 'stateChange',
            data: {
              state: 'active',
              isComplete: true
            }
          });
        });
      }, 50);

    } catch (error) {
      logger.error('Failed to apply hierarchy to workspace state', { error }, 'task-hierarchy error');
    }
  }
}

export const taskHierarchyManager = TaskHierarchyManager.getInstance();
