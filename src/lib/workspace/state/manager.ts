'use client';

import { logger } from '@/lib/client/logger';
import { WorkspaceState, WorkspaceStateManager, TaskHierarchyState, TaskVisualState, StateUpdateType } from './types';
import { Task, TaskWithVisualState } from '@/lib/task/types';
import { projectService } from '@/lib/project/client/project-service';
import { Types } from 'mongoose';
import { isStateBeingRestored } from '@/app/preload-state';

// Declare global saveWorkspaceState method for TypeScript
declare global {
  interface Window {
    saveWorkspaceState?: () => void;
  }
}

class WorkspaceStateManagerImpl implements WorkspaceStateManager {
  private static instance: WorkspaceStateManagerImpl;
  private state: WorkspaceState = {
    selectedProject: null,
    tasks: [],
    isLoading: false,
    error: null,
    showProjectCreation: false,
    projectListUpdated: false,
    newlyCreatedProjectId: undefined,
    taskVisualStates: new Map()
  };
  private subscribers: ((state: WorkspaceState, updateType: StateUpdateType) => void)[] = [];
  private projectSelectionInProgress: boolean = false;

  private constructor() {}

  public static getInstance(): WorkspaceStateManagerImpl {
    if (!WorkspaceStateManagerImpl.instance) {
      WorkspaceStateManagerImpl.instance = new WorkspaceStateManagerImpl();
    }
    return WorkspaceStateManagerImpl.instance;
  }

  getState(): WorkspaceState {
    return this.state;
  }

  showProjectCreation(): void {
    // Check if we're in a project selection transition
    const isInTransition = 
      this.projectSelectionInProgress || 
      document.body.hasAttribute('data-project-selection-active') ||
      sessionStorage.getItem('project_selection_active') === 'true';
    
    // Don't show project creation during project selection transitions
    if (isInTransition) {
      logger.info('Ignoring request to show project creation during selection transition', {}, 'workspace-state ui');
      return;
    }
    
    logger.info('Showing project creation interface', {}, 'workspace-state ui');
    this.updateState({ ...this.state, showProjectCreation: true }, 'ui');
  }

  hideProjectCreation(): void {
    logger.info('Hiding project creation interface', {}, 'workspace-state ui');
    this.updateState({ ...this.state, showProjectCreation: false }, 'ui');
  }

  notifyProjectListUpdated(newlyCreatedProjectId?: string): void {
    logger.info('Notifying project list update with new project', { 
      newlyCreatedProjectId,
      stateSnapshot: {
        isLoading: this.state.isLoading,
        showProjectCreation: this.state.showProjectCreation,
        hasSelectedProject: !!this.state.selectedProject
      }
    }, 'workspace-state project');

    // Just update the list - the actual project selection will be handled explicitly 
    // by the component that calls this method
    this.updateState({ 
      ...this.state, 
      projectListUpdated: true,
      newlyCreatedProjectId: newlyCreatedProjectId || undefined
    }, 'ui');
  }

  private lastSelectedProjectId: string | null = null;  
  
