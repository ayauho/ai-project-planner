'use client';

import { logger } from '@/lib/client/logger';
import { TaskEventEmitter, TaskEvent } from '@/lib/client/visual/task/events';
import { taskHierarchyManager } from './hierarchy-manager';
import { workspaceStateManager } from '@/lib/workspace/state/manager';
import { controlVisibilityManager } from '../controls/visibility-manager';
import { svgController } from '../services/svg-controller';
import { overlapDetector } from '../utils/overlap-detector';
import { select, Selection } from 'd3-selection';
import { projectRectangleRenderer } from '@/lib/client/visual/project/rectangle';
import { connectionDrawer } from '../services/connection-drawer';
import { centerOnElement, centerOnTaskById, centerOnProjectById } from '@/lib/client/visual/utils/centering';
import { TaskVisualState } from '@/lib/workspace/state/types';

export interface StateTransitionOptions {
  centerViewport?: boolean;
  animateConnections?: boolean;
  resetControls?: boolean;
  directClick?: boolean; // Flag to indicate this was triggered by a direct click
}

// Make sure DOMRect is compatible with our Rectangle type
declare global {
  interface DOMRect {
    toJSON(): object;
  }
}

// Safe access to window and document objects
const isBrowser = typeof window !== 'undefined';

class TaskStateCoordinator {
  private static instance: TaskStateCoordinator;
  private taskEventEmitter: TaskEventEmitter;
  private selectedTaskRef: string | null = null;
  private splitCompletedRef: boolean = false;

  private constructor() {
    this.taskEventEmitter = TaskEventEmitter.getInstance();
    
    // Only set up event listeners in browser environment
    if (isBrowser) {
      this.setupEventListeners();
    }
  }

  public static getInstance(): TaskStateCoordinator {
    if (!TaskStateCoordinator.instance) {
      TaskStateCoordinator.instance = new TaskStateCoordinator();
    }
    return TaskStateCoordinator.instance;
  }

  /**
   * Setup event listeners for task state changes
   */
  private setupEventListeners(): void {
    this.taskEventEmitter.addListener(this.handleTaskEvent.bind(this));
  }

  /**
   * Handle task events
   */
  private handleTaskEvent(event: TaskEvent): void {
    try {
      if (event.type === 'stateChange') {
        const data = event.data as { 
          state: string; 
          rect?: DOMRect; 
          isComplete?: boolean;
          isStarting?: boolean;
          previousState?: string;
          directClick?: boolean; // Flag to indicate direct clicks
        } | undefined;
        
        if (!data) return;
        
        const { state, rect, isComplete, isStarting, directClick } = data;
        
        logger.debug('Task state change event in coordinator', {
          taskId: event.taskId,
          state,
          isComplete,
          isStarting,
          directClick
        }, 'state-coordinator event');

        // If this is a major state transition (selected/projectSelected)
        if ((state === 'selected' || state === 'projectSelected') && !isComplete && !isStarting) {
          const previousSelectedTaskId = this.selectedTaskRef;
          const currentTaskId = event.taskId;
          
          // Don't process if selection hasn't changed
          if (previousSelectedTaskId === currentTaskId) return;
          
          this.selectedTaskRef = currentTaskId;

          // For direct clicks (from rectangle click handlers), use methods with centering
          if (directClick === true) {
            if (state === 'selected') {
              this.handleTaskSelection(event.taskId, rect, { directClick: true });
              return;
            } else if (state === 'projectSelected') {
              this.handleProjectSelection(event.taskId, rect, { directClick: true });
              return;
            }
          }
          
          // For non-direct events (propagated through event system), only apply hierarchy 
          // without centering to prevent duplicate centering operations
          if (state === 'selected') {
            // Only apply hierarchy, no centering
            this.applyTaskHierarchy(event.taskId);
          } else if (state === 'projectSelected') {
            // Only apply hierarchy, no centering
            this.applyProjectHierarchy(event.taskId);
          }
        }
      }
      else if (event.type === 'splitComplete') {
        logger.info('Split completed, handling state transitions', { 
          taskId: event.taskId 
        }, 'state-coordinator split');
        
        // Set split completed flag to true
        this.splitCompletedRef = true;
        
        // Only use setTimeout in browser environment
        if (isBrowser) {
          // Trigger selection on the split task after a delay
          setTimeout(() => {
            // Use the full selection method with centering for split complete
            this.handleTaskSelection(event.taskId);
            
            // Reset split completed flag
            this.splitCompletedRef = false;
          }, 100);
        }
      }
    } catch (error) {
      logger.error('Error handling task event in coordinator', {
        eventType: event.type,
        taskId: event.taskId,
        error
      }, 'state-coordinator error');
    }
  }

