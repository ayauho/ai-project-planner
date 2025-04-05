'use client';

import { logger } from '@/lib/client/logger';
import { select } from 'd3-selection';
import { overlapDetector } from '@/components/workspace/visual/utils/overlap-detector';
import { workspaceStateManager } from '@/lib/workspace/state/manager';
import { TaskVisualState } from '@/lib/workspace/state/types';
import { isStateBeingRestored } from '@/app/preload-state';

export interface ControlVisibilityOptions {
  forceVisible?: boolean;
  animate?: boolean;
  duration?: number;
  delay?: number;
}

interface ControlEntry {
  id: string;
  taskId: string;
  element: Element | null;
  state: TaskVisualState;
}

class ControlVisibilityManager {
  private static instance: ControlVisibilityManager;
  private controlRegistry: Map<string, ControlEntry> = new Map();
  private activeControlIds: Set<string> = new Set();
  private pendingUpdate: boolean = false;
  private updateThrottleDelay: number = 50; // ms
  private lastUpdateTimestamp: number = 0;

  private constructor() {
    // Set up mutation observer to detect DOM changes related to controls
    if (typeof window !== 'undefined' && typeof MutationObserver !== 'undefined') {
      this.setupMutationObserver();
    }
  }

  public static getInstance(): ControlVisibilityManager {
    if (!ControlVisibilityManager.instance) {
      ControlVisibilityManager.instance = new ControlVisibilityManager();
    }
    return ControlVisibilityManager.instance;
  }

  /**
   * Set up mutation observer to detect DOM changes
   */
  private setupMutationObserver(): void {
    try {
      const observer = new MutationObserver(this.handleDomMutations.bind(this));
      
      // Add listeners for side panel state changes
      if (typeof window !== 'undefined') {
        // Add global property to block processing
        (window as any).blockAllProcessing = false;
        
        // Only listen for side-panel-state-change events
        window.addEventListener('side-panel-state-change', (event: Event) => {
          const customEvent = event as CustomEvent;
          // Check if event has doNotProcess flag
          if (customEvent.detail?.doNotProcess) {
            logger.debug('Skipping processing for side panel state change with doNotProcess flag', {}, 'controls visibility optimization');
            return;
          }
        });
        
        // Remove the post-transition update to prevent blinking
        // Note: We're deliberately NOT triggering any visibility updates when panel transitions complete
      }
      
      // Start observing after a delay to ensure DOM is ready
      setTimeout(() => {
        const workspace = document.querySelector('.workspace-visual');
        if (workspace && !document.body.classList.contains('side-panel-transitioning')) {
          observer.observe(workspace, { 
            childList: true,
            subtree: true,
            attributeFilter: ['transform', 'style', 'class', 'visibility', 'opacity', 'data-level']
          });
          
          logger.debug('Mutation observer for control visibility started', {
            _path: true
          }, 'controls visibility');
          
          // Register with custom event system for controls rendering - only if not transitioning
          window.addEventListener('control-rendered', (event) => {
            // Skip ALL processing if global block is active
            if ((window as any).blockAllProcessing) {
              return;
            }
            this.handleControlRendered(event);
          });
          
          window.addEventListener('rectangle-rendered', (event) => {
            // Skip ALL processing if global block is active
            if ((window as any).blockAllProcessing) {
              return;
            }
            this.handleRectangleRendered(event);
          });
        }
      }, 1000);
    } catch (error) {
      logger.error('Failed to set up mutation observer', { 
        _path: true,
        error 
      }, 'controls visibility error');
    }
  }

  /**
   * Handle control rendered events
   */
  private handleControlRendered(event: Event): void {
    // Skip if we're already pending an update or during state restoration
    if (this.pendingUpdate || isStateBeingRestored()) return;
    
    // Skip during side panel transitions
    if (document.body.classList.contains('side-panel-transitioning')) {
      return;
    }
    
    try {
      const customEvent = event as CustomEvent;
      const detail = customEvent.detail || {};
      
      logger.debug('Control rendered event received', {
        _path: true,
        controlId: detail.id,
        level: detail.level || 'unknown'
      }, 'controls visibility');
      
      // Schedule visibility update
      this.throttledUpdateVisibility();
    } catch (error) {
      logger.error('Error handling control render event', { 
        _path: true,
        error 
      }, 'controls visibility error');
    }
  }
  