  async selectProject(projectId: string, forceNewProject: boolean = false): Promise<void>{
    // Prevent concurrent project selections to avoid race conditions
    if (this.projectSelectionInProgress) {
      logger.warn('Project selection already in progress, skipping concurrent request', { projectId }, 'workspace-state project warning');
      return;
    }
    
    // Check if we're trying to select a project that's currently in selection process
    if (this.lastSelectedProjectId === projectId) {
      logger.warn('Same project already being selected, skipping duplicate selection', { projectId }, 'workspace-state project warning');
      return;
    }
    
    this.projectSelectionInProgress = true;
    this.lastSelectedProjectId = projectId;
    
    // Set a global transition flag to prevent UI interruptions
    document.body.setAttribute('data-project-selection-active', 'true');
    sessionStorage.setItem('project_selection_active', 'true');
    
    try {
      // Get current state to check if we're in project creation mode
      const isInProjectCreation = this.state.showProjectCreation;
      
      // If this project is already selected, check if we should still process the selection
      const currentProjectId = this.state.selectedProject?._id?.toString();
      if (currentProjectId === projectId && !this.state.isLoading && !forceNewProject && !isInProjectCreation) {
        logger.info('Project already selected, skipping selection', { projectId }, 'workspace-state project');
        this.projectSelectionInProgress = false;
        return;
      }
      
      // If we're in project creation mode and selecting a project, hide the creation interface
      if (isInProjectCreation) {
        logger.info('Coming from project creation interface, forcing project selection', { projectId }, 'workspace-state project');
        this.updateState({
          ...this.state,
          showProjectCreation: false
        }, 'ui');
      }
      
      logger.info('Starting project selection', { 
        projectId,
        currentState: {
          isLoading: this.state.isLoading,
          hasSelectedProject: !!this.state.selectedProject
        },
        forceNewProject
      }, 'workspace-state project');

      // Log the change for debugging purposes
      if (currentProjectId !== projectId) {
        logger.info('Project change detected', {
          from: currentProjectId,
          to: projectId
        }, 'workspace-state project');
      }

      // Set loading state
      this.updateState({ ...this.state, isLoading: true, error: null, showProjectCreation: false }, 'loading');
      
      // Clear task visual states before loading new project
      const taskVisualStates = new Map<string, TaskVisualState>();
      
      // Reset newlyCreatedProjectId to prevent reselection on subsequent updates
      const _newState = {
        ...this.state,
        newlyCreatedProjectId: undefined
      };
      
      // Load project data with a direct call - this will throw an error if the project doesn't exist
      let project;
      try {
        project = await projectService.findById(projectId);
        logger.info('Project data loaded', { projectId }, 'workspace-state project');
      } catch (projectError) {
        // Project doesn't exist or can't be loaded
        logger.error('Failed to load project', { 
          projectId, 
          error: String(projectError),
          status: (projectError as {status?: string})?.status || 'unknown' 
        }, 'workspace-state project error');
        
        // Clear any saved state for this project to prevent future errors
        try {
          const { workspacePersistenceManager } = await import('@/lib/workspace/persistence/manager');
          await workspacePersistenceManager.clearState(projectId);
          logger.info('Cleared persistence state for failed project load', { projectId }, 'workspace-state persistence');
        } catch (clearError) {
          logger.warn('Error clearing persistence state', { 
            error: String(clearError) 
          }, 'workspace-state persistence warning');
        }
        
        // Show creation interface
        this.updateState({
          ...this.state,
          isLoading: false,
          error: 'Project could not be loaded',
          showProjectCreation: true
        }, 'error');
        
        throw projectError;
      }
      
      // Load tasks - this is separate to handle the case where a project exists but has no tasks
      try {
        const response = await fetch(`/api/projects/${projectId}/tasks`);
        if (!response.ok) {
          throw new Error(`Failed to load tasks: ${response.statusText}`);
        }

        const tasksData = await response.json();
        const rawTasks = Array.isArray(tasksData) ? tasksData : tasksData.tasks || [];
        
        logger.debug('Processing tasks data', {
          projectId,
          rawTaskCount: rawTasks.length
        }, 'workspace-state tasks');

        const tasks = rawTasks.map((task: Partial<Task>) => ({
          _id: new Types.ObjectId(task._id),
          projectId: new Types.ObjectId(task.projectId),
          parentId: task.parentId ? new Types.ObjectId(task.parentId) : undefined,
          name: task.name!,
          description: task.description!,
          position: task.position || { x: 0, y: 0 },
          childrenCount: task.childrenCount || 0,
          descendantCount: task.descendantCount || 0,
          createdAt: task.createdAt ? new Date(task.createdAt) : undefined,
          updatedAt: task.updatedAt ? new Date(task.updatedAt) : undefined
        }));
        
        // Set up initial visibility rules:
        // - Project is active
        // - First-level tasks (direct descendants) are active
        // - All other tasks are hidden
        
        // First set all tasks to hidden by default
        tasks.forEach((task: Task) => {
          if (task._id) {
            taskVisualStates.set(task._id.toString(), 'hidden');
          }
        });
        
        // Then set first-level tasks to active (direct descendants of project)
        const firstLevelTasks: Task[] = tasks.filter((task: Task) => 
          !task.parentId || (task.parentId && task.parentId.toString() === projectId)
        );
        
        firstLevelTasks.forEach((task: Task) => {
          if (task._id) {
            taskVisualStates.set(task._id.toString(), 'active');
          }
        });
        
        // Project itself is active
        taskVisualStates.set(projectId, 'active');
        
        logger.debug('Setting initial task visibility', {
          projectId,
          firstLevelTaskCount: firstLevelTasks.length,
          totalTaskCount: tasks.length,
          visibilityMap: {
            active: Array.from(taskVisualStates.entries())
              .filter(([_, state]) => state === 'active')
              .map(([id, _]) => id).length,
            hidden: Array.from(taskVisualStates.entries())
              .filter(([_, state]) => state === 'hidden')
              .map(([id, _]) => id).length
          }
        }, 'workspace-state visual');
        
        this.updateState({
          selectedProject: project,
          tasks,
          isLoading: false,
          error: null,
          showProjectCreation: false,
          projectListUpdated: false,
          newlyCreatedProjectId: undefined,
          taskVisualStates
        }, 'project');
        
        logger.info('Project selection completed', { 
          projectId,
          taskCount: tasks.length
        }, 'workspace-state project');
      } catch (tasksError) {
        // Handle case where project exists but tasks loading fails
        logger.error('Failed to load tasks', { 
          projectId, 
          error: String(tasksError) 
        }, 'workspace-state tasks error');
        
        // Still show the project but with no tasks
        this.updateState({
          selectedProject: project,
          tasks: [],
          isLoading: false,
          error: 'Failed to load tasks',
          showProjectCreation: false,
          projectListUpdated: false,
          newlyCreatedProjectId: undefined,
          taskVisualStates
        }, 'project');
      }
    } catch (error) {
      logger.error('Failed to load project', { projectId, error: String(error) }, 'workspace-state project error');
      this.updateState({
        ...this.state,
        isLoading: false,
        error: String(error)
      }, 'error');
      throw error;
    } finally {
      this.projectSelectionInProgress = false;
      
      // Clear the global transition flag
      document.body.removeAttribute('data-project-selection-active');
      sessionStorage.removeItem('project_selection_active');
      
      // Dispatch an event to signal selection is complete
      window.dispatchEvent(new CustomEvent('project-selection-complete', {
        detail: { projectId: projectId }
      }));
      
      // Clear lastSelectedProjectId after a short delay to allow state to settle
      setTimeout(() =>{
        if (this.lastSelectedProjectId === projectId) {
          this.lastSelectedProjectId = null;
        }
      }, 500);
    }
  }