  /**
   * Apply task hierarchy without centering
   * Used for events to prevent duplicate centering operations
   */
  private applyTaskHierarchy(taskId: string): void {
    const state = workspaceStateManager.getState();
    
    if (!state.selectedProject) {
      logger.warn('No project selected, cannot apply task hierarchy', {}, 'state-coordinator task');
      return;
    }
    
    try {
      // Set as current selection
      this.selectedTaskRef = taskId;
      
      // Only dispatch events in browser environment
      if (isBrowser) {
        // Emit event to reset common controls
        window.dispatchEvent(new CustomEvent('reset-common-controls'));
      }
      
      // Reset control layer for clean state
      const layers = svgController.getLayers();
      if (layers?.controls) {
        layers.controls.resetControlVisibility();
        overlapDetector.clearControls();
      }
      
      controlVisibilityManager.reset();
      
      // Calculate hierarchy states
      const hierarchy = taskHierarchyManager.calculateTaskHierarchy(taskId, {
        tasks: state.tasks,
        projectId: state.selectedProject._id.toString()
      });
      
      // Apply hierarchy to workspace state
      taskHierarchyManager.applyHierarchy(hierarchy);
      
      // Only use setTimeout in browser environment
      if (isBrowser) {
        setTimeout(() => {
          controlVisibilityManager.forceTaskControlsVisible(hierarchy.activeTaskIds, {
            animate: true,
            duration: 200,
            delay: 50
          });
          
          // Animate connections for selected task
          const layers = svgController.getLayers();
          if (layers?.connections) {
            connectionDrawer.reanimateConnections(layers.connections, taskId);
          }
        }, 300);
      }      // Ensure project state is updated and apply graduated opacity
      if (state.selectedProject) {
        const projectId = state.selectedProject._id.toString();
        const projectState = hierarchy.states.get(projectId) || 'semi-transparent';      // Process all semi-transparent elements with graduated opacity
      if (hierarchy.opacityValues) {
        // Process all rectangles with their graduated opacity values
        hierarchy.opacityValues.forEach((opacity, elementId) =>{
          if (opacity > 0 && opacity < 1) {
            // Update rectangle opacity
            const contentNode = select('.layer-content').node();
            if (contentNode) {
              // Use element state to communicate opacity value
              try {
                const elementState = hierarchy.states.get(elementId) || 'semi-transparent';
                const customOpacityState = `opacity-${opacity.toFixed(3)}`;
                
                // For project
                if (elementId === projectId) {
                  // Use type assertion to ensure TypeScript recognizes this is a valid TaskVisualState
                  // We know it's valid because we constructed it from a pattern that matches the type
                  const typedOpacityState = customOpacityState as `opacity-${string}`;
                  projectRectangleRenderer.updateState(
                    contentNode as SVGGElement, 
                    projectId, 
                    typedOpacityState // Use custom opacity state with proper type
                  );
                }
                // For tasks
                else {
                  const taskElement = select(`#task-${elementId}`);
                  if (!taskElement.empty()) {
                    // Apply specific opacity directly to the element
                    // Apply the exact opacity directly to ensure graduated values (0.5, 0.25, 0.125) are preserved
                    // First apply with standard D3 methods for type safety
                    taskElement.style('opacity', opacity.toString());
                    
                    // Set data attributes for CSS targeting
                    taskElement.attr('data-opacity', opacity.toString());
                    // IMPORTANT: Use the custom opacity state (not "semi-transparent") to avoid CSS overrides
                    taskElement.attr('data-state', elementState);
                    
                    // Set CSS variable for use in stylesheets
                    taskElement.style('--exact-opacity', opacity.toString());
                    
                    // Try direct DOM manipulation for more forceful override if node is accessible
                    const taskNode = taskElement.node();
                    if (taskNode && (taskNode instanceof SVGElement || taskNode instanceof HTMLElement)) {
                      taskNode.style.setProperty('opacity', opacity.toString(), 'important');
                    }
                    
                    // Also apply opacity directly to the rectangle
                    const taskRect = taskElement.select('rect');
                    if (!taskRect.empty()) {
                      // Apply with D3 style method
                      taskRect.style('opacity', opacity.toString());
                      taskRect.style('fill-opacity', opacity.toString());
                      
                      // Try direct DOM manipulation if possible
                      const rectNode = taskRect.node();
                      if (rectNode && (rectNode instanceof SVGElement || rectNode instanceof HTMLElement)) {
                        rectNode.style.setProperty('opacity', opacity.toString(), 'important');
                        rectNode.style.setProperty('fill-opacity', opacity.toString(), 'important');
                      }
                    }
                    
                    // Log for debugging
                    logger.debug('Applied graduated opacity to task element', {
                      taskId: elementId,
                      opacity,
                      state: customOpacityState
                    }, 'state-coordinator opacity');
                    
                    // Apply the same opacity to any associated controls
                    const controls = document.querySelectorAll(`.task-control-${elementId}, .task-split-button[data-task-id="${elementId}"]`);
                    controls.forEach(control =>{
                      if (control instanceof HTMLElement || control instanceof SVGElement) {
                        // Force immediate opacity application with !important
                        control.style.setProperty('opacity', opacity.toString(), 'important');
                        control.setAttribute('data-opacity', opacity.toString());
                        control.setAttribute('data-state', customOpacityState);
                      }
                    });
                    
                    logger.debug('Applied graduated opacity to controls', {
                      taskId: elementId,
                      opacity,
                      state: customOpacityState,
                      controlsUpdated: controls.length
                    }, 'state-coordinator opacity');
                  }
                }
                
                // CRITICAL: Update connection opacity for this element with high priority
                const connectionsLayer = select('.layer-connections');
                if (!connectionsLayer.empty()) {
                  // First try to find connections with data-source-id attribute
                  const sourceConnections = connectionsLayer.selectAll(`.connection-group[data-source-id="${elementId}"]`);
                  
                  if (!sourceConnections.empty()) {
                    sourceConnections.each(function() {
                      const connectionGroup = select(this);
                      // Force immediate opacity application with !important
                      connectionGroup.style('opacity', opacity.toString());
                      connectionGroup.attr('data-opacity', opacity.toString());
                      connectionGroup.attr('data-state', customOpacityState);
                      
                      logger.debug('Applied opacity to connection via source-id', {
                        connectionId: connectionGroup.attr('id'),
                        sourceId: elementId,
                        opacity,
                        state: customOpacityState
                      }, 'connection-opacity');
                    });
                  } else {
                    // Fallback to ID-based matching if no data-source-id found
                    connectionsLayer.selectAll(`.connection-group`).each(function() {
                      const connectionGroup = select(this);
                      const connectionId = connectionGroup.attr('id') || '';
                      
                      // Check if this connection is related to the current element
                      if (connectionId.includes(elementId)) {
                        // Add data-source-id attribute for future lookups
                        connectionGroup.attr('data-source-id', elementId);
                        
                        // Force immediate opacity application
                        // Apply with D3 style method first (type-safe)
                        connectionGroup.style('opacity', opacity.toString());
                        
                        // Set data attributes for CSS targeting
                        connectionGroup.attr('data-opacity', opacity.toString());
                        connectionGroup.attr('data-state', customOpacityState);
                        
                        // Set CSS variable for stylesheet use
                        connectionGroup.style('--exact-opacity', opacity.toString());
                        
                        // Try direct DOM manipulation if possible for stronger override
                        const connNode = connectionGroup.node();
                        if (connNode && (connNode instanceof SVGElement || connNode instanceof HTMLElement)) {
                          connNode.style.setProperty('opacity', opacity.toString(), 'important');
                        }
                        
                        logger.debug('Applied opacity to connection via ID match', {
                          connectionId,
                          elementId,
                          opacity,
                          state: customOpacityState
                        }, 'connection-opacity');
                      }
                    });
                  }
                  
                  // Also use the connection drawer's method for consistent opacity application
                  connectionDrawer.updateConnectionOpacity(
                    connectionsLayer as unknown as Selection<SVGGElement, unknown, null, undefined>,
                    elementId, 
                    opacity,
                    false // disable animation for immediate effect
                  );
                  
                  logger.debug('Updated connection opacity through drawer', {
                    elementId,
                    opacity,
                    state: customOpacityState
                  }, 'state-coordinator opacity');
                }}catch (error) {
                  logger.error('Error applying graduated opacity', {
                    elementId,
                    opacity,
                    error
                  }, 'state-coordinator error');
                }
              }
            }
          });
        } else {
          // Fallback to traditional binary opacity
          const contentNode = select('.layer-content').node();
          if (contentNode) {
            projectRectangleRenderer.updateState(
              contentNode as SVGGElement, 
              projectId, 
              projectState
            );
            
            // Update project connection opacity
            const connectionsLayer = select('.layer-connections');
            if (!connectionsLayer.empty()) {
              connectionDrawer.updateConnectionOpacity(
                connectionsLayer as unknown as Selection<SVGGElement, unknown, null, undefined>,
                projectId, 
                projectState === 'active' ? 1 : 0.5
              );
            }
          }
        }
      }
    } catch (error) {
      logger.error('Failed to apply task hierarchy', {
        taskId,
        error
      }, 'state-coordinator error');
    }
  }

