'use client';

import { Task } from '@/lib/task/types';
import { logger } from '@/lib/client/logger';
import { TaskVisualState } from '@/lib/workspace/state/types';
import { svgOrderManager } from '@/lib/client/visual/utils/svg-order';
import { workspaceStateManager } from '@/lib/workspace/state/manager';
import { TaskEventEmitter } from '@/lib/client/visual/task/events';
// Import OPACITY_DECREASING_FACTOR for graduated opacity calculations
import { OPACITY_DECREASING_FACTOR } from '@/lib/client/visual/task/constants';

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
  opacityValues: Map<string, number>; // Stores specific opacity values for graduated rendering
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
    const opacityValues = new Map<string, number>();

    try {
      // Find the selected task
      const selectedTask = tasks.find(t => t._id && t._id.toString() === selectedTaskId);
      
      if (!selectedTask) {
        logger.warn('Selected task not found', { selectedTaskId }, 'task-hierarchy visibility');
        return { activeTaskIds, semiTransparentTaskIds, hiddenTaskIds, states, opacityValues };
      }

      // 1. Selected task is active
      activeTaskIds.push(selectedTaskId);
      states.set(selectedTaskId, 'active');
      opacityValues.set(selectedTaskId, 1.0); // Full opacity for active task
      
      // Register task level for z-index management
      const selectedLevel = svgOrderManager.calculateTaskLevel(selectedTask.parentId?.toString());
      
      // Use OPACITY_DECREASING_FACTOR imported at the top of the file
      
      // 2. Find parent task or project and start building the ancestor chain
      const ancestorChain: Task[] = [];
      let currentTask = selectedTask;
      
      // First collect the full chain
      while (currentTask.parentId) {
        const parent = tasks.find(t => t._id && t._id.toString() === currentTask.parentId?.toString());
        if (!parent) break;
        ancestorChain.push(parent);
        currentTask = parent;
      }
      
      // Now process the chain with graduated opacity
      let currentOpacity = 1.0; // Start with full opacity        // Process ancestors with graduated opacity
      for (let i = 0; i < ancestorChain.length; i++) {
        const ancestor = ancestorChain[i];
        if (!ancestor._id) continue;
        
        const ancestorId = ancestor._id.toString();
        
        // Calculate opacity for this ancestor level using OPACITY_DECREASING_FACTOR
        currentOpacity = currentOpacity * OPACITY_DECREASING_FACTOR;
        
        // Store the calculated opacity value
        opacityValues.set(ancestorId, currentOpacity);
        
        // Create a custom state based on opacity
        const opacityState: TaskVisualState = `opacity-${currentOpacity.toFixed(3)}`;
        
        // Set state and add to semi-transparent list
        states.set(ancestorId, opacityState);
        semiTransparentTaskIds.push(ancestorId);
        
        // Register ancestor level for z-index management
        const _ancestorLevel = svgOrderManager.calculateTaskLevel(ancestor.parentId?.toString());
        
        logger.debug('Set ancestor opacity', {
          ancestorId,
          level: i + 1,
          opacity: currentOpacity,
          opacityFactor: OPACITY_DECREASING_FACTOR,
          state: opacityState
        }, 'task-hierarchy opacity');
      }
      
      // Handle the project if it's not already in the ancestor chain
      if (projectId && !ancestorChain.some(a => a._id?.toString() === projectId)) {
        // Calculate project opacity - one more level down using OPACITY_DECREASING_FACTOR
        const projectOpacity = currentOpacity * OPACITY_DECREASING_FACTOR;
        
        // Store the calculated opacity value
        opacityValues.set(projectId, projectOpacity);
        
        // Create a custom state based on opacity
        const opacityState: TaskVisualState = `opacity-${projectOpacity.toFixed(3)}`;
        
        // Set state and add to semi-transparent list
        states.set(projectId, opacityState);
        semiTransparentTaskIds.push(projectId);
        
        logger.debug('Set project opacity', {
          projectId,
          opacity: projectOpacity,
          opacityFactor: OPACITY_DECREASING_FACTOR,
          calculationPath: `${currentOpacity} * ${OPACITY_DECREASING_FACTOR} = ${projectOpacity}`,
          state: opacityState
        }, 'task-hierarchy opacity');
      }// 4. Find sibling tasks (share same parent)
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
          opacityValues.set(siblingId, 0);
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
          opacityValues.set(childId, 1.0); // Full opacity for active children
          
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
            opacityValues.set(taskId, 0);
          }
        }
      }

      logger.debug('Task hierarchy calculated with graduated opacity', {
        selectedTaskId,
        activeCount: activeTaskIds.length,
        semiTransparentCount: semiTransparentTaskIds.length,
        hiddenCount: hiddenTaskIds.length,
        opacityLevels: opacityValues.size
      }, 'task-hierarchy visibility');

      return {
        activeTaskIds,
        semiTransparentTaskIds,
        hiddenTaskIds,
        states,
        opacityValues
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
        states: new Map(),
        opacityValues: new Map()
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
    const opacityValues = new Map<string, number>();

    try {
      // 1. Project is active
      states.set(projectId, 'active');
      activeTaskIds.push(projectId);
      opacityValues.set(projectId, 1.0); // Full opacity for project

      // 2. First-level tasks (direct descendants) are active
      const firstLevelTasks = tasks.filter(t => 
        !t.parentId || (t.parentId && t.parentId.toString() === projectId)
      );

      for (const task of firstLevelTasks) {
        if (task._id) {
          const taskId = task._id.toString();
          activeTaskIds.push(taskId);
          states.set(taskId, 'active');
          opacityValues.set(taskId, 1.0); // Full opacity for active tasks
        }
      }

      // 3. All other tasks are hidden
      for (const task of tasks) {
        if (task._id) {
          const taskId = task._id.toString();
          if (!states.has(taskId)) {
            hiddenTaskIds.push(taskId);
            states.set(taskId, 'hidden');
            opacityValues.set(taskId, 0); // Zero opacity for hidden tasks
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
        states,
        opacityValues
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
        states: new Map(),
        opacityValues: new Map()
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
        hiddenCount: hierarchy.hiddenTaskIds.length,
        opacityLevels: hierarchy.opacityValues?.size || 0
      }, 'task-hierarchy state');

      // Get current state
      const state = workspaceStateManager.getState();
      
      // Apply new states
      workspaceStateManager.updateState({
        ...state,
        taskVisualStates: hierarchy.states
      }, 'visual');
      
      // Store opacity values for reference by other components
      // Create a custom event to communicate opacity values to components
      if (typeof window !== 'undefined' && hierarchy.opacityValues?.size > 0) {
        const opacityEvent = new CustomEvent('hierarchy-opacity-update', {
          detail: {
            opacityValues: Array.from(hierarchy.opacityValues.entries())
          }
        });
        window.dispatchEvent(opacityEvent);
        
        logger.debug('Dispatched hierarchy opacity event', {
          opacityLevelCount: hierarchy.opacityValues.size
        }, 'task-hierarchy opacity');
      }

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