  clearSelection(): void {
    // Check if we're in a project selection transition
    const isInTransition = 
      this.projectSelectionInProgress || 
      document.body.hasAttribute('data-project-selection-active') ||
      sessionStorage.getItem('project_selection_active') === 'true';
      
    logger.info('Clearing workspace selection', { isInTransition }, 'workspace-state manager');
    
    // If in transition, only clear project but don't show project creation yet
    if (isInTransition) {
      this.updateState({
        ...this.state,
        selectedProject: null,
        tasks: [],
        isLoading: false,
        error: null,
        projectListUpdated: false,
        newlyCreatedProjectId: undefined,
        taskVisualStates: new Map()
      }, 'project');
    } else {
      // Normal complete clearing with showing project creation
      this.updateState({
        selectedProject: null,
        tasks: [],
        isLoading: false,
        error: null,
        showProjectCreation: true,
        projectListUpdated: false,
        newlyCreatedProjectId: undefined,
        taskVisualStates: new Map()
      }, 'project');
    }
  } 
  
  updateTasks(newTasks: Task[]): void {
    logger.info('Updating workspace tasks', { taskCount: newTasks.length }, 'workspace-state tasks');
    
    const updatedTasks = [...this.state.tasks];
    
    newTasks.forEach(newTask =>{
      const existingIndex = updatedTasks.findIndex(t =>t._id?.toString() === newTask._id?.toString()
      );
      
      if (existingIndex >= 0) {
        // Preserve task visual state if it exists
        const taskId = newTask._id?.toString();
        if (taskId && this.state.taskVisualStates.has(taskId)) {
          const visualState = this.state.taskVisualStates.get(taskId);
          updatedTasks[existingIndex] = {
            ...newTask,
            visualState
          } as TaskWithVisualState;
        } else {
          updatedTasks[existingIndex] = newTask;
        }
      } else {
        updatedTasks.push(newTask);
      }
    });

    this.updateState({
      ...this.state,
      tasks: updatedTasks
    }, 'tasks');
  }
  