  /**
   * Handle rectangle rendered events
   */
  private handleRectangleRendered(event: Event): void {
    // Skip if we're already pending an update or during state restoration
    if (this.pendingUpdate || isStateBeingRestored()) return;
    
    // Skip during side panel transitions
    if (document.body.classList.contains('side-panel-transitioning')) {
      return;
    }
    
    try {
      const customEvent = event as CustomEvent;
      const detail = customEvent.detail || {};
      
      logger.debug('Rectangle rendered event received', {
        _path: true,
        rectId: detail.id,
        level: detail.level || 'unknown'
      }, 'controls visibility');
      
      // Schedule visibility update
      this.throttledUpdateVisibility();
    } catch (error) {
      logger.error('Error handling rectangle render event', { 
        _path: true,
        error 
      }, 'controls visibility error');
    }
  }

  /**
   * Handle DOM mutations to trigger visibility updates efficiently
   */
  private handleDomMutations(mutations: MutationRecord[]): void {
    // Skip if we're already pending an update or during state restoration
    if (this.pendingUpdate || isStateBeingRestored()) return;
    
    // Skip during side panel transitions
    if (document.body.classList.contains('side-panel-transitioning')) {
      return;
    }
    
    // Check if any of the mutations are related to controls or task elements
    const relevantMutation = mutations.some(mutation => {
      if (!mutation.target) return false;
      
      const targetEl = mutation.target as Element;
      
      // Skip mutations related to side panel
      if (targetEl.closest('[data-side-panel="true"]') || 
          targetEl.getAttribute('data-side-panel') === 'true' ||
          (targetEl.className && targetEl.className.toString().includes('side-panel'))) {
        return false;
      }
      
      const className = targetEl.className?.toString() || '';
      
      // Check for relevant class names
      const hasRelevantClass = (
        className.includes('task-rect') ||
        className.includes('task-control') ||
        className.includes('project-counter') ||
        className.includes('counter-display') ||
        className.includes('layer-controls') ||
        className.includes('layer-content')
      );
      
      // Check for relevant attributes
      const hasRelevantAttribute = (
        targetEl.getAttribute('data-project-counter') === 'true' ||
        targetEl.getAttribute('data-task-id') !== null ||
        targetEl.getAttribute('data-level') !== null
      );
      
      // Check if the mutation is for a relevant attribute
      const isRelevantAttributeMutation = (
        mutation.type === 'attributes' && 
        ['transform', 'style', 'class', 'visibility', 'opacity', 'data-level'].includes(mutation.attributeName || '')
      );
      
      return hasRelevantClass || hasRelevantAttribute || isRelevantAttributeMutation;
    });
    
    if (relevantMutation) {
      logger.debug('Relevant DOM mutation detected for visibility update', {
        _path: true,
        mutationCount: mutations.length
      }, 'controls visibility');
      
      this.throttledUpdateVisibility();
    }
  }