  /**
   * Apply project hierarchy without centering
   * Used for events to prevent duplicate centering operations
   */
  private applyProjectHierarchy(projectId: string): void {
    const state = workspaceStateManager.getState();
    
    if (!state.selectedProject || state.selectedProject._id.toString() !== projectId) {
      logger.warn('Project not selected or ID mismatch', {}, 'state-coordinator project');
      return;
    }
    
    try {
      // Set as current selection
      this.selectedTaskRef = projectId;
      
      // Reset control layer for clean state
      const layers = svgController.getLayers();
      if (layers?.controls) {
        layers.controls.resetControlVisibility();
        overlapDetector.clearControls();
      }
      
      controlVisibilityManager.reset();
      
      // Calculate hierarchy states
      const hierarchy = taskHierarchyManager.calculateProjectHierarchy(projectId, {
        tasks: state.tasks,
        projectId
      });
      
      // Apply hierarchy to workspace state
      taskHierarchyManager.applyHierarchy(hierarchy);
      
      // Only use setTimeout in browser environment
      if (isBrowser) {
        setTimeout(() => {
          controlVisibilityManager.forceTaskControlsVisible(hierarchy.activeTaskIds, {
            animate: true,
            duration: 200,
            delay: 50
          });
          
          // Update project visualization
          const contentNode = select('.layer-content').node();
          if (contentNode) {
            projectRectangleRenderer.updateState(
              contentNode as SVGGElement, 
              projectId, 
              'active'
            );
          }
        }, 300);
      }
    } catch (error) {
      logger.error('Failed to apply project hierarchy', {
        projectId,
        error
      }, 'state-coordinator error');
    }
  }