  updateTaskVisualStates(hierarchyState: TaskHierarchyState): void {
    logger.info('Updating task visual states', { expandedTaskId: hierarchyState.expandedTaskId }, 'workspace-state visual');
    
    const newVisualStates = new Map<string, TaskVisualState>();
    const { expandedTaskId, parentState, siblingState, childState } = hierarchyState;
    
    // Find the task and its context
    const expandedTask = this.state.tasks.find(t =>t._id?.toString() === expandedTaskId
    );
    
    if (!expandedTask) {
      logger.warn('Task not found for visual state update', { expandedTaskId }, 'workspace-state visual warning');
      return;
    }

    // Set expanded task state to active
    newVisualStates.set(expandedTaskId, 'active');

    // Find parent task or project
    if (expandedTask.parentId) {
      const parentId = expandedTask.parentId.toString();
      // Set parent task state
      newVisualStates.set(parentId, parentState);
    } else if (this.state.selectedProject) {
      // If no parent task, then parent is the project
      // The project ID is directly accessed where needed
      // We'll handle project state in workspace visual
    }

    // Set sibling states
    const siblings = this.state.tasks.filter(t =>t.parentId?.toString() === expandedTask.parentId?.toString() &&
      t._id?.toString() !== expandedTaskId
    );
    
    siblings.forEach(sibling =>{
      if (sibling._id) {
        newVisualStates.set(sibling._id.toString(), siblingState);
      }
    });

    // Set children states
    const children = this.state.tasks.filter(t =>t.parentId?.toString() === expandedTaskId
    );
    
    children.forEach(child =>{
      if (child._id) {
        newVisualStates.set(child._id.toString(), childState);
      }
    });

    // Set hidden to all tasks not explicitly set
    this.state.tasks.forEach((task: Task) =>{
      const taskId = task._id?.toString();
      if (taskId && !newVisualStates.has(taskId)) {
        newVisualStates.set(taskId, 'hidden');
      }
    });

    this.updateState({
      ...this.state,
      taskVisualStates: newVisualStates
    }, 'visual');
  }
  
  /**
   * Remove tasks from the state
   * @param taskIds IDs of tasks to remove
   */
  removeTasks(taskIds: string[]): void {
    if (!taskIds.length) return;
    
    logger.info('Removing tasks from workspace state', { 
      count: taskIds.length,
      taskIds
    }, 'workspace-state tasks');
    
    // Filter out the tasks to remove
    const updatedTasks = this.state.tasks.filter(task => 
      task._id && !taskIds.includes(task._id.toString())
    );
    
    // Create a new map of task visual states without the removed tasks
    const updatedTaskVisualStates = new Map(this.state.taskVisualStates);
    
    // Remove entries for deleted tasks
    taskIds.forEach(taskId => {
      if (updatedTaskVisualStates.has(taskId)) {
        updatedTaskVisualStates.delete(taskId);
        logger.debug('Removed visual state for deleted task', { taskId }, 'workspace-state tasks');
      }
    });
    
    // Log detailed state changes
    const removedVisualStatesCount = this.state.taskVisualStates.size - updatedTaskVisualStates.size;
    
    logger.info('State update after task removals', {
      initialTaskCount: this.state.tasks.length,
      newTaskCount: updatedTasks.length,
      removedTasksCount: this.state.tasks.length - updatedTasks.length,
      initialVisualStatesCount: this.state.taskVisualStates.size,
      newVisualStatesCount: updatedTaskVisualStates.size,
      removedVisualStatesCount
    }, 'workspace-state tasks');
    
    // Update the state
    this.updateState({
      ...this.state,
      tasks: updatedTasks,
      taskVisualStates: updatedTaskVisualStates
    }, 'tasks');
  }  
  
  // Expose updateState for internal components
  updateState(newState: WorkspaceState, updateType: StateUpdateType): void {
    // Store previous state for comparison before updating
    const previousState = { ...this.state };
    const selectedProjectChanged = 
      previousState.selectedProject?._id?.toString() !== newState.selectedProject?._id?.toString();
    
    // Update state
    this.state = newState;
    
    // Notify subscribers
    this.notifySubscribers(updateType);
    
    // Trigger state save for significant state changes
    const isSignificantChange = ['project', 'tasks', 'visual'].includes(updateType);
    const shouldSave = 
      isSignificantChange && 
      !newState.isLoading && 
      !isStateBeingRestored() &&
      newState.selectedProject !== null;
    
    if (shouldSave && newState.selectedProject) {
      // Add detailed logging for state updates
      logger.info('State updated', {
        updateType,
        projectId: newState.selectedProject._id?.toString(),
        selectedProjectChanged,
        taskVisualStatesCount: newState.taskVisualStates.size,
        timestamp: new Date().toISOString(),
        _style: 'background-color: #795548; color: white; padding: 2px 5px; border-radius: 3px;'
      }, 'workspace-state manager');
      
      // Dispatch an event to inform about state update
      window.dispatchEvent(new CustomEvent('project-state-updated', {
        detail: {
          updateType,
          projectId: newState.selectedProject._id.toString(),
          selectedProjectChanged,
          timestamp: Date.now()
        }
      }));
      
      // Save state if appropriate
      const isDragging = document.body.classList.contains('is-dragging');
      const isLoading = updateType === 'loading';
      
      if (!isDragging && !isLoading && typeof window.saveWorkspaceState === 'function') {
        // If project changed, save immediately with higher priority
        if (selectedProjectChanged) {
          logger.info('Project changed, saving state immediately', {
            fromProjectId: previousState.selectedProject?._id?.toString(),
            toProjectId: newState.selectedProject._id.toString()
          }, 'workspace-state persistence');
          
          // Use a minimal delay to allow everything to settle
          setTimeout(() =>{
            if (window.saveWorkspaceState) {
              window.saveWorkspaceState();
            }
          }, 50);
        } else {
          // Use a longer delay for regular updates to allow multiple rapid state changes to settle
          setTimeout(() =>{
            if (window.saveWorkspaceState) {
              window.saveWorkspaceState();
            }
          }, 200);
        }
      }
    }
  }
  