  /**
   * Throttled update to prevent too frequent visibility checks
   */
  private throttledUpdateVisibility(): void {
    // Skip if an update is already pending or during state restoration
    if (this.pendingUpdate || isStateBeingRestored()) return;
    
    // Skip during side panel transitions
    if (document.body.classList.contains('side-panel-transitioning')) {
      logger.debug('Skipping throttled visibility update during side panel transition', {}, 'controls visibility optimization');
      return;
    }
    
    // Skip ALL processing if global block is active
    if ((window as any).blockAllProcessing) {
      logger.debug('Skipping throttled update due to global processing block', {}, 'controls visibility optimization');
      return;
    }
    
    // Skip processing if we're in side panel state change
    if (document.body.hasAttribute('data-side-panel-state-changing')) {
      logger.debug('Skipping throttled update during side panel state change', {}, 'controls visibility optimization');
      return;
    }
    
    // Add even more throttling - check if any visibility updates have happened in the last second
    const now = Date.now();
    const timeSinceLastUpdate = now - this.lastUpdateTimestamp;
    
    // If last update was very recent, add significant delay to batch updates
    if (timeSinceLastUpdate < 1000) { 
      // Schedule update for later with a minimum 1 second delay
      this.pendingUpdate = true;
      setTimeout(() => {
        // Multiple checks before allowing update
        if (document.body.classList.contains('side-panel-transitioning') || 
            (window as any).blockAllProcessing ||
            document.body.hasAttribute('data-side-panel-state-changing')) {
          this.pendingUpdate = false;
          logger.debug('Cancelling scheduled visibility update - side panel operations in progress', {}, 'controls visibility optimization');
          return;
        }
        
        this.pendingUpdate = false;
        this.lastUpdateTimestamp = Date.now();
        this.updateVisibility();
      }, Math.max(1000, this.updateThrottleDelay - timeSinceLastUpdate + 50)); // Minimum 1 second delay
    } else if (timeSinceLastUpdate < this.updateThrottleDelay) {
      // Standard scheduling with smaller delay
      this.pendingUpdate = true;
      setTimeout(() => {
        // Multiple checks before allowing update
        if (document.body.classList.contains('side-panel-transitioning') || 
            (window as any).blockAllProcessing ||
            document.body.hasAttribute('data-side-panel-state-changing')) {
          this.pendingUpdate = false;
          logger.debug('Cancelling scheduled visibility update - side panel operations in progress', {}, 'controls visibility optimization');
          return;
        }
        
        this.pendingUpdate = false;
        this.lastUpdateTimestamp = Date.now();
        this.updateVisibility();
      }, this.updateThrottleDelay - timeSinceLastUpdate + 50); // Add small buffer
    } else {
      // Final check before immediate update
      if (document.body.classList.contains('side-panel-transitioning') || 
          (window as any).blockAllProcessing ||
          document.body.hasAttribute('data-side-panel-state-changing')) {
        logger.debug('Skipping immediate visibility update - side panel operations in progress', {}, 'controls visibility optimization');
        return;
      }
      
      // Update immediately
      this.lastUpdateTimestamp = now;
      this.updateVisibility();
    }
  }

  /**
   * Register a control with the visibility manager
   */
  public registerControl(controlId: string, taskId: string, element: Element | null): void {
    try {
      // Skip during state restoration
      if (isStateBeingRestored()) return;
      
      const state = workspaceStateManager.getState().taskVisualStates.get(taskId) || 'active';

      this.controlRegistry.set(controlId, {
        id: controlId,
        taskId,
        element,
        state
      });

      logger.debug('Control registered with visibility manager', {
        controlId,
        taskId,
        state
      }, 'controls visibility registration');
      
      // Schedule visibility update after registration
      this.throttledUpdateVisibility();
    } catch (error) {
      logger.error('Failed to register control', {
        controlId,
        taskId,
        error
      }, 'controls visibility error');
    }
  }

  /**
   * Unregister a control
   */
  public unregisterControl(controlId: string): void {
    this.controlRegistry.delete(controlId);
    this.activeControlIds.delete(controlId);
  }

  /**
   * Reset all control registrations
   */
  public reset(): void {
    logger.info('Resetting control visibility manager', {}, 'controls visibility');
    this.controlRegistry.clear();
    this.activeControlIds.clear();
    overlapDetector.clearControls();
  }

  /**
   * Force visibility for specific controls by ID
   */
  public forceControlsVisible(controlIds: string[], options: ControlVisibilityOptions = {}): void {
    try {
      // Skip during state restoration
      if (isStateBeingRestored()) return;
      
      logger.debug('Forcing controls visible', {
        controlCount: controlIds.length,
        options
      }, 'controls visibility');

      controlIds.forEach(controlId => {
        const control = this.controlRegistry.get(controlId);
        if (!control) return;

        // Find the DOM element if not already stored
        let element = control.element;
        if (!element) {
          element = document.querySelector(`.${controlId}`);
          if (element) {
            control.element = element;
          }
        }

        if (element) {
          // Use d3-selection for animations if requested
          if (options.animate) {
            select(element)
              .transition()
              .duration(options.duration || 200)
              .delay(options.delay || 0)
              .style('visibility', 'visible')
              .style('display', 'block')
              .style('opacity', control.state === 'semi-transparent' ? 0.5 : 1);
          } else {
            // Direct style setting for immediate visibility
            (element as HTMLElement).style.visibility = 'visible';
            (element as HTMLElement).style.display = 'block';
            (element as HTMLElement).style.opacity = control.state === 'semi-transparent' ? '0.5' : '1';
          }

          // Track which controls are currently forced visible
          this.activeControlIds.add(controlId);
        }
      });
    } catch (error) {
      logger.error('Failed to force controls visible', {
        controlIds,
        error
      }, 'controls visibility error');
    }
  }

