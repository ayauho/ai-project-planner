'use client';

import { logger } from '@/lib/client/logger';
import { useTaskOperations } from '@/components/workspace/hooks/useTaskOperations';
import { TaskEventEmitter } from '@/lib/client/visual/task/events';
import { workspaceStateManager } from '@/lib/workspace/state/manager';
import { domInspector } from '@/lib/client/visual/utils/dom-inspector';
import { svgAnimator } from '@/lib/client/visual/utils/svg-animator';
import { taskGenerator } from '@/lib/task/operations/client';

/**
 * Interface for the rectangle data used for element centering
 */
interface TaskRectangle {
  x: number;
  y: number;
  width: number;
  height: number;
  isPostDeletion?: boolean;
  isPostRegeneration?: boolean;
}

/**
 * Define the SVG Controller interface based on its usage in this file
 */
interface SVGController {
  centerOnElement: (rect: TaskRectangle) => void;
}

// Extend Window interface to include our global objects
declare global {
  interface Window {
    svgController?: SVGController;
    saveWorkspaceState?: () => void;
  }
}

export class TaskControlEventDispatcher {
  private static instance: TaskControlEventDispatcher;
  private taskOperations: ReturnType<typeof useTaskOperations>| null = null;

  private constructor() {
    // Enable debug mode for DOM inspector and animator
    domInspector.setDebug(false);
    svgAnimator.setDebug(false);
  }

  public static getInstance(): TaskControlEventDispatcher {
    if (!TaskControlEventDispatcher.instance) {
      TaskControlEventDispatcher.instance = new TaskControlEventDispatcher();
    }
    return TaskControlEventDispatcher.instance;
  }

  setTaskOperations(operations: ReturnType<typeof useTaskOperations>): void {
    this.taskOperations = operations;
    logger.debug('Task operations set in dispatcher', {}, 'task-controls dispatcher');
  }

  async handleSplit(taskId: string): Promise<void>{
    try {
      if (!this.taskOperations) {
        throw new Error('Task operations not initialized');
      }

      logger.info('Handling split event', { taskId }, 'task-controls split');
      await this.taskOperations.handleSplit(taskId);
      logger.info('Split event handled successfully', { taskId }, 'task-controls split');

    } catch (error) {
      logger.error('Failed to handle split event', { taskId, error }, 'task-controls split error');
      throw error;
    }
  }  
  
