'use client';

import { BaseLayer } from './base-layer';
import { TaskControls } from '@/lib/svg/controls/task/controls';
import { ControlEventHandler } from '@/lib/svg/controls/types';
import { TaskEventEmitter, TaskEvent } from '@/lib/client/visual/task/events';
import { logger } from '@/lib/client/logger';
import { useTaskOperations } from '@/components/workspace/hooks/useTaskOperations';
import { select, BaseType } from 'd3-selection';
import * as d3 from 'd3';
import { taskControlEventDispatcher } from '@/lib/svg/controls/task/event-dispatcher';
import { svgOrderManager } from '@/lib/client/visual/utils/svg-order';
import { overlapDetector } from '../utils/overlap-detector';
import { TaskVisualState } from '@/lib/workspace/state/types';
import { workspaceStateManager } from '@/lib/workspace/state/manager';
import { controlVisibilityManager } from '../controls/visibility-manager';
import { taskStateCoordinator } from '../task-hierarchy/state-coordinator';
import { animationCoordinator } from '@/lib/client/visual/animation/coordinator';
import { isStateBeingRestored } from '@/app/preload-state';

interface ControlPosition {
  taskId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  contentHeight: number;
  childrenCount: number;
  descendantCount: number;
  state?: TaskVisualState;
}

interface TaskUpdate {
  taskId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  contentHeight: number;
  childrenCount?: number;
  descendantCount?: number;
  state?: TaskVisualState;
}

interface ProjectCounterUpdate {
  projectId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  childrenCount: number;
  descendantCount: number;
  state?: TaskVisualState;
}

export class ControlLayer extends BaseLayer {
  // Expose handlers publicly so they can be accessed directly
  public handlers: Record<string, ControlEventHandler>;
  
  update(): void {
    // Trigger overlap detection after any update
    this.checkControlOverlaps();
  }

  public setHiddenTasks(taskIds: string[]): void {
    try {
      logger.debug('Handling hidden tasks update', {
        taskCount: taskIds.length
      }, 'controls visibility');

      // Process each task
      taskIds.forEach(taskId => {
        // Remove control if it exists
        this.removeGroup(taskId);
      });

      // Recheck overlaps after updates
      this.checkControlOverlaps();
    } catch (error) {
      logger.error('Failed to update hidden tasks', { error }, 'controls error');
    }
  }
  