  /**
   * Force visibility for controls associated with specific tasks
   */
  public forceTaskControlsVisible(taskIds: string[], options: ControlVisibilityOptions = {}): void {
    try {
      // Skip during state restoration
      if (isStateBeingRestored()) return;
      
      // Find all controls associated with the given tasks
      const controlIds: string[] = [];

      this.controlRegistry.forEach((control, controlId) => {
        if (taskIds.includes(control.taskId)) {
          controlIds.push(controlId);
        }
      });

      if (controlIds.length > 0) {
        logger.debug('Forcing task controls visible', {
          taskIds: taskIds.length,
          controlIds: controlIds.length
        }, 'controls visibility');
        this.forceControlsVisible(controlIds, options);
      } else {
        logger.debug('No controls found for the specified tasks', {
          taskIds
        }, 'controls visibility');
        
        // Try to recreate controls if none found
        taskIds.forEach(taskId => {
          const element = document.querySelector(`.task-control-${taskId}`);
          if (element) {
            const controlId = `task-control-${taskId}`;
            this.registerControl(controlId, taskId, element);
            controlIds.push(controlId);
            logger.debug('Recreated missing control registration', { taskId }, 'controls visibility');
          }
        });
        
        // Force visibility for any found controls
        if (controlIds.length > 0) {
          this.forceControlsVisible(controlIds, options);
        }
      }
    } catch (error) {
      logger.error('Failed to force task controls visible', {
        taskIds,
        error
      }, 'controls visibility error');
    }
  }