  /**
   * Handle task selection state change with centering
   * This should only be called directly from click handlers,
   * not from event propagation, to prevent duplicate centering
   */
  public handleTaskSelection(taskId: string, rect?: DOMRect, options: StateTransitionOptions = {}): void {
    if (!isBrowser) return; // Skip this method during SSR
    
    const state = workspaceStateManager.getState();
    
    if (!state.selectedProject) {
      logger.warn('No project selected, cannot handle task selection', {}, 'state-coordinator task');
      return;
    }
    
    // Check for direct click flag on document body
    const hasDirectClickFlag = document.body.getAttribute('data-direct-click-in-progress') === taskId;
    const isDirectClick = options.directClick === true || hasDirectClickFlag;
    
    logger.info('Handling task selection', {
      taskId,
      previousSelection: this.selectedTaskRef,
      projectId: state.selectedProject._id.toString(),
      isDirectClick,
      hasDirectClickFlag,
      hasRect: !!rect,
      _style: 'background-color: #FF9800; color: white; padding: 2px 5px; border-radius: 3px;'
    }, 'state-coordinator task');
    
    try {
      // Set as current selection
      this.selectedTaskRef = taskId;
      
      // Emit event to reset common controls
      window.dispatchEvent(new CustomEvent('reset-common-controls'));
      
      // Reset control layer for clean state
      if (options.resetControls !== false) {
        const layers = svgController.getLayers();
        if (layers?.controls) {
          layers.controls.resetControlVisibility();
          overlapDetector.clearControls();
        }
        
        controlVisibilityManager.reset();
      }
      
      // Calculate hierarchy states
      const hierarchy = taskHierarchyManager.calculateTaskHierarchy(taskId, {
        tasks: state.tasks,
        projectId: state.selectedProject._id.toString()
      });
      
      // Apply hierarchy to workspace state
      taskHierarchyManager.applyHierarchy(hierarchy);
      
      // Check for direct click flag on document body
      const hasDirectClickFlag = document.body.getAttribute('data-direct-click-in-progress') === taskId;
      const isDirectClick = options.directClick === true || hasDirectClickFlag;
      
      // Center viewport if requested and this was triggered by a direct user click
      if (options.centerViewport !== false && isDirectClick) {
        if (rect) {
          // Use the centralized centering utility with the provided rectangle
          centerOnElement(rect, { taskId, directClick: true });
        } else {
          // Use the ID-based centering method if no rectangle is provided
          centerOnTaskById(taskId, { directClick: true });
        }
      }
      
      // Force visibility for active task controls
      setTimeout(() => {
        controlVisibilityManager.forceTaskControlsVisible(hierarchy.activeTaskIds, {
          animate: true,
          duration: 200,
          delay: 50
        });
        
        // Animate connections for selected task
        if (options.animateConnections !== false) {
          const layers = svgController.getLayers();
          if (layers?.connections) {
            connectionDrawer.reanimateConnections(layers.connections, taskId);
          }
        }
      }, 300);
      
      // Ensure project state is updated
      if (state.selectedProject) {
        const projectId = state.selectedProject._id.toString();
        const projectState = hierarchy.states.get(projectId) || 'semi-transparent';
        
        // Update project visualization
        const contentNode = select('.layer-content').node();
        if (contentNode) {
          projectRectangleRenderer.updateState(
            contentNode as SVGGElement, 
            projectId, 
            projectState
          );
          
          // Update project connection opacity
          const connectionsLayer = select('.layer-connections');
          if (!connectionsLayer.empty()) {
            connectionDrawer.updateConnectionOpacity(
              connectionsLayer as unknown as Selection<SVGGElement, unknown, null, undefined>,
              projectId, 
              projectState === 'active' ? 1 : 0.5
            );
          }
        }
      }
      
      // Dispatch task selection event to trigger state saving
      window.dispatchEvent(new CustomEvent('task-selected', {
        detail: {
          taskId,
          projectId: state.selectedProject._id.toString(),
          timestamp: Date.now()
        }
      }));
    } catch (error) {
      logger.error('Failed to handle task selection', {
        taskId,
        error
      }, 'state-coordinator error');
    }
  }