  /**
   * Force visibility for specific task controls
   */
  public forceControlVisibility(taskIds: string[]): void {
    try {
      if (taskIds.length === 0) return;
      
      logger.info('Forcing control visibility for specific tasks', {
        taskCount: taskIds.length
      }, 'controls visibility');
      
      // Use the dedicated visibility manager
      const _controlIds = taskIds.map(taskId => `task-control-${taskId}`);
      
      // First ensure controls exist
      taskIds.forEach(taskId => {
        const position = this.positions.get(taskId);
        const state = workspaceStateManager.getState();
        const taskState = state.taskVisualStates.get(taskId);
        
        if (position && taskState && taskState !== 'hidden') {
          // Check if control exists
          const controlSelector = `.task-control-${taskId}`;
          const control = select(controlSelector);
          
          if (control.empty()) {
            // Recreate missing control
            this.updateTaskPosition(taskId, {
              ...position,
              state: taskState
            });
            
            logger.debug('Recreated missing control', { taskId, state: taskState }, 'controls visibility');
          }
        }
      });
      
      // Force visibility with animation
      controlVisibilityManager.forceTaskControlsVisible(taskIds, {
        animate: true,
        duration: 200,
        delay: 50
      });
      
    } catch (error) {
      logger.error('Failed to force control visibility', { error, taskIds }, 'controls error');
    }
  }  
  /**
   * Reset all controls' visibility state with enhanced deletion handling
   */
  public resetControlVisibility(): void {
    try {
      logger.info('Resetting all control visibility states', {}, 'controls visibility');
      
      // Remove all regenerate/delete overlays
      document.querySelectorAll('.regenerate-overlay, .delete-overlay').forEach(element => {
        if (element.parentNode) {
          element.parentNode.removeChild(element);
        }
      });
      
      // Remove SVG mode classes
      const svg = document.querySelector('svg');
      if (svg) {
        svg.classList.remove('mode-regenerate', 'mode-delete');
      }
      
      // Remove operation classes from body
      document.body.classList.remove('deletion-in-progress', 'controls-disabled');
      document.body.classList.remove('mode-regenerate', 'mode-delete');
      
      // Import deletion tracker for coordination
      import('@/lib/client/visual/utils/deletion-tracker')
        .then(({ deletionTracker }) => {
          // Get all tasks that were marked for deletion
          const deletedTaskIds = deletionTracker.getAllDeletedTaskIds();
          
          // Clear control tracking in the overlap detector but preserve rectangles
          overlapDetector.clearControls();
          
          // Reset in the central visibility manager
          controlVisibilityManager.reset();
          
          // Get all visible task IDs from workspace state
          const state = workspaceStateManager.getState();
          const visibleTaskIds: string[] = [];
          const hiddenTaskIds: string[] = [];
          
          // Identify tasks that are being deleted or have already been deleted
          const tasksBeingDeleted = new Set<string>([...deletedTaskIds]);
          
          // Add any elements marked in the DOM as being deleted
          document.querySelectorAll([
            '.task-rect.being-removed', 
            '.task-rect.force-hidden-element',
            '.task-rect.being-deleted',
            '[data-being-deleted="true"]',
            '.task-rect[data-being-deleted="true"]'
          ].join(',')).forEach(element => {
            const id = element.id?.replace('task-', '');
            if (id) tasksBeingDeleted.add(id);
          });
          
          // Check if there is a task currently being deleted from body attribute
          const currentlyDeletingTaskId = document.body.getAttribute('data-deleting-task');
          if (currentlyDeletingTaskId) {
            tasksBeingDeleted.add(currentlyDeletingTaskId);
          }
          
          // Group tasks by visibility - exclude any being deleted
          Array.from(state.taskVisualStates.entries()).forEach(([id, visualState]) => {
            // Skip tasks being deleted
            if (tasksBeingDeleted.has(id)) {
              return;
            }
            
            if (visualState === 'active' || visualState === 'semi-transparent') {
              visibleTaskIds.push(id);
            } else if (visualState === 'hidden') {
              hiddenTaskIds.push(id);
            }
          });
          
          logger.debug('Visibility reset categorization', {
            visibleCount: visibleTaskIds.length,
            hiddenCount: hiddenTaskIds.length,
            beingDeletedCount: tasksBeingDeleted.size,
            deletedFromTracker: deletedTaskIds.length
          }, 'controls visibility');
          
          // First remove all controls completely for a clean slate
          this.clearAllControls();
          
          // For visible tasks, recreate their controls, except for those being deleted
          visibleTaskIds.forEach(taskId => {
            // Double-check task is not being deleted
            if (tasksBeingDeleted.has(taskId) || deletionTracker.isBeingDeleted(taskId)) {
              return;
            }
            
            const position = this.positions.get(taskId);
            if (position) {
              // Force update control position which will recreate the control
              this.updateTaskPosition(taskId, {
                ...position,
                state: state.taskVisualStates.get(taskId) || 'active'
              });
              
              // Register with visibility manager
              const element = document.querySelector(`.task-control-${taskId}`);
              controlVisibilityManager.registerControl(`task-control-${taskId}`, taskId, element);
            }
          });
          
          // Process split buttons with comprehensive deletion checking
          document.querySelectorAll('.task-split-button').forEach(element => {
            const taskId = element.getAttribute('data-task-id');
            
            if (!taskId) {
              // If no task ID, just remove any hiding styles
              (element as HTMLElement).style.removeProperty('display');
              (element as HTMLElement).style.removeProperty('visibility');
              (element as HTMLElement).style.removeProperty('opacity');
              return;
            }
            
            // Check all possible deletion indicators
            const isBeingDeleted = 
              tasksBeingDeleted.has(taskId) || 
              deletionTracker.isBeingDeleted(taskId) ||
              element.classList.contains('being-removed') || 
              element.classList.contains('force-hidden-element') ||
              element.classList.contains('hidden-during-operation') ||
              element.getAttribute('data-being-removed-task') === 'true' ||
              element.getAttribute('data-force-hidden') === 'true';
            
            // Keep variables needed elsewhere in the code
            const className = element.className?.toString() || '';
            const tagName = element.tagName?.toLowerCase() || '';
            const isProjCounter = element.getAttribute('data-project-counter') === 'true';
              
            if (isBeingDeleted) {
              // Keep these hidden
              (element as HTMLElement).style.setProperty('display', 'none', 'important');
              (element as HTMLElement).style.setProperty('visibility', 'hidden', 'important');
              (element as HTMLElement).style.setProperty('opacity', '0', 'important');
              
              // Mark with standard classes
              element.classList.add('hidden-during-operation');
              
              logger.debug('Keeping control hidden for deleted/removing task', { taskId }, 'controls visibility');
            } 
            else if (className.includes('task-control') || 
              className.includes('counter-display') ||
              className.includes('project-counter') ||
              className.includes('regenerate-control') ||
              className.includes('delete-control') ||
              className.includes('regenerate-overlay') ||
              className.includes('delete-overlay') ||
              (tagName === 'g' && element.getAttribute('data-task-id') !== null) ||
              isProjCounter) {
              // Handle controls specially
              // ...
            } else {
              // Restore visibility for other controls
              // First remove any hiding classes
              element.classList.remove(
                'hidden-during-operation',
                'force-hidden-element',
                'force-hidden-control',
                'being-removed'
              );
              
              // Remove any force-hidden attributes
              element.removeAttribute('data-force-hidden');
              element.removeAttribute('data-being-removed-task');
              
              // Then restore styles
              (element as HTMLElement).style.removeProperty('display');
              (element as HTMLElement).style.removeProperty('visibility');
              (element as HTMLElement).style.removeProperty('opacity');
              (element as HTMLElement).style.removeProperty('pointer-events');
              (element as HTMLElement).style.removeProperty('position');
              (element as HTMLElement).style.removeProperty('z-index');
              
              logger.debug('Restored control visibility for task', { taskId }, 'controls visibility');
            }
          });
          
          // Force controls to be visible for non-deleted tasks with multiple retry attempts
          // for better reliability after complex operations
          const applyVisibility = () => {
            controlVisibilityManager.forceTaskControlsVisible(visibleTaskIds, {
              animate: true,
              duration: 200
            });
            
            // Also schedule a final check for any hiding styles that might have been missed
            setTimeout(() => {
              visibleTaskIds.forEach(taskId => {
                document.querySelectorAll(`.task-split-button[data-task-id="${taskId}"]`).forEach(element => {
                  if (element instanceof HTMLElement || element instanceof SVGElement) {
                    // Ensure visibility                  element.style.removeProperty('display');
                  element.style.removeProperty('visibility');
                  element.style.opacity = '1';// Remove hiding classes
                    element.classList.remove(
                      'hidden-during-operation',
                      'force-hidden-element',
                      'force-hidden-control',
                      'being-removed'
                    );
                  }
                });
              });
              
              // Trigger visibility update
              this.checkControlOverlaps();
            }, 100);
          };
          
          // First attempt
          setTimeout(applyVisibility, 50);
          
          // Second attempt after a longer delay for reliability
          setTimeout(applyVisibility, 250);
          
          // Final attempt after animations should be complete
          setTimeout(applyVisibility, 500);
          
          logger.info('Control visibility reset complete', {}, 'controls visibility');
        })
        .catch(error => {
          logger.error('Failed to import deletion tracker during reset', { error }, 'controls error');
          
          // Still try to reset controls without the deletion tracker
          this.checkControlOverlaps();
        });
    } catch (error) {
      logger.error('Failed to reset control visibility', { error }, 'controls error');
      
      // Last resort attempt to restore visibility
      setTimeout(() => {
        this.checkControlOverlaps();
      }, 200);
    }
  }
  /**
   * Clear all controls completely
   */
  private clearAllControls(): void {
    try {
      logger.debug('Clearing all controls', {}, 'controls visibility');
      
      // Remove all control elements from the DOM
      this.group.selectAll('*').remove();
      
      // Clear internal tracking
      this.clear();
      
      // Clear overlap detector's control tracking
      overlapDetector.clearControls();
      
    } catch (error) {
      logger.error('Failed to clear all controls', { error }, 'controls error');
    }
  }  
  /**
   * Project counter is now created directly in the project rectangle renderer
   * This method is kept as a stub for backward compatibility
   */
  public updateProjectCounter(update: ProjectCounterUpdate): void {
    try {
      logger.debug('Project counter update requested in control layer - using embedded counters instead', {
        projectId: update.projectId
      }, 'controls layer');
      
      // This functionality has been moved to the project rectangle renderer
      // We now render counters directly in the project group to ensure they transform together
      
      // Dispatch event to ensure counter visibility if needed
      const event = new CustomEvent('counter-visibility-update', {
        detail: {
          projectId: update.projectId,
          state: update.state
        },
        bubbles: true
      });
      
      document.dispatchEvent(event);
      
    } catch (error) {
      logger.error('Error in project counter update stub', { 
        projectId: update.projectId, 
        error: error instanceof Error ? error.message : String(error)
      }, 'controls error');
    }
  }
  