  /**
   * Handle task deletion events to ensure proper state updates
   */
  public handleTaskDeleted(taskId: string, parentId?: string, isLastChildOfParent?: boolean): void {
    logger.info('Handling task deletion in state manager', { 
      taskId, 
      parentId,
      isLastChildOfParent 
    }, 'workspace-state tasks');
    
    // Get all descendant task IDs to clean up visual states
    const descendantIds: string[] = [];
    const collectDescendants = (parentId: string) => {
      this.state.tasks.forEach(task => {
        if (task.parentId?.toString() === parentId && task._id) {
          const childId = task._id.toString();
          descendantIds.push(childId);
          collectDescendants(childId);
        }
      });
    };
    
    // Collect descendants of the deleted task
    collectDescendants(taskId);
    
    // Combine task ID and all descendant IDs
    const allTaskIdsToRemove = [taskId, ...descendantIds];
    
    // Remove the tasks from the state
    this.removeTasks(allTaskIdsToRemove);
    
    // If the parent has no more children, update its visual state to show split button
    if (isLastChildOfParent && parentId) {
      logger.info('Parent task now has no children, updating visual state', { parentId }, 'workspace-state tasks');
      
      // Get current task visual states after removals
      const taskVisualStates = new Map(this.state.taskVisualStates);
      
      // Update the parent's state to ensure it's properly displayed
      if (taskVisualStates.has(parentId)) {
        const currentState = taskVisualStates.get(parentId);
        // Only update if the parent is active or semi-transparent
        if (currentState === 'active' || currentState === 'semi-transparent') {
          logger.debug('Parent task visual state preserved', { 
            parentId, 
            visualState: currentState 
          }, 'workspace-state visual');
        }
      }
      
      // Update the state
      this.updateState({
        ...this.state,
        taskVisualStates
      }, 'visual');
      
      // Find the parent task and update its childrenCount to 0 in our state
      const updatedTasks = this.state.tasks.map(task => {
        if (task._id?.toString() === parentId) {
          logger.debug('Updating parent task to have zero children', { 
            parentId, 
            originalChildrenCount: task.childrenCount
          }, 'workspace-state tasks');
          
          return {
            ...task,
            childrenCount: 0,
            descendantCount: 0
          };
        }
        return task;
      });
      
      // Update tasks state to reflect zero children for parent
      this.updateState({
        ...this.state,
        tasks: updatedTasks
      }, 'tasks');
      
      // Emit a custom event to trigger the control layer to update the parent task's display
      window.dispatchEvent(new CustomEvent('parent-task-children-removed', {
        detail: {
          parentTaskId: parentId,
          timestamp: Date.now()
        }
      }));
      
      // Save state after parent update
      if (typeof window.saveWorkspaceState === 'function') {
        logger.debug('Saving workspace state after parent update', {}, 'workspace-state persistence');
        setTimeout(() => {
          window.saveWorkspaceState?.();
        }, 100);
      }
    }
  }
  
  subscribe(callback: (state: WorkspaceState, updateType: StateUpdateType) => void): () => void {
    this.subscribers.push(callback);
    return () => {
      this.subscribers = this.subscribers.filter(cb => cb !== callback);
    };
  }

  private notifySubscribers(updateType: StateUpdateType): void {
    for (const callback of this.subscribers) {
      callback(this.state, updateType);
    }
  }
}

export const workspaceStateManager = WorkspaceStateManagerImpl.getInstance();