  /**
   * Handle project selection state change with centering
   * This should only be called directly from click handlers,
   * not from event propagation, to prevent duplicate centering
   */
  public handleProjectSelection(projectId: string, rect?: DOMRect, options: StateTransitionOptions = {}): void {
    if (!isBrowser) return; // Skip this method during SSR
    
    const state = workspaceStateManager.getState();
    
    if (!state.selectedProject || state.selectedProject._id.toString() !== projectId) {
      logger.warn('Project not selected or ID mismatch', {}, 'state-coordinator project');
      return;
    }
    
    // Check for direct click flag on document body
    const hasDirectClickFlag = document.body.getAttribute('data-direct-click-in-progress') === projectId;
    const isDirectClick = options.directClick === true || hasDirectClickFlag;
    
    logger.info('Handling project selection', {
      projectId,
      previousSelection: this.selectedTaskRef,
      hasRect: !!rect,
      isDirectClick,
      hasDirectClickFlag,
      _style: 'background-color: #9C27B0; color: white; padding: 2px 5px; border-radius: 3px;'
    }, 'state-coordinator project');
    
    try {
      // Set as current selection
      this.selectedTaskRef = projectId;
      
      // Reset control layer for clean state
      if (options.resetControls !== false) {
        const layers = svgController.getLayers();
        if (layers?.controls) {
          layers.controls.resetControlVisibility();
          overlapDetector.clearControls();
        }
        
        controlVisibilityManager.reset();
      }
      
      // Calculate hierarchy states
      const hierarchy = taskHierarchyManager.calculateProjectHierarchy(projectId, {
        tasks: state.tasks,
        projectId
      });
      
      // Apply hierarchy to workspace state
      taskHierarchyManager.applyHierarchy(hierarchy);
      
      // Check for direct click flag on document body
      const hasDirectClickFlag = document.body.getAttribute('data-direct-click-in-progress') === projectId;
      const isDirectClick = options.directClick === true || hasDirectClickFlag;
      
      // Center viewport on project if centering not disabled and this was a direct click
      if (options.centerViewport !== false && isDirectClick) {
        if (rect) {
          // Use the centralized centering utility with the provided rectangle
          centerOnElement(rect, { projectId, directClick: true });
        } else {
          // Use the ID-based centering method if no rectangle is provided
          centerOnProjectById(projectId, { directClick: true });
        }
      }
      
      // Force visibility for first-level task controls
      setTimeout(() => {
        controlVisibilityManager.forceTaskControlsVisible(hierarchy.activeTaskIds, {
          animate: true,
          duration: 200,
          delay: 50
        });
        
        // Update project visualization
        const contentNode = select('.layer-content').node();
        if (contentNode) {
          projectRectangleRenderer.updateState(
            contentNode as SVGGElement, 
            projectId, 
            'active'
          );
        }
        
        // Dispatch project selection event to trigger state saving
        window.dispatchEvent(new CustomEvent('project-selected', {
          detail: {
            projectId,
            timestamp: Date.now()
          }
        }));
      }, 300);
    } catch (error) {
      logger.error('Failed to handle project selection', {
        projectId,
        error
      }, 'state-coordinator error');
    }
  }