  private handleTaskEvent(event: TaskEvent): void {
    try {
      // Skip during state restoration
      if (isStateBeingRestored()) return;
      
      // Handle state change events
      if (event.type === 'stateChange' && event.data) {
        const data = event.data as { 
          state: string; 
          rect?: DOMRect; 
          isComplete?: boolean;
          isStarting?: boolean;
          previousState?: string;
        };
        
        // Get current state
        const state = workspaceStateManager.getState();
        const taskState = state.taskVisualStates.get(event.taskId);
        
        logger.debug('Task state change event in control layer', {
          taskId: event.taskId,
          requestedState: data.state,
          currentState: taskState,
          isComplete: data.isComplete,
          isStarting: data.isStarting
        }, 'controls layer operation');

        // If this is a major state transition (selected/projectSelected)
        if (data.state === 'selected' || data.state === 'projectSelected') {
          // Let the task state coordinator handle this
          if (data.state === 'selected') {
            taskStateCoordinator.handleTaskSelection(event.taskId, data.rect);
          } else if (data.state === 'projectSelected') {
            taskStateCoordinator.handleProjectSelection(event.taskId);
          }
          return;
        }

        // For normal state updates, update control based on task state
        const position = this.positions.get(event.taskId);
        if (position && taskState) {
          if (taskState === 'hidden') {
            this.removeGroup(event.taskId);
            controlVisibilityManager.unregisterControl(`task-control-${event.taskId}`);
          } else {
            this.updateTaskPosition(event.taskId, {
              ...position,
              state: taskState
            });
          }
        }
        
        // If this is completion of a state change, update visibility
        if (data.isComplete) {
          logger.debug('State change complete, updating visibility', {}, 'controls visibility');
          setTimeout(() => {
            this.checkControlOverlaps();
          }, 50);
        }
      }
      
      // Handle height changes
      else if (event.type === 'expand' || event.type === 'collapse') {
        const position = this.positions.get(event.taskId);
        if (position && event.height) {
          this.updateTaskPosition(event.taskId, {
            ...position,
            contentHeight: event.height
          });
          
          // Update visibility after height change
          setTimeout(() => {
            this.checkControlOverlaps();
          }, 50);
        }
      }
      
      // Handle regenerate events
      else if (event.type === 'regenerate' || event.type === 'regenerateComplete') {
        const isComplete = event.type === 'regenerateComplete';
        
        logger.debug(`Regenerate ${isComplete ? 'complete' : 'start'} event received in control layer`, { 
          taskId: event.taskId,
          hasData: !!event.data
        }, 'controls layer operation');
        
        // Get data if available
        const data = event.data || {};
        
        if (event.type === 'regenerate' && data.isStarting) {
          // For regenerate start, show loading state on control
          if (document.body.classList.contains('mode-regenerate')) {
            const controlId = `regenerate-control-${event.taskId}`;
            const controlElement = document.getElementById(controlId);
            
            if (controlElement) {
              this.showLoadingState(controlId, true);
              
              logger.debug('Set loading state for regenerate control', {
                taskId: event.taskId,
                controlId
              }, 'controls operation');
            }
          }
          
          // Hide split buttons during regenerate operation
          this.hideSplitButtons();
        }
        else if (isComplete) {
          // On completion, reset control visibility and state
          logger.info('Regenerate operation completed', {
            taskId: event.taskId,
            success: data.success
          }, 'controls operation');
          
          // Reset all controls
          this.resetControlVisibility();
          
          // Hide loading state on control if visible
          const controlId = `regenerate-control-${event.taskId}`;
          const controlElement = document.getElementById(controlId);
          
          if (controlElement) {
            this.showLoadingState(controlId, false);
          }
          
          // Reset mode class on body
          document.body.classList.remove('mode-regenerate');
          
          // For tasks that had subtasks, we need to update the control to show a split button instead of counter
          if (data.hadSubtasks) {
            try {
              // Get the task position
              const position = this.positions.get(event.taskId);
              if (position) {
                // Force update to refresh the control with zeroed counts
                this.updateTaskPosition(event.taskId, {
                  ...position,
                  childrenCount: 0,
                  descendantCount: 0,
                  state: 'active'
                });
                
                logger.debug('Updated control for regenerated task with subtasks', {
                  taskId: event.taskId
                }, 'controls operation');
              }
            } catch (updateError) {
              logger.warn('Failed to update control for regenerated task', {
                taskId: event.taskId,
                error: updateError
              }, 'controls warning');
            }
          }
          
          // Dispatch event to reset common controls UI
          window.dispatchEvent(new CustomEvent('reset-common-controls'));
        }
      }
      
      // Handle project deletion event specifically - this needs to come BEFORE the general delete handler
      if ((event.type as string) === 'deleteComplete' && event.data?.isLastTaskInProject === true) {
        const data = event.data as {
          projectId?: string;
          isLastTaskInProject: boolean;
        };
        
        if (data.projectId) {
          logger.info('Last task in project deleted, project should also be deleted', {
            projectId: data.projectId,
            taskId: event.taskId
          }, 'controls layer operation');
          
          // Just reset the controls - the project deletion is handled in the event dispatcher
          this.resetControlVisibility();
        }
        
        // Continue to the standard delete complete handling
        // Fall through to general delete handler
      }
      
      // Handle delete events - general handler for standard cases
      else if (event.type === 'delete' || (event.type as string) === 'deleteComplete') {
        const isComplete = (event.type as string) === 'deleteComplete';
        
        logger.debug(`Delete ${isComplete ? 'complete' : 'start'} event received in control layer`, { 
          taskId: event.taskId,
          hasData: !!event.data
        }, 'controls layer operation');
        
        // Get data if available
        const data = event.data || {};
        
        if (event.type === 'delete' && data.isStarting) {
          logger.debug(`Control layer: Delete starting for task ${event.taskId}`, {}, 'controls layer operation');
          
          // Immediately hide all split buttons
          this.hideSplitButtons();
          
          // Immediately hide split controls specifically for this task
          this.hideTaskSplitControl(event.taskId);
          
          // For delete start, show loading state on control
          if (document.body.classList.contains('mode-delete')) {
            const controlId = `delete-control-${event.taskId}`;
            const controlElement = document.getElementById(controlId);
            
            if (controlElement) {
              this.showLoadingState(controlId, true);
              
              logger.debug('Set loading state for delete control', {
                taskId: event.taskId,
                controlId
              }, 'controls operation');
            }
          }
          
          // Add class to body to disable pointer events during deletion
          document.body.classList.add('deletion-in-progress');
          
          // Take more direct action to hide controls for this task
          this.directlyHideControls(event.taskId);
        }
        else if (isComplete) {
          logger.debug(`Control layer: Delete complete for task ${event.taskId}`, {}, 'controls layer operation');
          
          // On completion, reset control visibility and state
          logger.info('Delete operation completed', {
            taskId: event.taskId,
            success: data.success
          }, 'controls operation');
          
          // Reset all controls
          this.resetControlVisibility();
          
          // Hide loading state on control if visible
          const controlId = `delete-control-${event.taskId}`;
          const controlElement = document.getElementById(controlId);
          
          if (controlElement) {
            this.showLoadingState(controlId, false);
          }
          
          // Remove deletion-in-progress class
          document.body.classList.remove('deletion-in-progress');
          
          // Reset mode class on body
          document.body.classList.remove('mode-delete');
          
          // Dispatch event to reset common controls UI
          window.dispatchEvent(new CustomEvent('reset-common-controls'));
          
          // Force removal of any remaining controls for this task
          setTimeout(() => {
            this.removeTaskControls(event.taskId);
          }, 100);
        }
      }
      
      // Handle error events
      else if (event.type === 'error' && event.data) {
        const data = event.data as {
          error: string;
          operation?: string;
        };
        
        logger.error('Task operation error event received', {
          taskId: event.taskId,
          operation: data.operation,
          error: data.error
        }, 'controls error');
        
        // Reset controls
        this.resetControlVisibility();
        
        // Remove deletion-in-progress class
        document.body.classList.remove('deletion-in-progress');
        
        // Reset mode classes
        document.body.classList.remove('mode-regenerate', 'mode-delete');
        
        // Dispatch event to reset common controls UI
        window.dispatchEvent(new CustomEvent('reset-common-controls'));
      }
    } catch (error) {
      logger.error('Error handling task event', {
        eventType: event.type,
        taskId: event.taskId,
        error
      }, 'controls error');
    }
  }  
  