  /**
   * Update the visibility of all registered controls based on overlap detection
   */
  updateVisibility(): void {
    try {
      // Skip during state restoration
      if (isStateBeingRestored()) return;
      
      // Skip during side panel transitions
      if (document.body.classList.contains('side-panel-transitioning')) {
        logger.debug('Skipping control visibility processing during side panel transition', {}, 'controls visibility optimization');
        return;
      }
      
      // Skip ALL processing if global block is active
      if ((window as any).blockAllProcessing) {
        logger.debug('Skipping control visibility due to global processing block', {}, 'controls visibility optimization');
        return;
      }
      
      // Skip processing if we're in side panel state change
      if (document.body.hasAttribute('data-side-panel-state-changing')) {
        logger.debug('Skipping control visibility during side panel state change', {}, 'controls visibility optimization');
        return;
      }
      
      // Log that we're starting visibility update - only once per batch
      if (!this.pendingUpdate) {
        logger.debug('Starting control visibility update', {
          _path: true, 
          timestamp: Date.now()
        }, 'controls visibility');
      }
      
      // Get visibility map from overlap detector - if it returns false, skip further processing
      const visibilityMap = overlapDetector.detectOverlaps();
      if (!visibilityMap) {
        logger.debug('Overlap detection skipped or returned empty result', {}, 'controls visibility optimization');
        return;
      }

      // Get current workspace state (with safety check)
      const workspaceState = workspaceStateManager.getState();
      if (!workspaceState || !workspaceState.taskVisualStates) {
        logger.warn('Workspace state or taskVisualStates not available', {
          _path: true,
          hasState: !!workspaceState,
          hasTaskStates: !!(workspaceState && workspaceState.taskVisualStates)
        }, 'controls visibility warning');
        return;
      }
      
      // Collect visibility changes for logging
      const visibilityChanges: Record<string, {
        taskId: string;
        prevVisible?: boolean;
        newVisible: boolean;
        state?: string;
        level?: string | undefined;
        reason: string;
      }> = {};
      
      // Process each control in a try-catch to prevent one error from stopping all updates
      const controlEntries = Array.from(this.controlRegistry.entries());
      for (const [controlId, control] of controlEntries) {
        try {
          // Skip forced visible controls
          if (this.activeControlIds.has(controlId)) continue;
  
          // Find element if not already stored
          let element = control.element;
          if (!element) {
            element = document.querySelector(`.${controlId}`);
            if (element) {
              control.element = element;
            } else {
              // Skip controls that don't exist in the DOM
              continue;
            }
          }
  
          // Skip if element is no longer in the DOM
          if (!element.isConnected) {
            // Remove from registry
            this.controlRegistry.delete(controlId);
            continue;
          }
  
          // Get task state
          const taskState = workspaceState.taskVisualStates.get(control.taskId);
          
          // Get the DOM element level for more accurate level-based decisions
          const elementLevel = element.getAttribute('data-level') ?? undefined;
          
          // Determine visibility based on task state and overlap
          let isVisible = visibilityMap.get(controlId) || false;
          let opacity = 1;
          let visibilityReason = 'default';
          
          // Get element level for detailed logging - use a different variable name to avoid conflicts
          const controlElementLevel = element.getAttribute('data-level');
          
          // Only log at the batch level rather than for each control
          if (this.controlRegistry.size <= 5) {
            logger.debug('Processing control visibility', {
              _path: true,
              controlId,
              taskId: control.taskId,
              initialVisibility: isVisible,
              taskState,
              controlElementLevel
            }, 'controls visibility');
          }
  
          if (taskState === 'hidden') {
            isVisible = false;
            opacity = 0;
            visibilityReason = 'task-hidden';
          } else if (taskState === 'active') {
            opacity = 1;
            
            // For active tasks, respect the overlap detection for project counters only
            if (controlId.startsWith('project-counter-')) {
              // Only check overlap for project counters
              isVisible = visibilityMap.get(controlId) || false;
              visibilityReason = isVisible ? 'project-counter-no-overlap' : 'project-counter-overlap';
            } else {
              // For other controls on active tasks, always show
              isVisible = true;
              visibilityReason = 'active-task-control';
            }
          } else if (taskState === 'semi-transparent') {
            opacity = 0.5;
            
            // For semi-transparent tasks, respect the overlap detection result
            isVisible = visibilityMap.get(controlId) || false;
            visibilityReason = isVisible ? 'semi-transparent-no-overlap' : 'semi-transparent-overlap';
          } else if (typeof taskState === 'string' && taskState.startsWith('opacity-')) {
            // Extract custom opacity value for graduated opacity states
            const opacityStr = taskState.replace('opacity-', '');
            const parsedOpacity = parseFloat(opacityStr);
            
            // Use the exact parsed opacity if valid, otherwise fallback to 0.5
            opacity = !isNaN(parsedOpacity) && parsedOpacity >= 0 && parsedOpacity <= 1 
              ? parsedOpacity 
              : 0.5;
              
            // For graduated opacity tasks, respect the overlap detection result
            isVisible = visibilityMap.get(controlId) || false;
            visibilityReason = isVisible ? 'graduated-opacity-no-overlap' : 'graduated-opacity-overlap';
            
            logger.debug('Using graduated opacity for control', {
              _path: true,
              controlId,
              taskId: control.taskId,
              taskState,
              parsedOpacity: opacity,
              isVisible
            }, 'controls graduated-opacity');
          }
  
          // Safe cast to HTMLElement with checks
          if (element instanceof HTMLElement) {
            // Track visibility changes for logging
            const prevVisibility = element.style.visibility === 'visible';
            if (prevVisibility !== isVisible) {
              visibilityChanges[controlId] = {
                taskId: control.taskId,
                prevVisible: prevVisibility,
                newVisible: isVisible,
                state: taskState,
                level: elementLevel,
                reason: visibilityReason
              };
            }          
            // Track special cases for detailed logging
            const isSpecificControl = controlId === 'task-control-67ea2a31c9ad3bf4b5e1b3fb';
          
            // Apply visibility directly - no transitions during overlap handling
            element.style.visibility = isVisible ? 'visible' : 'hidden';
            element.style.opacity = String(opacity);
            element.style.pointerEvents = isVisible ? 'auto' : 'none';
            
            // Set data attributes for graduated opacity
            element.setAttribute('data-opacity', String(opacity));
            element.style.setProperty('--exact-opacity', String(opacity));
            
            // Special logging for the problematic control
            if (isSpecificControl) {
              logger.info('Applying visibility to specific control', {
                _path: true,
                controlId,
                taskId: control.taskId,
                isVisible,
                opacity,
                visibilityReason,
                elementLevel,
                originalVisibility: element.style.visibility,
                appliedVisibility: isVisible ? 'visible' : 'hidden',
                domNode: element.tagName,
                classList: Array.from(element.classList),
                dataAttributes: {
                  taskId: element.getAttribute('data-task-id'),
                  level: element.getAttribute('data-level'),
                  controlType: element.getAttribute('data-control-type')
                }
              }, 'overlapping-example');
            }
            
            // Add a permanent "overlapped" class for CSS-enforced hiding
            // This ensures the element stays hidden even if other code tries to make it visible
            if (!isVisible && (visibilityReason === 'semi-transparent-overlap' || visibilityReason === 'graduated-opacity-overlap')) {
              element.classList.add('overlapped-control');
              // Also set data attribute for additional selector specificity
              element.setAttribute('data-overlapped', 'true');
            } else {
              element.classList.remove('overlapped-control');
              element.removeAttribute('data-overlapped');
            }} else if (element instanceof SVGElement) {
            // Handle SVG elements which also have style
            const svgElement = element as unknown as SVGElement & { style: CSSStyleDeclaration };
            const prevVisibility = svgElement.style.visibility === 'visible';
            
            if (prevVisibility !== isVisible) {
              visibilityChanges[controlId] = {
                taskId: control.taskId,
                prevVisible: prevVisibility,
                newVisible: isVisible,
                state: taskState,
                level: elementLevel,
                reason: visibilityReason
              };
            }
            
            svgElement.style.visibility = isVisible ? 'visible' : 'hidden';
            svgElement.style.opacity = String(opacity);
            svgElement.style.pointerEvents = isVisible ? 'auto' : 'none';
            
            // Apply overlapped class for CSS-enforced hiding for SVG elements too
            if (!isVisible && visibilityReason === 'semi-transparent-overlap') {
              svgElement.classList.add('overlapped-control');
              svgElement.setAttribute('data-overlapped', 'true');
            } else {
              svgElement.classList.remove('overlapped-control');
              svgElement.removeAttribute('data-overlapped');
            }
          }
          
          // Add data attribute for debugging
          try {
            element.setAttribute('data-overlap-checked', 'true');
            element.setAttribute('data-visibility-reason', visibilityReason);
          } catch (attrError) {
            // Some elements might not support attributes
            logger.debug('Could not set data attributes on element', {
              controlId,
              error: attrError
            }, 'controls visibility');
          }
        } catch (controlError) {
          // Log error for this specific control but continue with others
          logger.error(`Error updating control ${controlId}`, {
            _path: true,
            controlId,
            taskId: control.taskId,
            error: controlError instanceof Error ? controlError.message : String(controlError)
          }, 'controls visibility error');
        }
      }
      
      // Log visibility changes with detailed information
      if (Object.keys(visibilityChanges).length > 0) {
        logger.debug('Control visibility changes applied', {
          _path: true,
          changes: visibilityChanges,
          changedControls: Object.keys(visibilityChanges).length
        }, 'controls visibility');
      }
    } catch (error) {
      // Make sure we capture and log the full error details
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : 'No stack available';
      
      logger.error('Failed to update control visibility', { 
        _path: true,
        error: errorMessage,
        stack: errorStack,
        errorObject: String(error)
      }, 'controls visibility error');
    }
  }
}

export const controlVisibilityManager = ControlVisibilityManager.getInstance();

// Make manager available on window for access from preload-state
if (typeof window !== 'undefined') {
  // Use a slightly different approach to avoid TypeScript errors
  (window as any).controlVisibilityManager = controlVisibilityManager;
}