  async handleRegenerate(taskId: string): Promise<void>{
    try {
      logger.info('Handling regenerate event', { taskId }, 'task-controls regenerate');
      
      // Emit regenerate event to notify the system
      TaskEventEmitter.getInstance().emit({
        taskId,
        type: 'regenerate',
        data: {
          timestamp: Date.now(),
          isStarting: true
        }
      });

      // Add classes to body to disable pointer events during regeneration and track mode
      document.body.classList.add('controls-disabled');
      document.body.classList.add('mode-regenerate');
      document.body.classList.add('regeneration-in-progress');

      try {
        // Get task data to check for subtasks
        const state = workspaceStateManager.getState();
        const currentTask = state.tasks.find(task => task._id?.toString() === taskId);
        
        if (!currentTask) {
          throw new Error(`Task ${taskId} not found in workspace state`);
        }
        
        // Check if task has subtasks (direct children)
        const hasSubtasks = state.tasks.some(task => task.parentId?.toString() === taskId
        );
        
        logger.debug('Task regeneration preparation', { 
          taskId,
          hasSubtasks,
          taskName: currentTask.name
        }, 'task-controls regenerate');
        
        // Find all descendant tasks if present
        const descendantTaskIds = new Set<string>();
        if (hasSubtasks) {
          logger.debug('Task has subtasks, collecting descendants', { taskId }, 'task-controls regenerate');
          
          const findDescendants = (parentTaskId: string) => {
            state.tasks.forEach(task => {
              if (task.parentId?.toString() === parentTaskId && task._id) {
                const childId = task._id.toString();
                descendantTaskIds.add(childId);
                findDescendants(childId);
              }
            });
          };
          
          findDescendants(taskId);
          
          logger.debug('Collected descendant tasks', { 
            taskId,
            descendantCount: descendantTaskIds.size 
          }, 'task-controls regenerate');
        }
        
        // Step 1: If task has subtasks, delete them first
        if (hasSubtasks && descendantTaskIds.size > 0) {
          logger.debug('Deleting subtasks before regeneration', {
            taskId,
            subtasksCount: descendantTaskIds.size
          }, 'task-controls regenerate');
          
          // Delete each child task individually, but preserve the parent task
          // Convert Set to Array for iteration to avoid TypeScript issues
          const descendantTaskIdsArray = Array.from(descendantTaskIds);
          
          for (const childId of descendantTaskIdsArray) {
            try {
              // Only delete tasks that are direct children of the task being regenerated
              const childTask = state.tasks.find(t => t._id?.toString() === childId);
              if (childTask && childTask.parentId?.toString() === taskId) {
                // Delete the child and all its descendants (which are already in our descendantTaskIds set)
                await fetch(`/api/tasks/${childId}/delete`, {
                  method: 'DELETE'
                });
                
                logger.debug('Deleted subtask during regeneration', { 
                  taskId,
                  childId
                }, 'task-controls regenerate');
              }
            } catch (deleteError) {
              logger.warn('Error deleting subtask during regeneration', {
                taskId,
                childId,
                error: deleteError instanceof Error ? deleteError.message : String(deleteError)
              }, 'task-controls regenerate warning');
              // Continue with other deletions even if one fails
            }
          }
          
          // Visual cleanup for deleted subtasks - mark in deletion tracker
          try {
            import('@/lib/client/visual/utils/deletion-tracker')
              .then(({ deletionTracker }) => {
                Array.from(descendantTaskIds).forEach(descendantId => {
                  deletionTracker.markForDeletion(descendantId, true);
                });
              })
              .catch(error => {
                logger.warn('Failed to mark subtasks in deletion tracker', { error }, 'task-controls regenerate warning');
              });
              
            // Also hide subtask elements directly
            Array.from(descendantTaskIds).forEach(descendantId => {
              const taskElement = document.getElementById(`task-${descendantId}`);
              if (taskElement) {
                taskElement.style.display = 'none';
                taskElement.style.visibility = 'hidden';
                taskElement.style.opacity = '0';
                taskElement.setAttribute('data-being-deleted', 'true');
              }
            });
          } catch (visualError) {
            logger.warn('Error during visual cleanup of subtasks', {
              taskId,
              error: visualError instanceof Error ? visualError.message : String(visualError)
            }, 'task-controls regenerate warning');
            // Continue with regeneration even if visual cleanup fails
          }
        }
        
        // Step 2: Perform actual task regeneration using taskGenerator
        logger.debug('Starting task regeneration process', { taskId }, 'task-controls regenerate');
        
        // Use the actual task generator to regenerate the task
        const regeneratedTask = await taskGenerator.regenerateTask(taskId, {
          shouldRemoveSubtasks: hasSubtasks
        });
        
        logger.debug('Task regeneration completed', { 
          taskId,
          newName: regeneratedTask.name
        }, 'task-controls regenerate');
        
        // Step 3: Update the workspace state with the regenerated task and remove subtasks
        let updatedTasks = [...state.tasks];
        
        // If we deleted subtasks, filter them out of the state
        if (hasSubtasks && descendantTaskIds.size > 0) {
          updatedTasks = updatedTasks.filter(task => task._id && !descendantTaskIds.has(task._id.toString())
          );
        }
        
        // Update the regenerated task in the state
        updatedTasks = updatedTasks.map(task => {
          if (task._id?.toString() === taskId) {
            return {
              ...task,
              name: regeneratedTask.name,
              description: regeneratedTask.description,
              updatedAt: regeneratedTask.updatedAt,
              // Reset counts if subtasks were deleted
              childrenCount: hasSubtasks ? 0 : task.childrenCount,
              descendantCount: hasSubtasks ? 0 : task.descendantCount
            };
          }
          return task;
        });
        
        // Update workspace state with the regenerated task and without subtasks
        workspaceStateManager.updateState({
          ...state,
          tasks: updatedTasks
        }, 'tasks');
        
        // Step 4: Dispatch event to update task visualization
        window.dispatchEvent(new CustomEvent('task-regenerated', {
          detail: {
            taskId,
            task: regeneratedTask,
            hadSubtasks: hasSubtasks,
            descendantTaskIds: Array.from(descendantTaskIds)
          }
        }));
        
        // If the task had subtasks, center on the regenerated task
        if (hasSubtasks) {
          setTimeout(() => {
            try {
              // Find the task element
              const taskElement = document.getElementById(`task-${taskId}`);
              if (taskElement && taskElement instanceof SVGElement) {
                // Center on the task
                import('@/components/workspace/visual/services/svg-controller')
                  .then(({ svgController }) => {
                    // Get task position and dimensions for centering
                    // Use a type guard to ensure we're dealing with SVG elements
                    let x = 0, y = 0;
                    let width = 240, height = 120; // Default values
                    
                    // Get transform attribute
                    const taskTransform = taskElement.getAttribute('transform');
                    if (taskTransform) {
                      const match = taskTransform.match(/translate\(([^,]+),([^)]+)\)/);
                      if (match && match.length >= 3) {
                        x = parseFloat(match[1]);
                        y = parseFloat(match[2]);
                      }
                    }
                    
                    // Find rect element for dimensions
                    const rect = taskElement.querySelector('rect');
                    if (rect) {
                      const rectWidth = rect.getAttribute('width');
                      const rectHeight = rect.getAttribute('height');
                      if (rectWidth) width = parseFloat(rectWidth);
                      if (rectHeight) height = parseFloat(rectHeight);
                    }
                    
                    // Center on task with a flag to indicate this is post-regeneration
                    const centerRect: TaskRectangle = { 
                      x, y, width, height,
                      isPostRegeneration: true
                    };
                    
                    svgController.centerOnElement(centerRect);
                  })
                  .catch(error => {
                    logger.error('Failed to import svgController:', { error }, 'task-controls regenerate error');
                  });
              }
            } catch (centerError) {
              logger.warn('Failed to center on regenerated task', {
                taskId,
                error: centerError instanceof Error ? centerError.message : String(centerError)
              }, 'task-controls regenerate warning');
            }
          }, 300);
        }
        
        // Success message
        logger.info(`Task ${taskId} regenerated successfully with name: "${regeneratedTask.name}"`, {}, 'task-controls regenerate success');
        
      } catch (regenerateError) {
        logger.error('Error during regeneration process', {
          taskId,
          error: regenerateError instanceof Error ? regenerateError.message : String(regenerateError),
          stack: regenerateError instanceof Error ? regenerateError.stack : undefined
        }, 'task-controls regenerate error');
        throw regenerateError;
      } finally {
        // Remove operation classes
        document.body.classList.remove('controls-disabled');
        document.body.classList.remove('mode-regenerate');
        document.body.classList.remove('regeneration-in-progress');
      }
      
      // Trigger a reset of common controls
      window.dispatchEvent(new CustomEvent('reset-common-controls'));
      
      // Emit completion event
      TaskEventEmitter.getInstance().emit({
        taskId,
        type: 'regenerateComplete',
        data: {
          timestamp: Date.now(),
          success: true
        }
      });

      logger.info('Regenerate event handled successfully', { taskId }, 'task-controls regenerate success');
      
    } catch (error) {
      logger.error('Failed to handle regenerate event', { 
        taskId, 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      }, 'task-controls regenerate error');
      
      // Emit error event
      TaskEventEmitter.getInstance().emit({
        taskId,
        type: 'error',
        data: {
          error: error instanceof Error ? error.message : String(error),
          operation: 'regenerate'
        }
      });
      
      // Remove operation classes
      document.body.classList.remove('controls-disabled');
      document.body.classList.remove('mode-regenerate');
      document.body.classList.remove('regeneration-in-progress');
      
      throw error;
    }
  }  
  
  async handleDelete(taskId: string): Promise<void>{
    try {
      logger.info(`Starting deletion of task ${taskId}`, {}, 'task-controls delete');
      
      // Aggressively mark the task for deletion to prevent control flashing
      this.markTaskForDeletion(taskId);
      
      // Add a deletion in progress class to body to prevent interactions
      // Keep this class as it already provides the right functionality for overlays
      document.body.classList.add('deletion-in-progress');
      
      // Emit delete event to notify the system
      TaskEventEmitter.getInstance().emit({
        taskId,
        type: 'delete',
        data: {
          timestamp: Date.now(),
          isStarting: true
        }
      });

      // Get the state before deletion for navigation after deletion
      const state = workspaceStateManager.getState();
      const task = state.tasks.find(t => t._id?.toString() === taskId);
      const parentId = task?.parentId?.toString();
      const projectId = state.selectedProject?._id?.toString();
      
      // Get initial task counts for parent task and project for logging
      const parentTask = parentId ? state.tasks.find(t => t._id?.toString() === parentId) : null;
      const initialParentChildrenCount = parentTask?.childrenCount || 0;
      const initialParentDescendantCount = parentTask?.descendantCount || 0;
      const initialTotalTaskCount = state.tasks.length;
      
      // Find all descendant tasks to properly handle child elements cleanup
      const descendantTaskIds = new Set<string>();
      const findDescendants = (parentTaskId: string) => {
        state.tasks.forEach(task => {
          if (task.parentId?.toString() === parentTaskId && task._id) {
            const childId = task._id.toString();
            descendantTaskIds.add(childId);
            findDescendants(childId);
          }
        });
      };
      
      // Find all descendants of the deleted task
      findDescendants(taskId);
      
      logger.debug('Starting task deletion process', { 
        taskId,
        parentId,
        projectId,
        descendantCount: descendantTaskIds.size,
        initialParentChildrenCount,
        initialParentDescendantCount,
        initialTotalTaskCount
      }, 'task-controls delete');
      
      // STEP 1: First aggressively hide controls for all descendants
      Array.from(descendantTaskIds).forEach(descendantId => {
        // Mark descendants for deletion, specifying they are subtasks
        import('@/lib/client/visual/utils/deletion-tracker')
          .then(({ deletionTracker }) => {
            deletionTracker.markForDeletion(descendantId, true);
          })
          .catch(error => {
            logger.error('Failed to import deletion tracker for subtask:', { error }, 'task-controls delete error');
          });
        
        // Also use direct method to force hide controls
        this.forceHideAllTaskControls(descendantId);
      });
      
      // STEP 2: Animate all elements with a fade-out
      try {
        // Very aggressively hide any controls first to prevent flashing
        this.forceHideAllTaskControls(taskId);
        
        // Find all related elements - both incoming and outgoing connections for the main task and all descendants
        const allRelatedElements = this.findAllRelatedElements(taskId);
        
        // Also find elements for all descendants
        let descendantElements: Element[] = [];
        Array.from(descendantTaskIds).forEach(descendantId => {
          const elements = this.findAllRelatedElements(descendantId);
          descendantElements = [...descendantElements, ...elements];
        });
        
        // Combine all elements
        const combinedElements = [...allRelatedElements, ...descendantElements];
        
        // Remove duplicates
        const uniqueElements = Array.from(new Set(combinedElements));
        
        logger.debug(`Found ${uniqueElements.length} elements to animate for task ${taskId} and its descendants`, {}, 'task-controls delete');
        
        // Add being-removed class to all elements
        uniqueElements.forEach(element => {
          if (element) {
            // Mark element as being removed for CSS animation
            element.classList.add('being-removed');
            
            // Ensure the task is marked for deletion
            if (element.id?.includes(`task-${taskId}`)) {
              element.setAttribute('data-being-deleted', 'true');
            }
            
            // For descendant tasks, also mark them as being deleted
            Array.from(descendantTaskIds).forEach(descendantId => {
              if (element.id?.includes(`task-${descendantId}`)) {
                element.setAttribute('data-being-deleted', 'true');
              }
            });
            
            // For control elements, be more forceful
            if (element.classList.contains('task-control') || 
                element.classList.contains('task-split-button') || 
                element.classList.contains('counter-display') ||
                element.getAttribute('data-task-id') === taskId ||
                (element.getAttribute('data-task-id') && descendantTaskIds.has(element.getAttribute('data-task-id')!))) {
              element.classList.add('force-hidden-control');
              element.setAttribute('data-being-removed-task', 'true');
              
              if (element instanceof HTMLElement || element instanceof SVGElement) {
                element.style.setProperty('display', 'none', 'important');
                element.style.setProperty('visibility', 'hidden', 'important');
                element.style.setProperty('opacity', '0', 'important');
              }
            }
            // Only make non-control elements visible for animation
            else if (element instanceof HTMLElement || element instanceof SVGElement) {
              element.style.removeProperty('display');
              element.style.opacity = '1';
              element.style.visibility = 'visible';
            }
          }
        });
        
        // Also specifically target connection lines from the task to its descendants
        const connectionSelectors: string[] = [];
        Array.from(descendantTaskIds).forEach(descendantId => {
          connectionSelectors.push(`path[id*="${taskId}-to-${descendantId}"]`);
          connectionSelectors.push(`g[id*="${taskId}-to-${descendantId}"]`);
          connectionSelectors.push(`.connection-group[id*="${taskId}-to-${descendantId}"]`);
          connectionSelectors.push(`.connection-line[id*="${taskId}-to-${descendantId}"]`);
        });
        
        // Find specific connection elements - add defensive check for empty selectors
        const connectionSelectorString = connectionSelectors.join(',');
        const connectionElements = connectionSelectorString ? 
          document.querySelectorAll(connectionSelectorString) : [];
        
        if (connectionSelectorString && connectionElements.length > 0) {
          connectionElements.forEach(element => {
            element.classList.add('being-removed');
            if (element instanceof HTMLElement || element instanceof SVGElement) {
              element.style.removeProperty('display');
              element.style.opacity = '1';
              element.style.visibility = 'visible';
            }
          });
        } else {
          logger.debug(`No connection elements found for task ${taskId} and its descendants`, {}, 'task-controls delete');
        }

        // Allow a moment for the DOM to update with our classes
        await new Promise(resolve => setTimeout(resolve, 50));
        
        // Now trigger the animations by setting opacity to 0
        uniqueElements.forEach(element => {
          if (element instanceof HTMLElement || element instanceof SVGElement) {
            element.style.opacity = '0';
          }
        });
        
        // Also animate connection elements
        connectionElements.forEach(element => {
          if (element instanceof HTMLElement || element instanceof SVGElement) {
            element.style.opacity = '0';
          }
        });
        
        // Wait for animations to complete before proceeding with backend operations
        // The CSS transition is set to 500ms in deletion-process.css
        await new Promise(resolve => setTimeout(resolve, 600));
        
        logger.debug(`Animation completed for task ${taskId}, proceeding with backend deletion`, {}, 'task-controls delete');
        
        // After animation completes, add force-hidden class to ensure elements stay hidden
        uniqueElements.forEach(element => {
          if (element instanceof HTMLElement || element instanceof SVGElement) {
            element.classList.add('force-hidden-element');
          }
        });
        
        connectionElements.forEach(element => {
          if (element instanceof HTMLElement || element instanceof SVGElement) {
            element.classList.add('force-hidden-element');
          }
        });
      } catch (animError) {
        // If animation fails, log but continue with deletion
        logger.error(`Animation error during deletion of task ${taskId}:`, {
          error: animError instanceof Error ? animError.message : String(animError)
        }, 'task-controls delete error');
        // We'll continue with the deletion process even if animation fails
      }
      
      // STEP 3: Make the API call to delete on backend
      try {
        logger.debug(`Making API call to delete task ${taskId}`, {}, 'task-controls delete');
        const response = await fetch(`/api/tasks/${taskId}/delete`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          const errorData = await response.json();
          logger.error(`API call failed: ${errorData.error || response.statusText}`, {}, 'task-controls delete error');
          throw new Error(`Failed to delete task: ${errorData.error || response.statusText}`);
        }

        const result = await response.json();
        logger.info('Task deleted successfully on server', { 
          taskId,
          result
        }, 'task-controls delete');
        
        // STEP 4: After successful API call, permanently remove elements from DOM
        logger.debug(`Permanently removing elements for task ${taskId} from DOM`, {}, 'task-controls delete');
        
        // Remove all elements with comprehensive selectors
        this.removeAllRelatedElements(taskId);
        
        // Also remove elements for all descendants
        Array.from(descendantTaskIds).forEach(descendantId => {
          this.removeAllRelatedElements(descendantId);
        });
        
        // STEP 5: Update application state
        logger.debug(`Updating application state for task ${taskId}`, {}, 'task-controls delete');
        
        // Get all tasks to remove as an array
        const allTaskIdsToRemove = [taskId, ...Array.from(descendantTaskIds)];
        
        // Count tasks before deletion for logging
        const initialTaskCount = state.tasks.length;
        const deletedTasksCount = allTaskIdsToRemove.length;
        
        // Get remaining tasks for checking parent status
        const tasksWithoutRemoved = state.tasks.filter(task => task._id && !allTaskIdsToRemove.includes(task._id.toString())
        );
        const remainingTasksCount = tasksWithoutRemoved.length;
        
        // Check if this was the last child of the parent
        let parentNowHasNoChildren = false;
        if (parentId) {
          const remainingChildrenOfParent = tasksWithoutRemoved.filter(
            t => t.parentId?.toString() === parentId
          );
          parentNowHasNoChildren = remainingChildrenOfParent.length === 0;
          
          if (parentNowHasNoChildren) {
            logger.debug(`Parent task ${parentId} now has no children, will show split button instead of counter`, {}, 'task-controls delete');
          }
        }
        
        // Check if this was the last task in the project
        const isLastTaskInProject = remainingTasksCount === 0;
        
        // Log the state before updating
        logger.info('State before task deletion update', {
          initialTaskCount,
          deletedTasksCount,
          remainingTasksCount,
          taskVisualStatesCount: state.taskVisualStates.size,
          parentId,
          parentNowHasNoChildren,
          isLastTaskInProject
        }, 'task-controls delete');
        
        // Use the workspace state manager's removeTasks method to properly update the state
        // This will also clean up the task visual states
        workspaceStateManager.removeTasks(allTaskIdsToRemove);
        
        // Get updated state after removal
        const updatedState = workspaceStateManager.getState();
        
        // Log the detailed state update
        logger.info('Project state updated after task deletion', {
          taskId,
          projectId,
          parentId,
          initialTaskCount,
          deletedTasksCount,
          remainingTasksCount: updatedState.tasks.length,
          taskVisualStatesCount: updatedState.taskVisualStates.size,
          isLastChildOfParent: parentNowHasNoChildren,
          isLastTaskInProject
        }, 'task-controls delete');
        
        // STEP 5.1: Handle parent task display when it has no more children
        if (parentNowHasNoChildren && parentId) {
          // Let the state manager handle updating the parent task's display
          workspaceStateManager.handleTaskDeleted(taskId, parentId, parentNowHasNoChildren);
          
          logger.info('Notified state manager about parent with no children', {
            parentId,
            taskId
          }, 'task-controls delete');
          
          // Also directly dispatch an event to ensure immediate UI update
          // This will be caught by the control layer to update the parent's control
          window.dispatchEvent(new CustomEvent('parent-task-children-removed', {
            detail: {
              parentTaskId: parentId,
              timestamp: Date.now()
            }
          }));
          
          logger.debug('Dispatched parent-task-children-removed event', {
            parentTaskId: parentId
          }, 'task-controls delete');
        }
        
        // STEP 5.2: Handle project deletion if this was the last task
        if (isLastTaskInProject && projectId) {
          logger.info('Last task in project deleted, initiating project deletion', {
            projectId
          }, 'task-controls delete');
          
          try {
            // Import and use the project service to delete the project
            const { projectService } = await import('@/lib/project/client/project-service');
            
            // First clear any potential API key validation states and set transition flags
            if (typeof localStorage !== 'undefined') {
              // Clear any stored API validation state to prevent flashing messages
              localStorage.removeItem('api-key-validation-state');
              
              // Also store the API key information to prevent validation issues
              const apiKey = localStorage.getItem('openai-api-key');
              if (apiKey) {
                localStorage.setItem('api-key-valid', 'true');
              }
            }
            
            // Set selection transition flags to prevent UI flashing
            sessionStorage.setItem('project_transition_after_deletion', 'true');
            
            // Clear the selection state before showing project creation
            workspaceStateManager.clearSelection();
            
            // Delete the project
            await projectService.deleteProject(projectId);
            
            logger.info('Project deleted successfully after last task deletion', {
              projectId
            }, 'task-controls delete');
            
            // Show project creation interface with a slight delay
            // to ensure all state transitions are complete
            setTimeout(() => {
              // Dispatch event to notify about project deletion
              window.dispatchEvent(new CustomEvent('project-deleted-after-task', {
                detail: {
                  projectId,
                  taskId,
                  timestamp: Date.now()
                }
              }));
              
              // Refresh the project list
              window.dispatchEvent(new CustomEvent('project-list-update', {
                detail: { refresh: true }
              }));
              
              // Only then navigate to project creation
              workspaceStateManager.showProjectCreation();
            }, 300);
          } catch (projectDeletionError) {
            logger.error('Failed to delete project after last task deletion', {
              projectId,
              error: projectDeletionError instanceof Error ? 
                projectDeletionError.message : String(projectDeletionError)
            }, 'task-controls delete error');
          }
        }
        
        // STEP 6: Final cleanup to catch anything we missed
        logger.debug(`Performing final cleanup for task ${taskId} and descendants`, {}, 'task-controls delete');
        setTimeout(() => {
          this.cleanupRemainingElements(taskId);
          
          // Also cleanup descendants
          Array.from(descendantTaskIds).forEach(descendantId => {
            this.cleanupRemainingElements(descendantId);
          });
          
          // Special handling for connection lines between deleted tasks
          this.cleanupConnectionsBetweenTasks(taskId, Array.from(descendantTaskIds));
        }, 200);
        
        // STEP 7: Check if this was the last task in the project - if so, delete the project
        if (isLastTaskInProject && projectId) {
          logger.info('Last task in project deleted, will initiate project deletion', {
            projectId
          }, 'task-controls delete');
        }
        
        // STEP 8: Navigate to parent if needed
        logger.debug(`Checking if navigation needed for task ${taskId}`, {}, 'task-controls delete');
        const selectedTaskId = workspaceStateManager.getState().taskVisualStates.get(taskId);
        if (selectedTaskId === 'active' && (parentId || projectId)) {
          // Navigate to parent task or project
          const navigateToId = parentId || projectId;
          if (navigateToId) {
            // Use a single, consistent centering approach
            // Add a post-deletion marker to prevent competing centering
            document.body.setAttribute('data-post-deletion-centering', navigateToId);
            
            setTimeout(() => {
              logger.debug(`Navigating to parent/project ${navigateToId}`, {}, 'task-controls delete');
              
              try {
                // Get the parent element directly from the DOM
                const taskElement = document.querySelector(`#task-${navigateToId}`);
                const projectElement = document.querySelector(`#project-${navigateToId}`);
                const element = taskElement || projectElement;
                
                if (element) {
                  logger.debug('Navigating to parent after deletion', { navigateToId }, 'task-controls delete');
                  
                  // Get task rectangle for centering
                  let taskRect: TaskRectangle | undefined;
                  
                  if (taskElement) {
                    // For task element
                    const taskGElement = taskElement as SVGGElement;
                    const taskTransform = taskGElement.getAttribute('transform');
                    let x = 0, y = 0;
                    
                    if (taskTransform) {
                      const match = taskTransform.match(/translate\(([^,]+),([^)]+)\)/);
                      if (match && match.length >= 3) {
                        x = parseFloat(match[1]);
                        y = parseFloat(match[2]);
                      }
                    }
                    
                    const rect = taskGElement.querySelector('rect');
                    const width = rect ? parseFloat(rect.getAttribute('width') || '240') : 240;
                    const height = rect ? parseFloat(rect.getAttribute('height') || '120') : 120;
                    
                    taskRect = { x, y, width, height };
                  } else if (projectElement) {
                    // For project element
                    const projectGElement = projectElement as SVGGElement;
                    const projectTransform = projectGElement.getAttribute('transform');
                    let x = 0, y = 0;
                    
                    if (projectTransform) {
                      const match = projectTransform.match(/translate\(([^,]+),([^)]+)\)/);
                      if (match && match.length >= 3) {
                        x = parseFloat(match[1]);
                        y = parseFloat(match[2]);
                      }
                    }
                    
                    const rect = projectGElement.querySelector('rect');
                    const width = rect ? parseFloat(rect.getAttribute('width') || '320') : 320;
                    const height = rect ? parseFloat(rect.getAttribute('height') || '160') : 160;
                    
                    taskRect = { x, y, width, height };
                  }
                  
                  // If we have a valid rectangle, use ONLY svgController for centering
                  if (taskRect !== undefined) {
                    // Import the controller directly - most reliable approach
                    import('@/components/workspace/visual/services/svg-controller')
                      .then(({ svgController }) => {
                        if (svgController && typeof svgController.centerOnElement === 'function') {
                          logger.debug(`Direct centering to ${navigateToId} using imported svgController`, {}, 'task-controls delete');
                          // Mark the rectangle as a post-deletion centering request
                          taskRect.isPostDeletion = true;
                          svgController.centerOnElement(taskRect);
                        }
                      })
                      .catch(error => {
                        logger.error('Failed to import svgController:', { error }, 'task-controls delete error');
                        
                        // Fallback - try direct access
                        const svgController = window.svgController;
                        if (svgController && typeof svgController.centerOnElement === 'function') {
                          logger.debug(`Direct centering to ${navigateToId} using window.svgController`, {}, 'task-controls delete');
                          taskRect.isPostDeletion = true;
                          svgController.centerOnElement(taskRect);
                        }
                      });
                  }
                }
              } catch (error) {
                logger.error('Error during post-deletion centering', { 
                  navigateToId, 
                  error: error instanceof Error ? error.message : String(error)
                }, 'task-controls delete error');
              } finally {
                // Clean up the post-deletion centering marker after a delay
                setTimeout(() => {
                  document.body.removeAttribute('data-post-deletion-centering');
                }, 500);
              }
            }, 300);
          }
        }
        
        // STEP 9: Update parent task display if it now has no children
        if (parentNowHasNoChildren && parentId) {
          logger.info('Parent task now has no children, should show split button instead of counter', {
            parentId
          }, 'task-controls delete');
        }
        
        // STEP 10: Trigger project list refresh
        logger.debug(`Triggering project list refresh for task ${taskId}`, {}, 'task-controls delete');
        window.dispatchEvent(new CustomEvent('project-tasks-changed', {
          detail: { 
            projectId,
            operation: 'delete',
            taskId
          }
        }));
        
        // STEP 11: First dispatch event for complete UI reset - do this before emitting completion
        logger.debug(`Completing deletion for task ${taskId}`, {}, 'task-controls delete');
        
        // Make one final check to ensure controls are hidden
        this.forceHideAllTaskControls(taskId);
        
        // Convert Set to Array before forEach iteration
        Array.from(descendantTaskIds).forEach(descendantId => {
          this.forceHideAllTaskControls(descendantId);
        });
        
        // Immediately dispatch task-deleted event to initiate cleanup
        window.dispatchEvent(new CustomEvent('task-deleted', {
          detail: {
            taskId,
            parentId,
            projectId,
            timestamp: Date.now(),
            descendantIds: Array.from(descendantTaskIds),
            isLastChildOfParent: parentNowHasNoChildren,
            isLastTaskInProject
          }
        }));
        
        // Give a moment for the task-deleted event to process
        setTimeout(() => {
          // Remove operation classes but keep the task deletion marker
          document.body.classList.remove('deletion-in-progress');
          document.body.classList.remove('mode-delete');
          
          // Dispatch event to reset common controls UI
          window.dispatchEvent(new CustomEvent('reset-common-controls'));
          
          // Only then emit the completion event for other systems to know deletion is done
          TaskEventEmitter.getInstance().emit({
            taskId,
            type: 'deleteComplete',
            data: {
              timestamp: Date.now(),
              success: true,
              parentId,
              projectId,
              descendantIds: Array.from(descendantTaskIds),
              isLastChildOfParent: parentNowHasNoChildren,
              isLastTaskInProject
            }
          });
          
          logger.debug(`Deletion complete for task ${taskId}`, {}, 'task-controls delete');
          
          // After a short delay, dispatch a final refresh event and clean up styles
          setTimeout(() => {
            // Remove any custom style elements created for this task
            const styleEl = document.getElementById(`deletion-style-${taskId}`);
            if (styleEl && styleEl.parentNode) {
              styleEl.parentNode.removeChild(styleEl);
            }
            
            // Also remove styles for descendants
            Array.from(descendantTaskIds).forEach(descendantId => {
              const descendantStyleEl = document.getElementById(`deletion-style-${descendantId}`);
              if (descendantStyleEl && descendantStyleEl.parentNode) {
                descendantStyleEl.parentNode.removeChild(descendantStyleEl);
              }
            });

            // Clear the task from deletion tracker
            import('@/lib/client/visual/utils/deletion-tracker')
              .then(({ deletionTracker }) => {
                deletionTracker.unmarkForDeletion(taskId);
                
                // Also unmark descendants
                Array.from(descendantTaskIds).forEach(descendantId => {
                  deletionTracker.unmarkForDeletion(descendantId);
                });
              })
              .catch(error => {
                logger.error('Failed to import deletion tracker for cleanup:', { error }, 'task-controls delete error');
              });
            
            // Clear the deletion marker from the body
            document.body.removeAttribute('data-deleting-task');
            
            // Final cleanup to ensure there are no leftover elements
            this.removeAllRelatedElements(taskId);
            Array.from(descendantTaskIds).forEach(descendantId => {
              this.removeAllRelatedElements(descendantId);
            });
            
            // Explicitly save the workspace state after deletion
            if (typeof window.saveWorkspaceState === 'function') {
              logger.debug(`Explicitly saving workspace state after task deletion ${taskId}`, {}, 'task-controls delete');
              window.saveWorkspaceState();
              
              // Log that the state was saved after deletion
              logger.info('Workspace state saved after task deletion', {
                taskId,
                projectId,
                tasksRemoved: deletedTasksCount,
                remainingTasks: remainingTasksCount,
                timestamp: new Date().toISOString()
              }, 'task-controls delete');
            }
            
            // Refresh workspace
            window.dispatchEvent(new CustomEvent('refresh-workspace'));
            
            // Trigger post-deletion centering complete event
            window.dispatchEvent(new CustomEvent('post-deletion-centering-complete', {
              detail: {
                taskId,
                parentId,
                projectId,
                isLastChildOfParent: parentNowHasNoChildren,
                isLastTaskInProject
              }
            }));
          }, 200);
        }, 300);
        
        logger.info('Delete event handled successfully', { taskId }, 'task-controls delete success');
        
      } catch (error) {
        // If API call fails, restore visibility
        logger.error(`Deletion failed for task ${taskId}, restoring visibility`, {}, 'task-controls delete error');
        this.restoreVisibility(taskId);
        Array.from(descendantTaskIds).forEach(descendantId => {
          this.restoreVisibility(descendantId);
        });
        document.body.classList.remove('deletion-in-progress');
        
        // Reset common controls
        window.dispatchEvent(new CustomEvent('reset-common-controls'));
        
        // Re-throw for outer catch
        throw error;
      }
    } catch (error) {
      logger.error('Failed to handle delete event', { 
        taskId, 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      }, 'task-controls delete error');
      
      // Emit error event
      TaskEventEmitter.getInstance().emit({
        taskId,
        type: 'error',
        data: {
          error: error instanceof Error ? error.message : String(error),
          operation: 'delete'
        }
      });
      
      // Always ensure deletion-in-progress class is removed
      document.body.classList.remove('deletion-in-progress');
      
      throw error;
    }
  }

  /**
   * Aggressively mark a task for deletion to prevent control flashing
   */
  private markTaskForDeletion(taskId: string): void {
    try {
      logger.debug(`Marking task ${taskId} for deletion with control hiding`, {}, 'task-controls delete');
      
      // Import the deletion tracker here
      import('@/lib/client/visual/utils/deletion-tracker')
        .then(({ deletionTracker }) => {
          // Register with global deletion tracker
          deletionTracker.setDebug(true);
          deletionTracker.markForDeletion(taskId);
        })
        .catch(error => {
          logger.error('Failed to import deletion tracker:', { error }, 'task-controls delete error');
        });
      
      // Mark the task rectangle itself
      const taskRect = document.getElementById(`task-${taskId}`);
      if (taskRect) {
        taskRect.setAttribute('data-being-deleted', 'true');
        taskRect.classList.add('being-deleted');
      }
      
      // Create a special style element just for this task's controls
      const styleId = `deletion-style-${taskId}`;
      let styleEl = document.getElementById(styleId);
      
      // If style doesn't exist, create it
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = styleId;
        document.head.appendChild(styleEl);
      }
      
      // Add CSS rules to forcefully hide all controls for this task
      // Using multiple selectors for redundancy
      const css = `
        /* Force hide any control related to deleted task ${taskId} */
        .task-control-${taskId},
        [data-task-id="${taskId}"],
        .task-split-button[data-task-id="${taskId}"],
        #task-control-${taskId},
        g[data-task-id="${taskId}"],
        .task-counter-display[data-task-id="${taskId}"],
        .counter-display[data-task-id="${taskId}"],
        .project-counter[data-task-id="${taskId}"],
        .regenerate-control[data-task-id="${taskId}"],
        .delete-control[data-task-id="${taskId}"] {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
          pointer-events: none !important;
          transition: none !important;
          animation: none !important;
          position: absolute !important;
          z-index: -9999 !important;
          width: 0 !important;
          height: 0 !important;
          overflow: hidden !important;
          clip: rect(0, 0, 0, 0) !important;
          margin: -1px !important;
          padding: 0 !important;
          border: 0 !important;
        }
      `;
      
      styleEl.textContent = css;
      
      // Also add a global marker attribute to body
      document.body.setAttribute('data-deleting-task', taskId);
    } catch (error) {
      logger.error(`Error marking task ${taskId} for deletion:`, { error }, 'task-controls delete error');
    }
  }
  
  /**
   * Force hide all controls for a task regardless of current state
   */
  private forceHideAllTaskControls(taskId: string): void {
    try {
      // Comprehensive list of selectors to target all possible controls
      const selectors = [
        `.task-control-${taskId}`,
        `#task-control-${taskId}`,
        `[data-task-id="${taskId}"]`,
        `.task-split-button[data-task-id="${taskId}"]`,
        `g[data-task-id="${taskId}"]`,
        `.layer-controls g[data-task-id="${taskId}"]`,
        `.regenerate-control[data-task-id="${taskId}"]`,
        `.delete-control[data-task-id="${taskId}"]`,
        `g.task-control-${taskId}`,
        `.counter-display[data-task-id="${taskId}"]`,
        `.task-counter-display[data-task-id="${taskId}"]`,
        `.project-counter[data-task-id="${taskId}"]`,
        `[data-id*="${taskId}"]`
      ];
      
      // Execute a selector query that combines all these selectors
      const allControls = document.querySelectorAll(selectors.join(','));
      logger.debug(`Force hiding ${allControls.length} controls for task ${taskId}`, {}, 'task-controls delete');
      
      // Apply forceful hiding to each element
      allControls.forEach(control => {
        if (control instanceof HTMLElement || control instanceof SVGElement) {
          // Apply all possible hiding techniques
          control.style.setProperty('display', 'none', 'important');
          control.style.setProperty('visibility', 'hidden', 'important');
          control.style.setProperty('opacity', '0', 'important');
          control.style.setProperty('pointer-events', 'none', 'important');
          control.style.setProperty('position', 'absolute', 'important');
          control.style.setProperty('z-index', '-9999', 'important');
          control.style.setProperty('width', '0', 'important');
          control.style.setProperty('height', '0', 'important');
          
          // Add multiple classes for CSS handling
          control.classList.add('force-hidden-element');
          control.classList.add('being-removed');
          control.classList.add('force-hidden-control');
          control.classList.add('hidden-during-operation');
          
          // Add data attributes
          control.setAttribute('data-being-removed-task', 'true');
          control.setAttribute('data-force-hidden', 'true');
          
          logger.debug(`Force hidden control: ${control.tagName}#${control.id || 'no-id'}`, {}, 'task-controls delete');
        }
      });
      
      // Create a specialized style element to ensure these controls stay hidden
      const styleId = `deletion-control-style-${taskId}`;
      let styleEl = document.getElementById(styleId);
      
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = styleId;
        document.head.appendChild(styleEl);
        
        // CSS rules with ultra-high specificity
        styleEl.textContent = `
          /* Ultra-high specificity rules to hide controls for task ${taskId} */
          body .layer-controls .task-control-${taskId},
          body svg .task-control-${taskId},
          body svg [data-task-id="${taskId}"],
          body .layer-controls [data-task-id="${taskId}"],
          body .layer-controls .task-split-button[data-task-id="${taskId}"],
          body .layer-controls g[data-task-id="${taskId}"],
          body .counter-display[data-task-id="${taskId}"],
          body .task-counter-display[data-task-id="${taskId}"],
          body .layer-controls .task-control[data-task-id="${taskId}"],
          body .layer-controls .regenerate-control[data-task-id="${taskId}"],
          body .layer-controls .delete-control[data-task-id="${taskId}"] {
            display: none !important;
            visibility: hidden !important;
            opacity: 0 !important;
            pointer-events: none !important;
            position: absolute !important;
            z-index: -9999 !important;
            width: 0 !important;
            height: 0 !important;
            overflow: hidden !important;
            clip: rect(0, 0, 0, 0) !important;
          }
        `;
      }
      
      // Also register this task with the deletion tracker for persistent monitoring
      import('@/lib/client/visual/utils/deletion-tracker')
        .then(({ deletionTracker }) => {
          // Use the deletion tracker for persistent monitoring
          deletionTracker.immediatelyHideTaskControls(taskId);
        })
        .catch(error => {
          logger.error('Failed to import deletion tracker for hiding controls:', { error }, 'task-controls delete error');
        });
    } catch (error) {
      logger.error(`Error forcing hide of controls for task ${taskId}:`, { error }, 'task-controls delete error');
    }
  }

  /**
   * Find all elements related to a task, including both incoming and outgoing connections
   */
  private findAllRelatedElements(taskId: string): Element[] {
    try {
      logger.debug('Finding all related elements', { taskId }, 'task-controls delete');
      
      // Array to collect all related elements
      const allElements: Element[] = [];
      
      // 1. Task rectangle itself
      const taskRect = document.getElementById(`task-${taskId}`);
      if (taskRect) {
        allElements.push(taskRect);
      }
      
      // 2. All controls related to this task
      const controlSelectors = [
        `.task-control-${taskId}`,
        `[data-task-id="${taskId}"]`,
        `.regenerate-control[data-task-id="${taskId}"]`,
        `.delete-control[data-task-id="${taskId}"]`,
        `.task-split-button[data-task-id="${taskId}"]`,
        `.counter-display[data-task-id="${taskId}"]`,
        `.task-counter-display[data-task-id="${taskId}"]`
      ];
      
      controlSelectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(element => {
          allElements.push(element);
        });
      });
      
      // 3. Find connection elements using multiple strategies
      
      // 3.1. Get connections layer
      const connectionsLayer = document.querySelector('.layer-connections');
      if (connectionsLayer) {
        // 3.2. Look for connection groups that contain the task ID in any way
        connectionsLayer.querySelectorAll('g.connection-group').forEach(group => {
          const groupId = group.id || '';
          const dataConnection = group.getAttribute('data-connection') || '';
          
          // Check if this connection is related to our task
          if (groupId.includes(taskId) || dataConnection.includes(taskId)) {
            allElements.push(group);
            
            // Also add all children of this group
            group.childNodes.forEach(child => {
              if (child instanceof Element) {
                allElements.push(child);
              }
            });
          }
        });
        
        // 3.3. Look for individual paths and markers that might be related
        const pathSelectors = [
          `path[id*="${taskId}"]`,
          `.connection-line[id*="${taskId}"]`,
          `.connection-marker[id*="${taskId}"]`,
          `[id*="connection-${taskId}-to"]`,
          `[id*="connection-to-${taskId}"]`,
          `[id*="from-${taskId}"]`,
          `[id*="to-${taskId}"]`
        ];
        
        pathSelectors.forEach(selector => {
          connectionsLayer.querySelectorAll(selector).forEach(element => {
            allElements.push(element);
          });
        });
        
        // 3.4. Special case: Find connections TO and FROM this task using coordinates
        
        // Get the task's position by checking its transform attribute
        let taskX = 0, taskY = 0;
        if (taskRect) {
          const taskTransform = taskRect.getAttribute('transform');
          if (taskTransform) {
            const match = taskTransform.match(/translate\(([^,]+),([^)]+)\)/);
            if (match && match.length >= 3) {
              taskX = Math.round(parseFloat(match[1]));
              taskY = Math.round(parseFloat(match[2]));
            }
          }
          
          // If we have task coordinates, look for connections with this target
          if (taskX !== 0 || taskY !== 0) {
            const targetCoordStr = `${taskX}-${taskY}`;
            
            // Look for any connection ending at OR starting from these coordinates
            connectionsLayer.querySelectorAll('g.connection-group, path').forEach(element => {
              const elementId = element.id || '';
              
              // Check for connections TO our task coordinates
              if (elementId.includes(`-to-${targetCoordStr}`) || elementId.includes(`${targetCoordStr}-to-`)) {
                allElements.push(element);
                
                // Add all children if it's a group
                if (element.tagName.toLowerCase() === 'g') {
                  element.childNodes.forEach(child => {
                    if (child instanceof Element) {
                      allElements.push(child);
                    }
                  });
                }
              }
            });
          }
        }
        
        // 3.5. Special case: Find connections that involve this task's children 
        // (especially important for task with subtasks being deleted)
        
        // Find all tasks that have this task as parent
        const childTasks = document.querySelectorAll(`[id^="task-"]`);
        childTasks.forEach(childElement => {
          // Extract child task ID
          const childId = childElement.id.replace('task-', '');
          if (!childId) return;
          
          // Look for the parent ID in the task element's data attributes
          const parentId = childElement.getAttribute('data-parent-id');
          
          // If this is a child of our task, find connections to it
          if (parentId === taskId) {
            // Find connections from the parent (being deleted) to this child
            const connectionSelectors = [
              `[id*="connection-${taskId}-to-${childId}"]`,
              `[id*="connection-group-${taskId}-to-${childId}"]`,
              `path[id*="${taskId}-to-${childId}"]`,
              `g[id*="${taskId}-to-${childId}"]`
            ];
            
            // Find all matching connection elements
            connectionSelectors.forEach(selector => {
              connectionsLayer.querySelectorAll(selector).forEach(element => {
                allElements.push(element);
                
                // If it's a group, add all children
                if (element.tagName.toLowerCase() === 'g') {
                  element.childNodes.forEach(child => {
                    if (child instanceof Element) {
                      allElements.push(child);
                    }
                  });
                }
              });
            });
          }
        });
      }

      // 4. Add any other elements with this task ID anywhere
      document.querySelectorAll(`[id*="${taskId}"]`).forEach(element => {
        if (!allElements.includes(element)) {
          allElements.push(element);
        }
      });
      
      // 5. Look for connection groups using more generic selectors
      if (connectionsLayer) {
        connectionsLayer.querySelectorAll('g.connection-group').forEach(group => {
          const groupId = group.id || '';
          
          // Use a more comprehensive check for connections related to this task
          if (groupId.includes(`-${taskId}-`) || 
              groupId.includes(`${taskId}-to-`) || 
              groupId.includes(`-to-${taskId}`) ||
              groupId.includes(`from-${taskId}-`) ||
              groupId.includes(`-from-${taskId}`)) {
            if (!allElements.includes(group)) {
              allElements.push(group);
              
              // Add all children
              group.childNodes.forEach(child => {
                if (child instanceof Element && !allElements.includes(child)) {
                  allElements.push(child);
                }
              });
            }
          }
        });
      }
      
      // Log summary of found elements
      logger.debug('Found all related elements', { 
        taskId, 
        count: allElements.length,
        types: this.summarizeElementTypes(allElements)
      }, 'task-controls delete');
      
      return allElements;
    } catch (error) {
      logger.error('Error finding all related elements', { 
        taskId, 
        error: error instanceof Error ? error.message : String(error)
      }, 'task-controls delete error');
      return [];
    }
  }
  
  /**
   * Summary of found element types for debugging
   */
  private summarizeElementTypes(elements: Element[]): Record<string, number>{
    const summary: Record<string, number> = {};
    
    elements.forEach(element => {
      const type = element.tagName.toLowerCase();
      summary[type] = (summary[type] || 0) + 1;
    });
    
    return summary;
  }
  
  /**
   * Remove all elements related to a task, using comprehensive selectors
   */
  private removeAllRelatedElements(taskId: string): void {
    try {
      // Use comprehensive selectors to find all related elements
      const selectors = [
        `#task-${taskId}`,
        `.task-control-${taskId}`,
        `[data-task-id="${taskId}"]`,
        `.regenerate-control[data-task-id="${taskId}"]`,
        `.delete-control[data-task-id="${taskId}"]`,
        `.connection-group[id*="${taskId}"]`,
        `path[id*="${taskId}"]`,
        `.connection-line[id*="${taskId}"]`,
        `.connection-marker[id*="${taskId}"]`,
        `.force-hidden-element[id*="${taskId}"]`,
        `.being-removed[id*="${taskId}"]`,
        `.counter-display[data-task-id="${taskId}"]`,
        `.task-counter-display[data-task-id="${taskId}"]`,
        // Target any connection group that might contain our task
        `g.connection-group[id*="to-${taskId}"]`,
        `g.connection-group[id*="${taskId}-to"]`,
        `g.connection-group[id*="from-${taskId}"]`,
        `g[id*="connection-group"][id*="${taskId}"]`,
        `[id*="connection-${taskId}"]`,
        `[id*="connection-to-${taskId}"]`,
        `[id*="connection-from-${taskId}"]`
      ];
      
      // Get the task coordinates for additional selectors
      const taskRect = document.getElementById(`task-${taskId}`);
      if (taskRect) {
        const taskTransform = taskRect.getAttribute('transform');
        if (taskTransform) {
          const match = taskTransform.match(/translate\(([^,]+),([^)]+)\)/);
          if (match && match.length >= 3) {
            const x = Math.round(parseFloat(match[1]));
            const y = Math.round(parseFloat(match[2]));
            const coordStr = `${x}-${y}`;
            
            // Add selectors for connections TO and FROM this task's coordinates
            selectors.push(`[id*="to-${coordStr}"]`);
            selectors.push(`[id*="${coordStr}-to"]`);
            selectors.push(`[id*="from-${coordStr}"]`);
            selectors.push(`[id*="${coordStr}-from"]`);
          }
        }
      }
      
      // Process each selector
      let removedCount = 0;
      selectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(element => {
          if (element.parentNode) {
            element.parentNode.removeChild(element);
            removedCount++;
          }
        });
      });
      
      logger.debug(`Removed ${removedCount} elements related to task ${taskId}`, {}, 'task-controls delete');
      
      // Special handling for the connections layer
      const connectionsLayer = document.querySelector('.layer-connections');
      if (connectionsLayer) {
        // Look specifically for any connection groups with paths containing this task's ID
        connectionsLayer.querySelectorAll('g.connection-group').forEach(group => {
          let shouldRemove = false;
          
          // Check if the group ID contains the task ID
          if (group.id && group.id.includes(taskId)) {
            shouldRemove = true;
          }
          
          // Check all paths within the group
          if (!shouldRemove) {
            group.querySelectorAll('path').forEach(path => {
              if (path.id && path.id.includes(taskId)) {
                shouldRemove = true;
              }
            });
          }
          
          // If the group should be removed, remove it
          if (shouldRemove && group.parentNode) {
            group.parentNode.removeChild(group);
            removedCount++;
          }
        });
      }
      
      logger.debug(`Final count: Removed ${removedCount} elements related to task ${taskId}`, {}, 'task-controls delete');
      
    } catch (error) {
      logger.error(`Error removing elements for task ${taskId}:`, { error }, 'task-controls delete error');
    }
  }
  
  /**
   * Clean up connections between deleted task and its subtasks
   */
  private cleanupConnectionsBetweenTasks(parentTaskId: string, childTaskIds: string[] | Set<string>): void {
    try {
      // Validate inputs
      if (!parentTaskId) {
        logger.warn('Invalid parent task ID for connection cleanup', {}, 'task-controls delete warning');
        return;
      }
      
      // Convert to array if it's a Set
      const childTaskIdsArray = Array.isArray(childTaskIds) ? childTaskIds : Array.from(childTaskIds);
      
      // Skip if no child tasks
      if (childTaskIdsArray.length === 0) return;
      
      logger.debug(`Cleaning up connections between task ${parentTaskId} and ${childTaskIdsArray.length} child tasks`, {}, 'task-controls delete');
      
      // Get the connections layer
      const connectionsLayer = document.querySelector('.layer-connections');
      if (!connectionsLayer) {
        logger.warn('Connections layer not found', {}, 'task-controls delete warning');
        return;
      }
      
      // For each child task, find and remove connections from the parent
      childTaskIdsArray.forEach(childId => {
        if (!childId) return; // Skip invalid child IDs
        
        // Comprehensive selectors for connections between parent and child
        const selectors: string[] = [
          `[id*="connection-${parentTaskId}-to-${childId}"]`,
          `[id*="connection-group-${parentTaskId}-to-${childId}"]`,
          `path[id*="${parentTaskId}-to-${childId}"]`,
          `g[id*="${parentTaskId}-to-${childId}"]`,
          `.connection-group[id*="${parentTaskId}-to-${childId}"]`,
          `.connection-line[id*="${parentTaskId}-to-${childId}"]`,
          `.connection-marker[id*="${parentTaskId}-to-${childId}"]`
        ];
        
        try {
          // Join selectors with a check for empty strings
          const validSelectors = selectors.filter(s => s.trim() !== '');
          
          if (validSelectors.length === 0) {
            logger.debug('No valid selectors for parent-child connection', { parentTaskId, childId }, 'task-controls delete');
            return;
          }
          
          const selectorString = validSelectors.join(', ');
          
          // Find and remove matching elements
          const elements = connectionsLayer.querySelectorAll(selectorString);
          
          elements.forEach(element => {
            if (element.parentNode) {
              logger.debug(`Removing connection element: ${element.tagName}#${element.id || 'no-id'}`, {}, 'task-controls delete');
              element.parentNode.removeChild(element);
            }
          });
          
          logger.debug('Processed parent-child connection cleanup', { 
            parentTaskId, 
            childId, 
            removedElementCount: elements.length 
          }, 'task-controls delete');
        } catch (error) {
          logger.error('Error cleaning up parent-child connections', { 
            parentTaskId, 
            childId, 
            error: error instanceof Error ? error.message : String(error) 
          }, 'task-controls delete error');
        }
      });
      
      // Also check for connections between child tasks (in case of nested hierarchies)
      for (let i = 0; i < childTaskIdsArray.length; i++) {
        for (let j = 0; j < childTaskIdsArray.length; j++) {
          if (i !== j) {
            const fromId = childTaskIdsArray[i];
            const toId = childTaskIdsArray[j];
            
            // Skip invalid IDs
            if (!fromId || !toId) continue;
            
            try {
              // Find connections between these child tasks
              const selectors: string[] = [
                `[id*="connection-${fromId}-to-${toId}"]`,
                `[id*="connection-group-${fromId}-to-${toId}"]`,
                `path[id*="${fromId}-to-${toId}"]`,
                `g[id*="${fromId}-to-${toId}"]`,
                `.connection-group[id*="${fromId}-to-${toId}"]`,
                `.connection-line[id*="${fromId}-to-${toId}"]`,
                `.connection-marker[id*="${fromId}-to-${toId}"]`
              ];
              
              // Join selectors with a check for empty strings
              const validSelectors = selectors.filter(s => s.trim() !== '');
              
              if (validSelectors.length === 0) {
                continue;
              }
              
              const selectorString = validSelectors.join(', ');
              
              // Find and remove matching elements
              const elements = connectionsLayer.querySelectorAll(selectorString);
              
              elements.forEach(element => {
                if (element.parentNode) {
                  logger.debug(`Removing inter-child connection element: ${element.tagName}#${element.id || 'no-id'}`, {}, 'task-controls delete');
                  element.parentNode.removeChild(element);
                }
              });
            } catch (error) {
              logger.error('Error cleaning up inter-child connections', { 
                fromId, 
                toId, 
                error: error instanceof Error ? error.message : String(error)
              }, 'task-controls delete error');
            }
          }
        }
      }
    } catch (error) {
      logger.error('Error cleaning up connections between tasks', { 
        parentTaskId,
        childCount: childTaskIds instanceof Set ? childTaskIds.size : childTaskIds.length,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      }, 'task-controls delete error');
    }
  }

  /**
   * Aggressively cleanup any remaining elements after animation
   */
  private async cleanupRemainingElements(taskId: string): Promise<void>{
    logger.debug('Performing final element cleanup', { taskId }, 'task-controls delete');
    
    try {
      // Make sure we have a valid task ID to clean up
      if (!taskId) {
        logger.warn('Invalid task ID for cleanup', {}, 'task-controls delete warning');
        return;
      }
      
      // First get the task's position information if available
      let taskCoords: string | null = null;
      const taskRect = document.getElementById(`task-${taskId}`);
      if (taskRect) {
        const taskTransform = taskRect.getAttribute('transform');
        if (taskTransform) {
          const match = taskTransform.match(/translate\(([^,]+),([^)]+)\)/);
          if (match && match.length >= 3) {
            const x = Math.round(parseFloat(match[1]));
            const y = Math.round(parseFloat(match[2]));
            taskCoords = `${x}-${y}`;
          }
        }
      }
      
      // Very comprehensive selectors for final cleanup
      const selectors = [
        `#task-${taskId}`,
        `.task-control-${taskId}`,
        `[data-task-id="${taskId}"]`,
        `[id*="${taskId}"]`,
        `[data-id*="${taskId}"]`,
        `.task-split-button[data-task-id="${taskId}"]`,
        `g[data-task-id="${taskId}"]`,
        `path[id*="${taskId}"]`,
        `.connection-group[id*="${taskId}"]`,
        `.connection-marker[id*="${taskId}"]`,
        `.connection-line[id*="${taskId}"]`,
        `.counter-display[data-task-id="${taskId}"]`,
        `.task-counter-display[data-task-id="${taskId}"]`,
        `[data-being-removed-task="${taskId}"]`,
        `[data-being-deleted="${taskId}"]`,
        // Target any connection TO our task
        `[id*="to-${taskId}"]`,
        `[id*="from-${taskId}"]`,
        `g.connection-group[id*="to-${taskId}"]`,
        `g.connection-group[id*="from-${taskId}"]`,
        // Special case for SVG elements with class containing task ID
        `g[class*="${taskId}"]`,
        `path[class*="${taskId}"]`
      ];
      
      // Add coordinate-based selectors if we have coords
      if (taskCoords) {
        selectors.push(`[id*="to-${taskCoords}"]`);
        selectors.push(`[id*="${taskCoords}-to"]`);
        selectors.push(`[id*="from-${taskCoords}"]`);
        selectors.push(`[id*="${taskCoords}-from"]`);
        selectors.push(`g.connection-group[id*="to-${taskCoords}"]`);
        selectors.push(`g.connection-group[id*="${taskCoords}-to"]`);
        selectors.push(`g.connection-group[id*="from-${taskCoords}"]`);
        selectors.push(`g.connection-group[id*="${taskCoords}-from"]`);
      }
      
      // Filter out any empty selectors
      const validSelectors = selectors.filter(selector => selector.trim() !== '');
      
      if (validSelectors.length === 0) {
        logger.warn('No valid selectors for element cleanup', { taskId }, 'task-controls delete warning');
        return;
      }
      
      // Combine all selectors
      const combinedSelector = validSelectors.join(', ');
      
      // Find and remove remaining elements
      const remainingElements = document.querySelectorAll(combinedSelector);
      
      if (remainingElements.length > 0) {
        logger.debug(`Final cleanup: found ${remainingElements.length} remaining elements for task ${taskId}`, {}, 'task-controls delete');
        
        // Remove each element directly
        remainingElements.forEach(element => {
          if (element.parentNode) {
            element.parentNode.removeChild(element);
            logger.debug(`Removed element: ${element.tagName}#${element.id || 'no-id'}.${Array.from(element.classList).join('.')}`, {}, 'task-controls delete');
          }
        });
      } else {
        logger.debug(`Final cleanup: no remaining elements found for task ${taskId}`, {}, 'task-controls delete');
      }
      
      // Specifically check for connections in the connections layer
      const connectionsLayer = document.querySelector('.layer-connections');
      if (connectionsLayer) {
        // Check all connection groups for any mention of this task
        // Use a try-catch for each query to handle potential errors
        try {
          // Use more specific, safer selectors
          const connections = connectionsLayer.querySelectorAll('g.connection-group, path.connection-line');
          
          // Track removed elements
          let removedConnectionCount = 0;
          
          // For each connection, check if it's related to our task
          connections.forEach(connection => {
            try {
              const id = connection.id || '';
              const innerHTML = connection.innerHTML || '';
              let shouldRemove = false;
              
              // Check ID for task ID
              if (id.includes(taskId)) {
                shouldRemove = true;
              }
              
              // Check innerHTML for task ID (in nested path IDs)
              if (!shouldRemove && innerHTML.includes(taskId)) {
                shouldRemove = true;
              }
              
              // If we have coords, also check for those
              if (!shouldRemove && taskCoords && (id.includes(taskCoords) || innerHTML.includes(taskCoords))) {
                shouldRemove = true;
              }
              
              // For connection groups, check all child elements
              if (!shouldRemove && connection.tagName.toLowerCase() === 'g') {
                try {
                  // Check all paths in the group
                  connection.querySelectorAll('path').forEach(path => {
                    const pathId = path.id || '';
                    if (pathId.includes(taskId) || (taskCoords && pathId.includes(taskCoords))) {
                      shouldRemove = true;
                    }
                  });
                } catch (pathError) {
                  logger.error('Error checking paths in connection group', { pathError }, 'task-controls delete error');
                }
                
                try {
                  // Check all circles (markers) in the group
                  connection.querySelectorAll('circle').forEach(circle => {
                    const circleId = circle.id || '';
                    if (circleId.includes(taskId) || (taskCoords && circleId.includes(taskCoords))) {
                      shouldRemove = true;
                    }
                  });
                } catch (circleError) {
                  logger.error('Error checking circles in connection group', { circleError }, 'task-controls delete error');
                }
              }
              
              // If this connection should be removed, remove it
              if (shouldRemove && connection.parentNode) {
                connection.parentNode.removeChild(connection);
                logger.debug(`Removed connection: ${connection.tagName}#${id}`, {}, 'task-controls delete');
                removedConnectionCount++;
              }
            } catch (connectionError) {
              logger.error('Error processing connection element', { connectionError }, 'task-controls delete error');
            }
          });
          
          if (removedConnectionCount > 0) {
            logger.debug(`Removed ${removedConnectionCount} connection elements related to task ${taskId}`, {}, 'task-controls delete');
          }
        } catch (connectionQueryError) {
          logger.error('Error querying connection elements', { connectionQueryError }, 'task-controls delete error');
        }
      }
      
      // Finally, check for any task-specific styles in the document
      try {
        const styleIds = [
          `deletion-style-${taskId}`,
          `deletion-control-style-${taskId}`,
          `control-style-${taskId}`
        ];
        
        styleIds.forEach(styleId => {
          const styleEl = document.getElementById(styleId);
          if (styleEl && styleEl.parentNode) {
            styleEl.parentNode.removeChild(styleEl);
            logger.debug(`Removed custom style element: ${styleId}`, {}, 'task-controls delete');
          }
        });
      } catch (styleError) {
        logger.error('Error removing style elements', { styleError }, 'task-controls delete error');
      }
      
    } catch (error) {
      logger.error('Error during cleanup of remaining elements', { 
        taskId, 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      }, 'task-controls delete error');
    }
  }

  /**
   * Restore visibility of elements if deletion failed
   */
  private restoreVisibility(taskId: string): void {
    try {
      logger.debug(`Restoring visibility for task ${taskId}`, {}, 'task-controls delete');
      
      // Find all elements we force-hid
      document.querySelectorAll('.force-hidden-element, .being-removed').forEach(element => {
        if (element instanceof HTMLElement || element instanceof SVGElement) {
          // Restore from saved values if available
          if (element.dataset.originalOpacity !== undefined) {
            element.style.opacity = element.dataset.originalOpacity;
          } else {
            element.style.opacity = '';
          }
          
          if (element.dataset.originalVisibility !== undefined) {
            element.style.visibility = element.dataset.originalVisibility;
          } else {
            element.style.visibility = '';
          }
          
          if (element.dataset.originalPointerEvents !== undefined) {
            element.style.pointerEvents = element.dataset.originalPointerEvents;
          } else {
            element.style.pointerEvents = '';
          }
          
          // Remove our marker classes
          element.classList.remove('force-hidden-element');
          element.classList.remove('being-removed');
        }
      });
    } catch (error) {
      logger.error(`Error restoring visibility for task ${taskId}:`, { error }, 'task-controls delete error');
    }
  }
  
  /**
   * Directly hide all controls for a task with maximum specificity
   */
  private directlyHideControls(taskId: string): void {
    try {
      logger.debug(`Directly hiding controls for task ${taskId}`, {}, 'task-controls interaction');
      
      // This array holds a wide variety of selectors to catch all possible controls
      const selectors = [
        `.task-control-${taskId}`,
        `#task-control-${taskId}`,
        `[data-task-id="${taskId}"]`,
        `.task-split-button[data-task-id="${taskId}"]`,
        `g[data-task-id="${taskId}"]`,
        `.layer-controls g[data-task-id="${taskId}"]`,
        `.regenerate-control[data-task-id="${taskId}"]`,
        `.delete-control[data-task-id="${taskId}"]`,
        `g.task-control-${taskId}`
      ];
      
      // For each selector, find and hide elements
      selectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        logger.debug(`Found ${elements.length} elements with selector ${selector}`, {}, 'task-controls interaction');
        
        elements.forEach(element => {
          if (element instanceof HTMLElement || element instanceof SVGElement) {
            // Save original styles for potential restoration
            if (!element.dataset.originalOpacity) {
              element.dataset.originalOpacity = element.style.opacity || '';
            }
            if (!element.dataset.originalVisibility) {
              element.dataset.originalVisibility = element.style.visibility || '';
            }
            
            // Apply styles with !important to override any other styles
            element.style.setProperty('opacity', '0', 'important');
            element.style.setProperty('visibility', 'hidden', 'important');
            element.style.setProperty('pointer-events', 'none', 'important');
            element.style.setProperty('display', 'none', 'important');
            
            // Add multiple classes for different CSS selectors
            element.classList.add('hidden-during-operation');
            element.classList.add('force-hidden-element');
            element.classList.add('hidden-control');
            
            // Mark as being from task that's being deleted
            element.setAttribute('data-being-removed-task', 'true');
            
            // Ensure the element gets the being-removed class for consistent animations
            element.classList.add('being-removed');
            
            logger.debug(`Hidden control: ${element.tagName}#${element.id || 'no-id'}.${Array.from(element.classList).join('.')}`, {}, 'task-controls interaction');
          }
        });
      });
      
      // Look directly in the controls layer as a fallback
      const controlsLayer = document.querySelector('.layer-controls');
      if (controlsLayer) {
        controlsLayer.querySelectorAll('g').forEach(group => {
          // Check for any attribute that might contain the task ID
          const groupId = group.id || '';
          const groupDataTaskId = group.getAttribute('data-task-id') || '';
          const groupClass = Array.from(group.classList).join(' ');
          
          if (
            groupId.includes(taskId) || 
            groupDataTaskId.includes(taskId) || 
            groupClass.includes(taskId)
          ) {
            group.style.setProperty('opacity', '0', 'important');
            group.style.setProperty('visibility', 'hidden', 'important');
            group.style.setProperty('pointer-events', 'none', 'important');
            group.style.setProperty('display', 'none', 'important');
            
            group.classList.add('hidden-during-operation');
            group.classList.add('force-hidden-element');
            group.classList.add('being-removed');
            
            // Mark as being from task that's being deleted
            group.setAttribute('data-being-removed-task', 'true');
            
            logger.debug(`Hidden control group: ${group.id || 'no-id'}`, {}, 'task-controls interaction');
          }
        });
      }
      
      // Add a class to the task element itself to mark it for deletion
      const taskElement = document.getElementById(`task-${taskId}`);
      if (taskElement) {
        taskElement.setAttribute('data-being-deleted', 'true');
      }
    } catch (error) {
      logger.error(`Error directly hiding controls for task ${taskId}:`, { error }, 'task-controls interaction error');
    }
  }

  /**
   * Remove controls for a specific task completely from the DOM
   */
  private removeTaskControls(taskId: string): void {
    try {
      logger.debug(`Removing controls for task ${taskId} from DOM`, {}, 'task-controls delete');
      
      // Wide variety of selectors to catch all possible controls
      const selectors = [
        `.task-control-${taskId}`,
        `#task-control-${taskId}`,
        `[data-task-id="${taskId}"]`,
        `.task-split-button[data-task-id="${taskId}"]`,
        `g[data-task-id="${taskId}"]`,
        `.layer-controls g[data-task-id="${taskId}"]`,
        `.regenerate-control[data-task-id="${taskId}"]`,
        `.delete-control[data-task-id="${taskId}"]`,
        `g.task-control-${taskId}`,
        `.hidden-during-operation[data-task-id="${taskId}"]`,
        `.force-hidden-element[data-task-id="${taskId}"]`
      ];
      
      // For each selector, find and remove elements
      selectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        logger.debug(`Found ${elements.length} elements to remove with selector ${selector}`, {}, 'task-controls delete');
        
        elements.forEach(element => {
          if (element.parentNode) {
            element.parentNode.removeChild(element);
            logger.debug(`Removed element: ${element.tagName}#${element.id || 'no-id'}`, {}, 'task-controls delete');
          }
        });
      });
    } catch (error) {
      logger.error(`Error removing controls for task ${taskId}:`, { error }, 'task-controls delete error');
    }
  }
}

export const taskControlEventDispatcher = TaskControlEventDispatcher.getInstance();