  public updateTaskPosition(taskId: string, update: TaskUpdate): void {
    try {
      // Skip during state restoration
      if (isStateBeingRestored()) return;
      
      logger.debug('Starting updateTaskPosition', {
        taskId,
        state: update.state
      }, 'controls layer');

      // Handle hidden state
      if (update.state === 'hidden') {
        this.removeGroup(taskId);
        controlVisibilityManager.unregisterControl(`task-control-${taskId}`);
        return;
      }

      // Remove existing control if present
      this.removeGroup(taskId);

      // Calculate position - adjust for mobile if needed
      let x = update.x + (update.width / 2);
      let y = update.y + (update.contentHeight || update.height);
      
      // Check if we're on mobile
      const isMobile = document.body.getAttribute('data-mobile-view') === 'true' || 
                       window.innerWidth <= 768;
      
      // Set mobile attribute on body for CSS targeting
      if (isMobile && !document.body.hasAttribute('data-mobile-view')) {
        document.body.setAttribute('data-mobile-view', 'true');
      }
      
      // Enhanced positioning for mobile to ensure controls are correctly placed
      if (isMobile) {
        // Use consistent precision but don't round too aggressively
        x = Number(x.toFixed(3));
        y = Number(y.toFixed(3));
        
        // Log detailed mobile positioning for debugging
        logger.debug('Mobile device detected, using enhanced control positioning', {
          taskId,
          original: {
            x: update.x,
            y: update.y,
            width: update.width,
            height: update.height || update.contentHeight
          },
          calculated: {
            x,
            y
          },
          isMobile
        }, 'controls layer mobile');
      }

      // Store updated position
      this.positions.set(taskId, {
        taskId,
        x: update.x,
        y: update.y,
        width: update.width,
        height: update.height,
        contentHeight: update.contentHeight || update.height,
        childrenCount: update.childrenCount ?? 0,
        descendantCount: update.descendantCount ?? 0,
        state: update.state
      });
      
      // Create split button group with enhanced positioning attributes
      const controlGroup = this.group.append('g')
        .attr('class', `task-control-${taskId} task-split-button`)  // Split button specific class
        .attr('data-task-id', taskId)
        .attr('data-control-type', 'split')  // Explicitly mark as split button
        .attr('data-id', `task-control-${taskId}`)
        .attr('transform', `translate(${x},${y})`) // SVG transform
        .attr('data-x', x) // Store x position as data attribute
        .attr('data-y', y) // Store y position as data attribute
        .node();

      if (!controlGroup) {
        throw new Error('Failed to create control group');
      }
      
      // Add additional mobile-specific attributes if needed
      if (isMobile) {
        // Use the DOM element API for more direct control
        controlGroup.setAttribute('data-mobile', 'true');
        
        // Ensure transform is applied both as attribute and as style
        // This creates redundancy that helps on problematic browsers
        const transformStyle = `translate(${x}px, ${y}px)`;
        controlGroup.style.transform = transformStyle;
      }

      // Register control with our internal tracking
      this.addGroup(taskId, controlGroup);

      // Set up control hierarchy - make sure we calculate proper level
      let taskLevel = svgOrderManager.getElementLevel(`task-${taskId}`);
      
      // Ensure we have a valid level (default to level 3 if not found)
      if (isNaN(taskLevel) || taskLevel <= 0) {
        logger.warn('Invalid task level for control, using default', {
          taskId,
          calculatedLevel: taskLevel
        }, 'controls warning');
        taskLevel = 3; // Default to FIRST_LEVEL_TASK
      }
      
      // Control is one level above its task
      const controlLevel = taskLevel + 1;

      // Set data attribute for debugging
      select(controlGroup).attr('data-level', controlLevel.toString());

      // Register with order manager
      svgOrderManager.registerElement(
        `task-control-${taskId}`, 
        controlGroup, 
        controlLevel,
        true
      );

      // Register with overlap detector
      overlapDetector.registerControl(
        `task-control-${taskId}`,
        {
          x: x - 15,
          y: y - 15,
          width: 30,
          height: 30
        },
        controlLevel,
        `task-${taskId}`
      );

      // Register with visibility manager
      controlVisibilityManager.registerControl(
        `task-control-${taskId}`, 
        taskId, 
        controlGroup
      );

      // Render control button
      this.controls.render(controlGroup, {
        id: taskId,
        type: 'split',
        state: update.state || 'active',
        position: { x: 0, y: 0 },
        childrenCount: update.childrenCount,
        descendantCount: update.descendantCount
      });

      // Ensure controls are non-interactive
      select(controlGroup).style('pointer-events', 'none');

      // Apply state-based visibility using animation coordinator
      if (update.state) {
        // Use the DOM element directly instead of passing the d3 selection
        animationCoordinator.animateStateChange(
          controlGroup,
          update.state, 
          { duration: 200 }
        );
      }

      // Apply order and check overlaps
      svgOrderManager.applyOrder();
      
      // Trigger overlap check after rendering
      this.checkControlOverlaps();

    } catch (error) {
      logger.error('Failed to update control position', { taskId, error }, 'controls error');
    }
  }