  /**
   * Get currently selected task or project ID
   */
  public getSelectedElementId(): string | null {
    return this.selectedTaskRef;
  }

  /**
   * Check if a split operation is in progress
   */
  public isSplitInProgress(): boolean {
    return this.splitCompletedRef;
  }
}

export const taskStateCoordinator = TaskStateCoordinator.getInstance();

// Only add event listeners in browser environment
if (isBrowser) {
  // Central task deletion handler - coordinates all cleanup and navigation
  window.addEventListener('task-deleted', ((event: CustomEvent) => {
    const detail = event.detail;
    if (detail?.taskId) {
      logger.info('Task deleted event received', { 
        taskId: detail.taskId,
        parentId: detail.parentId,
        projectId: detail.projectId
      }, 'state-coordinator deletion');
      
      try {
        // First remove any lingering operation classes - do this immediately
        document.body.classList.remove('deletion-in-progress');
        document.body.classList.remove('mode-delete');
        document.body.classList.remove('mode-regenerate');
        document.body.classList.remove('controls-disabled');
        
        // STEP 1: Collapse common controls panel
        try {
          // Dispatch event to reset common controls UI
          window.dispatchEvent(new CustomEvent('reset-common-controls'));
          
          // Double check that mode classes are removed from body
          document.body.classList.remove('mode-delete');
          document.body.classList.remove('mode-regenerate');
        } catch (controlsError) {
          logger.warn('Error resetting common controls', { 
            error: controlsError instanceof Error ? controlsError.message : String(controlsError)
          }, 'state-coordinator error');
          // Continue despite errors
        }
        
        // STEP 2: Find and remove any remaining controls for this task
        try {
          // Look for all elements related to this task and remove them
          const selectors = [
            `#task-${detail.taskId}`,
            `.task-control-${detail.taskId}`,
            `[data-task-id="${detail.taskId}"]`,
            `.regenerate-control[data-task-id="${detail.taskId}"]`,
            `.delete-control[data-task-id="${detail.taskId}"]`,
            `.connection-group[id*="${detail.taskId}"]`,
            `path[id*="${detail.taskId}"]`,
            `.connection-line[id*="${detail.taskId}"]`,
            `.connection-marker[id*="${detail.taskId}"]`,
            `.task-split-button[data-task-id="${detail.taskId}"]`
          ];
          
          // Remove all elements matching any selector
          selectors.forEach(selector => {
            document.querySelectorAll(selector).forEach(element => {
              if (element.parentNode) {
                element.parentNode.removeChild(element);
                // Get class name, handling different element types
                let classNameStr = '';
                if (element instanceof SVGElement) {
                  // For SVG elements
                  classNameStr = element.getAttribute('class') || '';
                } else {
                  // For HTML elements
                  classNameStr = typeof element.className === 'string' ? element.className : '';
                }
                
                logger.debug('Removed remaining element', { 
                  selector,
                  id: element.id || 'no-id',
                  className: classNameStr
                }, 'state-coordinator cleanup');
              }
            });
          });
        } catch (cleanupError) {
          logger.warn('Error cleaning up remaining elements', { 
            error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
          }, 'state-coordinator error');
          // Continue despite errors
        }
        
        // STEP 3: Ensure all delete controls are removed and split buttons are shown
        try {
          // Remove any delete controls
          document.querySelectorAll('.delete-control, .regenerate-control').forEach(element => {
            if (element.parentNode) {
              element.parentNode.removeChild(element);
            }
          });
          
          // Reset all split button visibility
          document.querySelectorAll('.task-split-button').forEach(control => {
            if (control instanceof HTMLElement || control instanceof SVGElement) {
              control.style.removeProperty('display');
              control.style.removeProperty('visibility');
              control.style.removeProperty('opacity');
              control.style.display = '';
              control.style.visibility = 'visible';
              control.style.opacity = '1';
            }
          });
        } catch (controlError) {
          logger.warn('Error resetting control visibility', { 
            error: controlError instanceof Error ? controlError.message : String(controlError)
          }, 'state-coordinator error');
          // Continue despite errors
        }
        
        // STEP 4: Reset control layers and overlap detection
        try {
          // Reset control visibility
          const layers = svgController.getLayers();
          if (layers?.controls) {
            layers.controls.resetControlVisibility();
            overlapDetector.clearControls();
          }
          
          controlVisibilityManager.reset();
        } catch (layerError) {
          logger.warn('Error resetting control layers', { 
            error: layerError instanceof Error ? layerError.message : String(layerError)
          }, 'state-coordinator error');
          // Continue despite errors
        }
        
        // STEP 5: Navigate to parent if the deleted task was selected
        const coordinator = getInstance();
        if (detail.taskId === coordinator.getSelectedElementId()) {
          logger.info('Navigating after task deletion', {
            from: detail.taskId,
            to: detail.parentId || detail.projectId,
            type: detail.parentId ? 'task' : 'project'
          }, 'state-coordinator navigation');
          
          // Navigate to parent if available or to project
          if (detail.parentId) {
            // Allow a moment for DOM updates to complete
            setTimeout(() => {
              coordinator.handleTaskSelection(detail.parentId, undefined, {
                centerViewport: true,
                animateConnections: true
              });
            }, 100);
          } else if (detail.projectId) {
            // Allow a moment for DOM updates to complete
            setTimeout(() => {
              coordinator.handleProjectSelection(detail.projectId, undefined, {
                centerViewport: true
              });
            }, 100);
          }
        }
        
        // STEP 6: Final workspace refresh to ensure consistent state
        setTimeout(() => {
          // Remove any lingering operation classes again as final cleanup
          document.body.classList.remove('deletion-in-progress');
          document.body.classList.remove('mode-delete');
          document.body.classList.remove('mode-regenerate');
          document.body.classList.remove('controls-disabled');
          
          // Force visibility update for controls
          controlVisibilityManager.updateVisibility();
          
          // Dispatch a refresh event to update the workspace
          window.dispatchEvent(new CustomEvent('refresh-workspace'));
          
          logger.info('Task deletion cleanup complete', { 
            taskId: detail.taskId
          }, 'state-coordinator cleanup');
        }, 300);
      } catch (error) {
        logger.error('Error in task deletion event handler', {
          taskId: detail.taskId,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        }, 'state-coordinator error');
        
        // As a final resort, try to return to a stable state
        try {
          // Remove all operation classes
          document.body.classList.remove('deletion-in-progress', 'mode-delete', 'mode-regenerate', 'controls-disabled');
          
          // Try to force navigation to project
          if (detail.projectId) {
            getInstance().handleProjectSelection(detail.projectId);
          }
        } catch (finalError) {
          // At this point we just have to hope the UI will recover on next interaction
          logger.error('Fatal error in task deletion cleanup', {
            error: finalError
          }, 'state-coordinator error');
        }
      }
    }
  }) as EventListener);
}

// Function to get the coordinator instance - helper for event handlers
function getInstance(): TaskStateCoordinator {
  return TaskStateCoordinator.getInstance();
}