  private checkControlOverlaps(): void {
    try {
      // Skip during state restoration
      if (isStateBeingRestored()) return;
      
      // Use the dedicated visibility manager to update visibility
      controlVisibilityManager.updateVisibility();
    } catch (error) {
      logger.error('Failed to check control overlaps', { error }, 'controls error');
    }
  }

  /**
   * Show loading state for a control
   */
  public showLoadingState(controlId: string, isLoading: boolean): void {
    try {
      logger.debug('Setting control loading state', { 
        controlId, 
        isLoading
      }, 'controls operation');
      
      // Find the control
      const controlGroup = select(`.${controlId}`);
      if (controlGroup.empty()) return;
      
      if (isLoading) {
        // Show loading indicator
        controlGroup.selectAll('*').remove();
        
        // Add spinner
        controlGroup.append('circle')
          .attr('r', 14)
          .style('fill', controlId.includes('regenerate') ? '#3b82f6' : '#ef4444');
        
        // Add loading spinner
        const spinnerRadius = 6;
        controlGroup.append('circle')
          .attr('r', spinnerRadius)
          .attr('cx', 0)
          .attr('cy', 0)
          .style('fill', 'none')
          .style('stroke', 'white')
          .style('stroke-width', 2)
          .style('stroke-dasharray', `${Math.PI * spinnerRadius / 2} ${Math.PI * spinnerRadius}`)
          .append('animateTransform')
            .attr('attributeName', 'transform')
            .attr('type', 'rotate')
            .attr('from', '0 0 0')
            .attr('to', '360 0 0')
            .attr('dur', '1s')
            .attr('repeatCount', 'indefinite');
      } else {
        // For regenerate controls
        if (controlId.includes('regenerate')) {
          // Clear existing content
          controlGroup.selectAll('*').remove();
          
          // Redraw button with icon
          controlGroup.append('circle')
            .attr('r', 14)
            .style('fill', '#3b82f6')
            .style('stroke', '#2563eb')
            .style('stroke-width', 1);
          
          // Add icon
          this.renderRegenerateIcon(controlGroup);
        }
        // For delete controls
        else if (controlId.includes('delete')) {
          // Clear existing content
          controlGroup.selectAll('*').remove();
          
          // Redraw button with icon
          controlGroup.append('circle')
            .attr('r', 14)
            .style('fill', '#ef4444')
            .style('stroke', '#dc2626')
            .style('stroke-width', 1);
          
          // Add icon - trash icon
          controlGroup.append('rect')
            .attr('x', -6)
            .attr('y', -7)
            .attr('width', 12)
            .attr('height', 14)
            .attr('rx', 1)
            .style('fill', 'none')
            .style('stroke', 'white')
            .style('stroke-width', 1.5);
            
          controlGroup.append('path')
            .attr('d', 'M-8,-7 H8')
            .style('fill', 'none')
            .style('stroke', 'white')
            .style('stroke-width', 1.5);
            
          controlGroup.append('path')
            .attr('d', 'M-3,-10 V-7 M3,-10 V-7')
            .style('fill', 'none')
            .style('stroke', 'white')
            .style('stroke-width', 1.5);
            
          controlGroup.append('path')
            .attr('d', 'M-3,-3 V3 M3,-3 V3')
            .style('fill', 'none')
            .style('stroke', 'white')
            .style('stroke-width', 1.5);
        }
        // For regular split controls
        else {
          const container = controlGroup.node();
          if (container) {
            // Clear existing content
            controlGroup.selectAll('*').remove();
            // Re-render with new state
            this.controls.render(container as SVGGElement, {
              id: controlId.replace('task-control-', ''),
              type: 'split',
              state: 'active',
              position: { x: 0, y: 0 }
            });
          }
        }
      }
    } catch (error) {
      logger.error('Failed to update loading state', { controlId, error }, 'controls error');
    }
  }
  
  /**
   * Render the regenerate icon with a cleaner, more visible design
   */
  private renderRegenerateIcon(group: d3.Selection<BaseType, unknown, HTMLElement, unknown>): void {
    // Create a properly centered circular refresh icon
    group.append('circle')
      .attr('r', 6)
      .attr('cx', 0)
      .attr('cy', 0)
      .style('fill', 'none')
      .style('stroke', 'white')
      .style('stroke-width', 0.5)
      .style('stroke-dasharray', '1,99')
      .style('stroke-opacity', 0.2);
      
    // Add main circular arrow - properly centered
    group.append('path')
      .attr('d', 'M0,-6 A6,6 0 1,1 -3.5,5 M-3.5,5 L-6,3 L-2,2')
      .style('fill', 'none')
      .style('stroke', 'white')
      .style('stroke-width', 2)
      .style('stroke-linecap', 'round')
      .style('stroke-linejoin', 'round');
  }
  
  /**
   * Hide all split buttons in the workspace
   * Used during delete/regenerate operations
   */
  private hideSplitButtons(): void {
    try {
      logger.debug('Hiding all split buttons for operation', {}, 'controls visibility');
      
      document.querySelectorAll('.task-split-button').forEach(button => {
        if (button instanceof HTMLElement || button instanceof SVGElement) {
          button.style.opacity = '0';
          button.style.visibility = 'hidden';
          button.style.pointerEvents = 'none';
        }
      });
    } catch (error) {
      logger.error('Error hiding split buttons', { error }, 'controls error');
    }
  }
  
  /**
   * Hide task split control for a specific task
   * Used during deletion process
   */
  private hideTaskSplitControl(taskId: string): void {
    try {
      logger.debug(`Hiding split control for task ${taskId}`, {}, 'controls visibility');
      
      // Register with global deletion tracker
      import('@/lib/client/visual/utils/deletion-tracker')
        .then(({ deletionTracker }) => {
          deletionTracker.markForDeletion(taskId);
        })
        .catch(error => {
          logger.error('Failed to import deletion tracker:', { error }, 'controls error');
        });
      
      // Target the specific task control with multiple selectors for better coverage
      const selectors = [
        `.task-control-${taskId}`,
        `[data-task-id="${taskId}"].task-split-button`,
        `g[data-task-id="${taskId}"]`,
        `#task-control-${taskId}`,
        `.task-split-button[data-task-id="${taskId}"]`
      ];
      
      const selector = selectors.join(', ');
      const elements = document.querySelectorAll(selector);
      logger.debug(`Found ${elements.length} elements to hide for task ${taskId}`, {}, 'controls visibility');
      
      elements.forEach(element => {
        if (element instanceof HTMLElement || element instanceof SVGElement) {
          // Use the force hide method for consistency
          this.forceHideElement(element);
          logger.debug(`Hidden element: ${element.tagName}#${element.id || 'no-id'}.${Array.from(element.classList).join('.')}`, {}, 'controls visibility');
        }
      });
      
      // Also add a central style rule for any future elements
      const styleId = `control-style-${taskId}`;
      let styleEl = document.getElementById(styleId);
      
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = styleId;
        document.head.appendChild(styleEl);
        
        styleEl.textContent = `
          /* Ensure controls for task ${taskId} are always hidden */
          .task-control-${taskId},
          #task-control-${taskId},
          [data-task-id="${taskId}"],
          .task-split-button[data-task-id="${taskId}"],
          g[data-task-id="${taskId}"],
          .regenerate-control[data-task-id="${taskId}"],
          .delete-control[data-task-id="${taskId}"] {
            display: none !important;
            visibility: hidden !important;
            opacity: 0 !important;
            pointer-events: none !important;
            position: absolute !important;
            z-index: -9999 !important;
            transition: none !important;
            animation: none !important;
          }
        `;
      }
    } catch (error) {
      logger.error('Error hiding task split control', { 
        taskId, 
        error: error instanceof Error ? error.message : String(error) 
      }, 'controls error');
    }
  }  
  
  /**
   * Directly hide all controls for a task with maximum specificity
   */
  private directlyHideControls(taskId: string): void {
    try {
      logger.debug(`Directly hiding controls for task ${taskId}`, {}, 'controls visibility');
      
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
        logger.debug(`Found ${elements.length} elements with selector ${selector}`, {}, 'controls visibility');
        
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
            
            logger.debug(`Hidden control: ${element.tagName}#${element.id || 'no-id'}.${Array.from(element.classList).join('.')}`, {}, 'controls visibility');
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
            
            console.log(`Hidden control group: ${group.id || 'no-id'}`);
          }
        });
      }
      
      // Add a class to the task element itself to mark it for deletion
      const taskElement = document.getElementById(`task-${taskId}`);
      if (taskElement) {
        taskElement.setAttribute('data-being-deleted', 'true');
      }
    } catch (error) {
      logger.error(`Error directly hiding controls for task ${taskId}`, { error }, 'controls error');
    }
  }
  
  /**
   * Remove controls for a specific task completely from the DOM
   */
  private removeTaskControls(taskId: string): void {
    try {
      logger.debug(`Removing controls for task ${taskId} from DOM`, {}, 'controls visibility');
      
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
        logger.debug(`Found ${elements.length} elements to remove with selector ${selector}`, {}, 'controls visibility');
        
        elements.forEach(element => {
          if (element.parentNode) {
            element.parentNode.removeChild(element);            
            logger.debug(`Removed element: ${element.tagName}#${element.id || 'no-id'}`, {}, 'controls visibility');
          }
        });
      });
      
      // Also make sure no task position is retained in our internal tracking
      this.positions.delete(taskId);
      
      // Check if we need to update control visibility
      this.checkControlOverlaps();
    } catch (error) {
      logger.error(`Error removing controls for task ${taskId}`, { error }, 'controls error');
    }
  }

  private controls: TaskControls;
  private positions: Map<string, ControlPosition>;
  private removeListener: (() => void) | null = null;
  private counterRecreationListener: EventListener | null = null;
  private static instanceCount: number = 0;

  constructor(
    id: string, 
    group: d3.Selection<SVGGElement, unknown, null, undefined>,
    handlers: Record<string, ControlEventHandler>,
    taskOperations: ReturnType<typeof useTaskOperations>) {
    super(id, group);

    // Track instances to prevent multiple instantiation
    ControlLayer.instanceCount++;
    
    // Ensure controls layer is always on top
    group.raise();

    // Initialize event dispatcher with task operations
    taskControlEventDispatcher.setTaskOperations(taskOperations);

    // Save handlers for use in control elements - exposed publicly
    this.handlers = handlers;

    this.controls = new TaskControls(handlers);
    this.positions = new Map();

    // Listen for task state change events
    this.removeListener = TaskEventEmitter.getInstance().addListener(this.handleTaskEvent.bind(this));
    
    // Set up DOM mutation observer
    this.setupMutationObserver();
    
    // Set up event listener for project counter recreation
    this.setupCounterRecreationListener();
    
    // Set up event listener for parent task children removed event
    this.setupParentTaskEventListener();
    
    // Set up mobile-specific enhancements
    this.setupMobileEnhancements();
    
    logger.info('Control layer initialized with event-driven overlap detection and mobile support', {}, 'controls layer');
  }
  
  /**
   * Set up mobile-specific enhancements for better control positioning
   */
  private setupMobileEnhancements(): void {
    try {
      // Check if we're on mobile
      const isMobileDevice = typeof window !== 'undefined' && 
                      (document.body.getAttribute('data-mobile-view') === 'true' || 
                       window.innerWidth <= 768);
      
      // Set mobile attribute on body if needed
      if (isMobileDevice && !document.body.hasAttribute('data-mobile-view')) {
        document.body.setAttribute('data-mobile-view', 'true');
      }
      
      // Handle resize events to update mobile status
      if (typeof window !== 'undefined') {
        const handleResize = () => {
          const isCurrentlyMobile = window.innerWidth <= 768;
          
          if (isCurrentlyMobile) {
            document.body.setAttribute('data-mobile-view', 'true');
            
            // Force recalculation of control positions
            this.recalculateControlPositions();
          } else {
            document.body.removeAttribute('data-mobile-view');
          }
        };
        
        window.addEventListener('resize', handleResize);
        
        // Handle orientation change specifically for mobile
        window.addEventListener('orientationchange', () => {
          // Wait for orientation change to complete
          setTimeout(() => {
            handleResize();
            this.recalculateControlPositions();
          }, 300);
        });
      }
      
      // Force initial position updates for mobile
      if (isMobileDevice) {
        setTimeout(() => {
          this.recalculateControlPositions();
        }, 500);
      }
    } catch (error) {
      logger.error('Failed to set up mobile enhancements', { error }, 'controls error');
    }
  }
  
  /**
   * Recalculate and apply all control positions - useful after viewport changes
   */
  private recalculateControlPositions(): void {
    try {
      const isMobileView = document.body.getAttribute('data-mobile-view') === 'true' || 
                          window.innerWidth <= 768;
      
      if (!isMobileView) return;
      
      logger.debug('Recalculating control positions for mobile view', {}, 'controls layer mobile');
      
      // Get all current controls
      const controls = document.querySelectorAll('.task-split-button[data-task-id]');
      
      controls.forEach(control => {
        const taskId = control.getAttribute('data-task-id');
        if (!taskId) return;
        
        const position = this.positions.get(taskId);
        if (!position) return;
        
        // Recalculate position
        const x = position.x + (position.width / 2);
        const y = position.y + (position.contentHeight || position.height);
        
        // Use precise coordinates
        const preciseX = Number(x.toFixed(3));
        const preciseY = Number(y.toFixed(3));
        
        // Apply position directly
        control.setAttribute('transform', `translate(${preciseX},${preciseY})`);
        control.setAttribute('data-x', String(preciseX));
        control.setAttribute('data-y', String(preciseY));
        
        // Also apply CSS transform for redundancy
        (control as HTMLElement).style.transform = `translate(${preciseX}px,${preciseY}px)`;
        
        logger.debug('Recalculated position for control', {
          taskId,
          x: preciseX,
          y: preciseY
        }, 'controls layer mobile');
      });
    } catch (error) {
      logger.error('Failed to recalculate control positions', { error }, 'controls error');
    }
  }
  
  /**
   * Set up event listener for counter-related events
   * This method now only handles visibility - actual counter creation is done in project renderer
   */  
  private setupCounterRecreationListener(): void {
    // Add event listener for counter visibility updates
    const handleCounterVisibility = (event: CustomEvent) => {
      try {
        const detail = event.detail;
        if (!detail || !detail.projectId) {
          logger.warn('Invalid counter visibility event data', {}, 'controls warning');
          return;
        }
        
        logger.debug('Counter visibility update event received', {
          projectId: detail.projectId,
          event: event.type
        }, 'controls layer');
        
        // Force counter visibility
        setTimeout(() => {
          const counter = document.querySelector(
            `.project-counter-${detail.projectId}, [data-project-id="${detail.projectId}"].project-counter, .embedded-counter`
          );
          
          if (counter && (counter instanceof HTMLElement || counter instanceof SVGElement)) {
            counter.style.visibility = 'visible';
            counter.style.opacity = '1';
            counter.style.display = '';
            
            // Ensure all children are visible too
            counter.querySelectorAll('*').forEach(child => {
              if (child instanceof HTMLElement || child instanceof SVGElement) {
                child.style.visibility = 'visible';
                child.style.opacity = '1';
                child.style.display = '';
              }
            });
            
            logger.debug('Ensured counter visibility', {
              projectId: detail.projectId
            }, 'controls visibility');
          }
        }, 50);
        
        // Trigger overlap check
        setTimeout(() => this.checkControlOverlaps(), 100);
      } catch (error) {
        logger.error('Error handling counter visibility event', {
          error: error instanceof Error ? error.message : String(error),
          eventData: event.detail
        }, 'controls error');
      }
    };
    
    // Remove existing listener if any
    document.removeEventListener('counter-visibility-update', handleCounterVisibility as EventListener);
    
    // Add new listener
    document.addEventListener('counter-visibility-update', handleCounterVisibility as EventListener);
    
    // Store reference for cleanup
    this.counterRecreationListener = handleCounterVisibility as EventListener;
    
    logger.debug('Counter visibility event listener set up', {}, 'controls layer');
  }
  
  /**
   * Set up event listener for parent task children removed event
   * This is triggered when a parent task's last child is deleted
   */
  private parentTaskEventListener: EventListener | null = null;
  
  private setupParentTaskEventListener(): void {
    // Create the event handler
    const handleParentTaskChildrenRemoved = (event: CustomEvent) => {
      try {
        const detail = event.detail;
        if (!detail || !detail.parentTaskId) {
          logger.warn('Invalid parent task event data', {}, 'controls warning');
          return;
        }
        
        const parentTaskId = detail.parentTaskId;
        
        logger.info('Parent task children removed event received', {
          parentTaskId,
          timestamp: detail.timestamp
        }, 'controls layer');
        
        // Get the parent task from state
        const state = workspaceStateManager.getState();
        const parentTask = state.tasks.find(t => t._id?.toString() === parentTaskId);
        
        if (!parentTask) {
          logger.warn('Parent task not found in state', { parentTaskId }, 'controls warning');
          return;
        }
        
        // Verify the parent task has no children
        if (parentTask.childrenCount !== 0) {
          logger.debug('Parent task still has children, updating its control with counts', {
            parentTaskId,
            childrenCount: parentTask.childrenCount
          }, 'controls layer');
          
          // Find the position data
          const position = this.positions.get(parentTaskId);
          if (position) {
            // Update with current counts
            this.updateTaskPosition(parentTaskId, {
              ...position,
              childrenCount: parentTask.childrenCount,
              descendantCount: parentTask.descendantCount,
              state: position.state || 'active'
            });
          }
          return;
        }
        
        logger.info('Parent task has no more children, converting counter to split button', {
          parentTaskId
        }, 'controls layer operation');
        
        // Find the parent task's position
        const position = this.positions.get(parentTaskId);
        if (position) {
          // Force update with zero counts - this will make SplitButton show a split button instead of counter
          this.updateTaskPosition(parentTaskId, {
            ...position,
            childrenCount: 0,
            descendantCount: 0,
            state: position.state || 'active'
          });
          
          // Force visibility of the split button
          this.forceControlVisibility([parentTaskId]);
          
          logger.debug('Updated parent task control to show split button', {
            parentTaskId
          }, 'controls layer');
        } else {
          logger.warn('Parent task position not found', { parentTaskId }, 'controls warning');
        }
        
        // Check for overlap after update
        setTimeout(() => {
          this.checkControlOverlaps();
        }, 100);
        
      } catch (error) {
        logger.error('Error handling parent task children removed event', {
          error: error instanceof Error ? error.message : String(error),
          eventData: event.detail
        }, 'controls error');
      }
    };
    
    // Remove existing listener if any
    if (this.parentTaskEventListener) {
      document.removeEventListener('parent-task-children-removed', this.parentTaskEventListener);
    }
    
    // Add new listener
    document.addEventListener('parent-task-children-removed', handleParentTaskChildrenRemoved as EventListener);
    
    // Store reference for cleanup
    this.parentTaskEventListener = handleParentTaskChildrenRemoved as EventListener;
    
    logger.debug('Parent task children removed event listener set up', {}, 'controls layer');
  }
  
  /**
   * Set up mutation observer to detect DOM changes
   */  
  private setupMutationObserver(): void {
    if (typeof MutationObserver === 'undefined' || typeof window === 'undefined') return;
    
    try {
      // Import the deletion tracker for checking deleted tasks
      let deletionTracker: { 
        isBeingDeleted: (taskId: string) => boolean 
      } | null = null;
      import('@/lib/client/visual/utils/deletion-tracker')
        .then((module) => {
          deletionTracker = module.deletionTracker;
        })
        .catch(error => {
          logger.error('Failed to import deletion tracker:', { error });
        });
      
      // Create mutation observer to detect DOM changes
      const observer = new MutationObserver((mutations) => {
        // Check if any mutations are relevant for controls
        const relevantMutation = mutations.some(mutation => {
          if (!mutation.target) return false;
          
          // Check if target or added/removed nodes are related to controls
          const isControlRelated = (element: Element | null): boolean => {
            if (!element) return false;
            
            const className = element.className?.toString() || '';
            const tagName = element.tagName?.toLowerCase() || '';
            const isProjCounter = element.getAttribute('data-project-counter') === 'true';
            
            return (
              className.includes('task-control') || 
              className.includes('counter-display') ||
              className.includes('project-counter') ||
              className.includes('regenerate-control') ||
              className.includes('delete-control') ||
              className.includes('regenerate-overlay') ||
              className.includes('delete-overlay') ||
              (tagName === 'g' && element.getAttribute('data-task-id') !== null) ||
              isProjCounter
            );
          };
          
          // Check target
          if (isControlRelated(mutation.target as Element)) {
            // Check if it's a control for a deleted task
            if (deletionTracker && mutation.target instanceof Element) {
              const taskId = mutation.target.getAttribute('data-task-id');
              if (taskId && deletionTracker.isBeingDeleted(taskId)) {
                // Hide it immediately
                this.forceHideElement(mutation.target as Element);
              }
            }
            return true;
          }
          
          // Check added nodes
          if (mutation.addedNodes.length > 0) {
            for (let i = 0; i < mutation.addedNodes.length; i++) {
              const node = mutation.addedNodes[i];
              if (isControlRelated(node as Element)) {
                // Check if it's a control for a deleted task
                if (deletionTracker && node instanceof Element) {
                  const taskId = node.getAttribute('data-task-id');
                  if (taskId && deletionTracker.isBeingDeleted(taskId)) {
                    // Hide it immediately
                    this.forceHideElement(node as Element);
                  }
                }
                return true;
              }
            }
          }
          
          return false;
        });
        
        // If relevant mutation found, trigger overlap check
        if (relevantMutation && !isStateBeingRestored()) {
          this.checkControlOverlaps();
        }
      });
      
      // Start observing the SVG element
      setTimeout(() => {
        const svg = document.querySelector('svg');
        if (svg) {
          observer.observe(svg, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['transform', 'style', 'class', 'opacity', 'visibility', 'data-task-id']
          });
          
          logger.debug('Control layer mutation observer started', {}, 'controls layer');
        }
      }, 1000);
    } catch (error) {
      logger.error('Failed to set up mutation observer', { error }, 'controls error');
    }
  }
  
  /**
   * Force hide an element with multiple techniques
   */
  private forceHideElement(element: Element): void {
    try {
      if (element instanceof HTMLElement || element instanceof SVGElement) {
        // Apply inline styles with !important
        element.style.setProperty('display', 'none', 'important');
        element.style.setProperty('visibility', 'hidden', 'important');
        element.style.setProperty('opacity', '0', 'important');
        element.style.setProperty('pointer-events', 'none', 'important');
        element.style.setProperty('position', 'absolute', 'important');
        element.style.setProperty('z-index', '-9999', 'important');
        
        // Add marker classes
        element.classList.add('force-hidden-element');
        element.classList.add('being-removed');
        element.classList.add('force-hidden-control');
        element.classList.add('hidden-during-operation');
        
        // Add data attributes
        element.setAttribute('data-force-hidden', 'true');
        element.setAttribute('data-being-removed-task', 'true');
        
        logger.debug('Force hid control element', {
          id: element.id,
          className: element.className,
          taskId: element.getAttribute('data-task-id')
        }, 'controls visibility');
      }
    } catch (error) {
      logger.error('Error force hiding element', { error }, 'controls error');
    }
  }
  
  public dispose(): void {
    ControlLayer.instanceCount--;
    
    if (this.removeListener) {
      this.removeListener();
      this.removeListener = null;
    }
    
    // Remove counter recreation listener
    if (this.counterRecreationListener) {
      document.removeEventListener('counter-visibility-update', this.counterRecreationListener);
      this.counterRecreationListener = null;
    }
    
    // Remove parent task event listener
    if (this.parentTaskEventListener) {
      document.removeEventListener('parent-task-children-removed', this.parentTaskEventListener);
      this.parentTaskEventListener = null;
    }
    
    this.clear();
  }
}

// Add to the end of the file to ensure it gets compiled

/**
 * Ensures all counter displays are non-interactive
 */
function makeCountersNonInteractive(): void {
  // Find all counter displays
  const counters = document.querySelectorAll('.counter-display, .project-counter, [data-project-counter="true"]');
  
  // Set pointer-events: none on all counters
  counters.forEach((counter) => {
    (counter as HTMLElement).style.pointerEvents = 'none';
    (counter as HTMLElement).style.cursor = 'default';
    
    // Add event listener to prevent click events
    counter.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      return false;
    }, true);
    
    // Add event listener to prevent mousedown events
    counter.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      return false;
    }, true);
  });
}

// Apply this function on a timer to ensure it catches dynamically added counters
if (typeof window !== 'undefined') {
  // Set up interval with error handling for counter management
  setInterval(() => {
    try {
      makeCountersNonInteractive();
    } catch (error) {
      logger.error('Error making counters non-interactive', { error }, 'controls error');
    }
  }, 2000);
  
  // Also apply immediately when the document is ready
  if (document.readyState === 'complete') {
    makeCountersNonInteractive();
  } else {
    document.addEventListener('DOMContentLoaded', makeCountersNonInteractive);
  }
}