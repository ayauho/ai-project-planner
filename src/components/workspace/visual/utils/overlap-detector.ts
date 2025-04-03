'use client';

import { logger } from '@/lib/client/logger';
import { workspaceStateManager } from '@/lib/workspace/state/manager';
import { isStateBeingRestored } from '@/app/preload-state';

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface RegisteredElement {
  id: string;
  bounds: Bounds;
  level: number;
  linkedElement?: string;
  visible: boolean;
}

// No need to extend Window interface - using type assertion instead

class OverlapDetector {
  private static instance: OverlapDetector;
  private rectangles: Map<string, RegisteredElement> = new Map();
  private controls: Map<string, RegisteredElement> = new Map();
  private lastVisibilityMap: Map<string, boolean> = new Map();
  private lastCheckTimestamp: number = 0;
  private checkThrottleDelay: number = 100; // ms between checks
  private pendingCheck: boolean = false;
  private mutationObserver: MutationObserver | null = null;
  private renderEventHandled: boolean = false;
  private debug: boolean = false;

  private constructor() {
    // Initialize mutation observer to detect relevant DOM changes
    this.setupMutationObserver();
    
    // Add event listener for custom render events
    if (typeof window !== 'undefined') {
      window.addEventListener('element-rendered', this.handleRenderEvent.bind(this));
      window.addEventListener('control-rendered', this.handleRenderEvent.bind(this));
      window.addEventListener('rectangle-rendered', this.handleRenderEvent.bind(this));
    }
  }
  
  public static getInstance(): OverlapDetector {
    if (!OverlapDetector.instance) {
      OverlapDetector.instance = new OverlapDetector();
    }
    return OverlapDetector.instance;
  }
  
  /**
   * Set debug mode for overlap detector
   */
  public setDebug(debug: boolean): void {
    this.debug = debug;
    logger.debug('Overlap detector debug mode set', { debug }, 'overlap-detector config');
  }
  
  /**
   * Set up mutation observer to detect DOM changes related to controls and rectangles
   */
  private setupMutationObserver(): void {
    if (typeof window === 'undefined' || typeof MutationObserver === 'undefined') return;
    
    try {
      this.mutationObserver = new MutationObserver((mutations) => {
        // Skip if during state restoration
        if (isStateBeingRestored()) return;
        
        // Skip if we're already handling a render event
        if (this.renderEventHandled) return;
        
        // Check if mutations are relevant to overlap detection
        const hasRelevantMutation = mutations.some(mutation => {
          if (!mutation.target) return false;
          
          const targetEl = mutation.target as Element;
          const className = targetEl.className?.toString() || '';
          
          // Relevant classes for task rectangles and controls
          const isRectOrControl = (
            className.includes('task-rect') ||
            className.includes('task-control') ||
            className.includes('project-counter') ||
            className.includes('counter-display') ||
            targetEl.getAttribute('data-project-counter') === 'true' ||
            targetEl.getAttribute('data-task-id') ||
            targetEl.getAttribute('data-level')
          );
          
          // Relevant attribute changes
          const relevantAttributeChanged = (
            mutation.type === 'attributes' && 
            ['transform', 'visibility', 'data-level', 'style', 'class'].includes(mutation.attributeName || '')
          );
          
          return isRectOrControl || relevantAttributeChanged;
        });
        
        if (hasRelevantMutation) {
          // Debounce multiple mutations in the same frame
          if (this.debug) {
            logger.debug('Relevant DOM mutation detected', {
              _path: true,
              timestamp: Date.now()
            }, 'overlap-detector mutation');
          }
          
          this.scheduleOverlapCheck();
        }
      });
      
      // Start observing after DOM is ready
      setTimeout(() => {
        const workspace = document.querySelector('.workspace-visual');
        if (workspace && this.mutationObserver) {
          this.mutationObserver.observe(workspace, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['transform', 'style', 'class', 'visibility', 'opacity', 'data-level']
          });
          
          logger.info('Overlap detector mutation observer initialized', {
            _path: true
          }, 'overlap-detector initialization');
        }
      }, 500);
    } catch (error) {
      logger.error('Failed to set up mutation observer', { 
        _path: true,
        error 
      }, 'overlap-detector error');
    }
  }
  
  /**
   * Handle custom render events from elements
   */
  private handleRenderEvent(event: Event): void {
    // Skip if during state restoration
    if (isStateBeingRestored()) return;
    
    try {
      this.renderEventHandled = true;
      
      // Get element details from event if available
      const customEvent = event as CustomEvent;
      const elementDetails = customEvent.detail || {};
      
      if (this.debug) {
        logger.debug('Element render event received', {
          _path: true,
          eventType: event.type,
          elementId: elementDetails.id || 'unknown',
          elementType: elementDetails.type || 'unknown'
        }, 'overlap-detector events');
      }
      
      // Schedule an overlap check
      this.scheduleOverlapCheck();
      
      // Reset flag after a short delay
      setTimeout(() => {
        this.renderEventHandled = false;
      }, 50);
    } catch (error) {
      logger.error('Error handling render event', { 
        _path: true,
        error 
      }, 'overlap-detector error');
      this.renderEventHandled = false;
    }
  }
  
  /**
   * Request an overlap check without the periodic scheduling
   * This is called directly by render events
   */
  private scheduleOverlapCheck(): void {
    // Skip if already pending or during state restoration
    if (this.pendingCheck || isStateBeingRestored()) return;
    
    // Use requestAnimationFrame for better performance and synchronization with rendering
    this.pendingCheck = true;
    
    // Use requestAnimationFrame for better performance
    requestAnimationFrame(() => {
      this.pendingCheck = false;
      this.lastCheckTimestamp = Date.now();
      this.detectOverlaps();
      
      // Log that check has been completed
      logger.debug('Overlap check completed', { 
        timestamp: this.lastCheckTimestamp,
        elementsChecked: this.controls.size
      }, 'overlap-detector check');
    });
  }

  public registerRectangle(id: string, bounds: Bounds, level: number): void {
    // Validate bounds
    if (!bounds || typeof bounds.x !== 'number' || isNaN(bounds.x)) {
      logger.warn('Invalid rectangle bounds', { 
        _path: true,
        id, 
        bounds
      }, 'overlap-detector validation');
      return;
    }
    
    // Store the rectangle with its level
    this.rectangles.set(id, { id, bounds, level, visible: true });
    
    // Log registration with path tracking
    if (this.debug) {
      logger.debug('Rectangle registered', {
        _path: true,
        id,
        level,
        bounds: {
          x: bounds.x.toFixed(2),
          y: bounds.y.toFixed(2),
          width: bounds.width.toFixed(2),
          height: bounds.height.toFixed(2)
        }
      }, 'overlap-detector registration');
    }
    
    // Dispatch a custom event for rectangle rendering
    if (typeof window !== 'undefined' && !isStateBeingRestored()) {
      const event = new CustomEvent('rectangle-rendered', {
        detail: {
          id,
          type: 'rectangle',
          level
        }
      });
      window.dispatchEvent(event);
    }
    
    // Schedule immediate check after registration
    this.scheduleOverlapCheck();
  }

  public registerControl(id: string, bounds: Bounds, level: number, linkedElement: string): void {
    // Validate bounds
    if (!bounds || typeof bounds.x !== 'number' || isNaN(bounds.x)) {
      logger.warn('Invalid control bounds', { 
        _path: true,
        id, 
        bounds
      }, 'overlap-detector validation');
      return;
    }
    
    // Use minimum size for detection
    const safeBounds = {
      x: bounds.x,
      y: bounds.y,
      width: Math.max(bounds.width, 10),
      height: Math.max(bounds.height, 10)
    };
    
    this.controls.set(id, { id, bounds: safeBounds, level, linkedElement, visible: true });
    
    // Log registration with path tracking
    if (this.debug) {
      logger.debug('Control registered', {
        _path: true,
        id,
        level,
        linkedElement,
        bounds: {
          x: safeBounds.x.toFixed(2),
          y: safeBounds.y.toFixed(2),
          width: safeBounds.width.toFixed(2),
          height: safeBounds.height.toFixed(2)
        }
      }, 'overlap-detector registration');
    }
    
    // Dispatch a custom event for control rendering
    if (typeof window !== 'undefined' && !isStateBeingRestored()) {
      const event = new CustomEvent('control-rendered', {
        detail: {
          id,
          type: 'control',
          level,
          linkedElement
        }
      });
      window.dispatchEvent(event);
    }
    
    // Schedule immediate check after registration
    this.scheduleOverlapCheck();
  }

  public updateRectangleBounds(id: string, bounds: Bounds): void {
    const rect = this.rectangles.get(id);
    if (rect) {
      // Validate bounds
      if (!bounds || typeof bounds.x !== 'number' || isNaN(bounds.x)) {
        logger.warn('Invalid rectangle bounds for update', { 
          _path: true, 
          id, 
          bounds 
        }, 'overlap-detector validation');
        return;
      }
      
      // Store previous bounds for logging
      const previousBounds = { ...rect.bounds };
      
      // Update the bounds
      rect.bounds = bounds;
      
      // Log update with path tracking
      if (this.debug) {
        logger.debug('Rectangle bounds updated', {
          _path: true,
          id,
          level: rect.level,
          previousBounds: {
            x: previousBounds.x.toFixed(2),
            y: previousBounds.y.toFixed(2),
            width: previousBounds.width.toFixed(2),
            height: previousBounds.height.toFixed(2)
          },
          newBounds: {
            x: bounds.x.toFixed(2),
            y: bounds.y.toFixed(2),
            width: bounds.width.toFixed(2),
            height: bounds.height.toFixed(2)
          }
        }, 'overlap-detector update');
      }
      
      // Dispatch a custom event for rectangle update
      if (typeof window !== 'undefined' && !isStateBeingRestored()) {
        const event = new CustomEvent('rectangle-rendered', {
          detail: {
            id,
            type: 'rectangle',
            level: rect.level,
            isUpdate: true
          }
        });
        window.dispatchEvent(event);
      }
      
      // Schedule check after update
      this.scheduleOverlapCheck();
    }
  }

  public updateControlBounds(id: string, bounds: Bounds): void {
    const control = this.controls.get(id);
    if (control) {
      // Validate bounds
      if (!bounds || typeof bounds.x !== 'number' || isNaN(bounds.x)) {
        logger.warn('Invalid control bounds for update', { 
          _path: true, 
          id, 
          bounds 
        }, 'overlap-detector validation');
        return;
      }
      
      // Store previous bounds for logging
      const previousBounds = { ...control.bounds };
      
      // Update the bounds
      control.bounds = bounds;
      
      // Log update with path tracking
      if (this.debug) {
        logger.debug('Control bounds updated', {
          _path: true,
          id,
          level: control.level,
          linkedElement: control.linkedElement,
          previousBounds: {
            x: previousBounds.x.toFixed(2),
            y: previousBounds.y.toFixed(2),
            width: previousBounds.width.toFixed(2),
            height: previousBounds.height.toFixed(2)
          },
          newBounds: {
            x: bounds.x.toFixed(2),
            y: bounds.y.toFixed(2),
            width: bounds.width.toFixed(2),
            height: bounds.height.toFixed(2)
          }
        }, 'overlap-detector update');
      }
      
      // Dispatch a custom event for control update
      if (typeof window !== 'undefined' && !isStateBeingRestored()) {
        const event = new CustomEvent('control-rendered', {
          detail: {
            id,
            type: 'control',
            level: control.level,
            linkedElement: control.linkedElement,
            isUpdate: true
          }
        });
        window.dispatchEvent(event);
      }
      
      // Schedule check after update
      this.scheduleOverlapCheck();
    }
  }

  /**
   * Detect overlaps between controls and rectangles with improved level-based visibility
   */
  public detectOverlaps(): Map<string, boolean> {
    // Skip during state restoration
    if (isStateBeingRestored()) {
      return this.lastVisibilityMap;
    }
    
    const visibilityMap = new Map<string, boolean>();
    let hasChanges = false;
    
    try {
      // Check each control against all rectangles
      const controlEntries = Array.from(this.controls.entries());
      const rectEntries = Array.from(this.rectangles.entries());
      
      // Enhanced logging with path tracking
      logger.debug('Starting overlap detection cycle', {
        _path: true,
        controlCount: controlEntries.length,
        rectangleCount: rectEntries.length,
        timestamp: Date.now()
      }, 'overlap-detector check');
      
      // Get workspace state with safety check
      const state = workspaceStateManager.getState();
      if (!state || !state.taskVisualStates) {
        logger.warn('Workspace state or taskVisualStates not available', {
          _path: true,
          hasState: !!state,
          hasTaskStates: !!(state && state.taskVisualStates)
        }, 'overlap-detector warning');
        return this.lastVisibilityMap;
      }
      
      // Process each control element
      for (const [controlId, control] of controlEntries) {
        try {
          // Skip controls that are being preserved or restored (during centering operations)
          const controlElement = document.querySelector(`[data-id="${controlId}"]`) || 
                               document.querySelector(`#${controlId}`);
          
          // Default visibility - we start by assuming the control is visible
          let isVisible = true;
          const linkedRect = this.rectangles.get(control.linkedElement || '');          
          
          // Extract task ID for state checking
          let taskId = controlId;
          if (controlId.startsWith('task-control-')) {
            taskId = controlId.replace('task-control-', '');
          } else if (controlId.startsWith('project-counter-')) {
            taskId = controlId.replace('project-counter-', '');
          }
          
          // Check task state - if the task is hidden, hide its controls
          const taskState = state.taskVisualStates.get(taskId);
          // Special case for project counter displays
          const isProjectCounter = controlId.startsWith('project-counter-') || 
                                  controlElement?.getAttribute('data-project-counter') === 'true';

          // Get the control's level directly from DOM for more accuracy
          let controlLevel = control.level;
          if (controlElement) {
            const domLevel = controlElement.getAttribute('data-level');
            if (domLevel && !isNaN(parseInt(domLevel))) {
              controlLevel = parseInt(domLevel);
            }
          }

          for (const [rectId, rect] of rectEntries) {

            // Get the rectangle's level from DOM for more accuracy
            let rectLevel = rect.level;
            const rectElement = document.querySelector(`#${rectId}`) || 
                              document.querySelector(`[data-id="${rectId}"]`);
                              
            if (rectElement) {
              const domLevel = rectElement.getAttribute('data-level');
              if (domLevel && !isNaN(parseInt(domLevel))) {
                rectLevel = parseInt(domLevel);
              }
            }   
            
            // Check for geometric overlap
            if (this.doOverlap(control.bounds, rect.bounds)) {
              // Check for geometric overlap
              const isOverlapping = this.doOverlap(control.bounds, rect.bounds);            

              // Add special comprehensive logging for the specific control and task mentioned
              const isSpecificCase = (
                controlId === 'task-control-67ec9d9941870047e3defa4b' && 
                rectId === 'task-67ec9dcc41870047e3defa7f'
              );

              if (isSpecificCase) {
                // Check various conditions for the specific case
                const controlElement = document.querySelector(`[data-id="${controlId}"]`) || 
                                    document.querySelector(`#${controlId}`);
                const rectElement = document.querySelector(`#${rectId}`) || 
                                  document.querySelector(`[data-id="${rectId}"]`);
                
                const isPreserved = controlElement && (
                  controlElement.classList.contains('preserved') ||
                  controlElement.classList.contains('restoring')
                );
                
                const taskId = controlId.startsWith('task-control-') ? 
                  controlId.replace('task-control-', '') : 
                  controlId.replace('project-counter-', '');
                
                const taskState = state.taskVisualStates.get(taskId);
                const rectState = state.taskVisualStates.get(rectId.replace('task-', ''));
                
                const isCentering = document.body.classList.contains('is-centering');
                const isActiveTask = taskState === 'active';
                const isProjectCounter = controlId.startsWith('project-counter-') || 
                                      controlElement?.getAttribute('data-project-counter') === 'true';
                
                const isLinkedToRect = control.linkedElement === rectId;
                const isRectHidden = rectState === 'hidden';
                const isRectLevelHigher = rectLevel > controlLevel;
                
                const overlapInfo = {
                  controlBounds: {
                    x: Math.round(control.bounds.x),
                    y: Math.round(control.bounds.y),
                    width: Math.round(control.bounds.width),
                    height: Math.round(control.bounds.height)
                  },
                  rectBounds: {
                    x: Math.round(rect.bounds.x),
                    y: Math.round(rect.bounds.y),
                    width: Math.round(rect.bounds.width),
                    height: Math.round(rect.bounds.height)
                  },
                  overlapping: isOverlapping,
                  controlLevel,
                  rectLevel,
                  isPreserved,
                  isCentering,
                  isTaskHidden: taskState === 'hidden',
                  taskState,
                  isActiveTask,
                  isProjectCounter,
                  isLinkedToRect,
                  isRectHidden,
                  isRectLevelHigher,
                  // Actual DOM positions and sizes for verification
                  domPositions: {
                    control: controlElement ? this.getElementBounds(controlElement) : null,
                    rect: rectElement ? this.getElementBounds(rectElement) : null
                  }
                };
                
                logger.info('Detailed overlap analysis for specific case', {
                  _path: true,
                  controlId,
                  rectId,
                  ...overlapInfo,
                  shouldBeHidden: isOverlapping && isRectLevelHigher && !isPreserved,
                  wouldBeHiddenInCode: isOverlapping && rectLevel > controlLevel
                }, 'overlapping-example');
              }

            }
          }


          if (controlElement && 
              (controlElement.classList.contains('preserved') || 
               controlElement.classList.contains('restoring'))) {
            // Keep the previous visibility state
            const previousVisibility = this.lastVisibilityMap.get(controlId);
            visibilityMap.set(controlId, previousVisibility !== undefined ? previousVisibility : true);
            continue;
          }
          
          // Skip overlap check and force hidden for hidden tasks
          if (taskState === 'hidden') {
            visibilityMap.set(controlId, false);
            this.lastVisibilityMap.set(controlId, false);
            continue;
          }
          
          // Skip overlap check during centering operations for counters
          if (document.body.classList.contains('is-centering') && 
              (controlId.includes('counter') || controlId.includes('Counter'))) {
            visibilityMap.set(controlId, true);
            this.lastVisibilityMap.set(controlId, true);
            continue;
          }
        
          
          // For active tasks that aren't project counters, always show controls
          if (taskState === 'active' && !isProjectCounter) {
            visibilityMap.set(controlId, true);
            this.lastVisibilityMap.set(controlId, true);
            continue;
          }

          // Additional debug logging for levels
          logger.debug('Control level check', {
            _path: true,
            controlId,
            internalLevel: control.level,
            domLevel: controlElement ? controlElement.getAttribute('data-level') : 'no-element',
            finalLevel: controlLevel
          }, 'overlap-detector levels');

          // Improved overlap detection with level checking
          // For all other cases (including all counters), check for overlaps
          const overlappingRects: string[] = [];


          for (const [rectId, rect] of rectEntries) {
            // Skip the rectangle if it's the linked element
            if (rectId === control.linkedElement) {
              continue;
            }
            
            // Get the rectangle's level from DOM for more accuracy
            let rectLevel = rect.level;
            const rectElement = document.querySelector(`#${rectId}`) || 
                               document.querySelector(`[data-id="${rectId}"]`);
                               
            if (rectElement) {
              const domLevel = rectElement.getAttribute('data-level');
              if (domLevel && !isNaN(parseInt(domLevel))) {
                rectLevel = parseInt(domLevel);
              }
            }

            // Skip hidden rectangles
            const rectTaskId = rectId.startsWith('task-') ? rectId.substring(5) : rectId;
            const rectState = state.taskVisualStates.get(rectTaskId);
            if (rectState === 'hidden') {
              continue;
            }

            // Check for geometric overlap
            if (this.doOverlap(control.bounds, rect.bounds)) {
            // Check for geometric overlap
            const isOverlapping = this.doOverlap(control.bounds, rect.bounds);
            

            
            if (isOverlapping) {
              // In our level system:
              // - Higher number means higher in the visual stack
              // - Lower number means lower in the visual stack
              // Control should be hidden when overlapped by a rectangle with HIGHER level (higher NUMBER)
              // According to the requirements: when higher level rectangle overlaps lower level control,
              // the lower level control should be hidden
              if (rectLevel > controlLevel) {
                overlappingRects.push(rectId);
                isVisible = false;
                
                // Apply the overlapped class directly to DOM element
                const controlElement = document.querySelector(`#${controlId}`) || 
                                       document.querySelector(`[data-id="${controlId}"]`);
                if (controlElement) {
                  // Add CSS class for styling
                  controlElement.classList.add('overlapped-control');
                  
                  // Add data attribute for even higher specificity
                  controlElement.setAttribute('data-overlapped', 'true');
                  
                  // Apply inline styles as a fallback (with !important)
                  if (controlElement instanceof HTMLElement || controlElement instanceof SVGElement) {
                    controlElement.style.setProperty('display', 'none', 'important');
                    controlElement.style.setProperty('visibility', 'hidden', 'important');
                    controlElement.style.setProperty('opacity', '0', 'important');
                    controlElement.style.setProperty('pointer-events', 'none', 'important');
                  }
                }
                
                logger.debug('Control is hidden by overlapping rectangle', {
                  _path: true,
                  controlId,
                  controlLevel,
                  rectId,
                  rectLevel,
                  result: 'hidden',
                  elementApplied: !!controlElement
                }, 'overlap-detector visibility');
                
                // Once we've found an overlap that hides the control, we can break
                break;
              } else {
                // Make sure the control does not have the overlapped class
                const controlElement = document.querySelector(`#${controlId}`) || 
                                       document.querySelector(`[data-id="${controlId}"]`);
                if (controlElement) {
                  // Remove the overlapped class and attribute
                  controlElement.classList.remove('overlapped-control');
                  controlElement.removeAttribute('data-overlapped');
                  
                  // Remove inline styles if any were set
                  if (controlElement instanceof HTMLElement || controlElement instanceof SVGElement) {
                    // Only remove if this is not a different hiding case
                    if (!controlElement.classList.contains('force-hidden-element') && 
                        !controlElement.classList.contains('hidden-during-operation')) {
                      // Reset inline styles - don't use removeProperty since it might be needed elsewhere
                      controlElement.style.display = '';
                      controlElement.style.visibility = '';
                      controlElement.style.opacity = '';
                      controlElement.style.pointerEvents = '';
                    }
                  }
                }
                
                logger.debug('Control remains visible despite overlap', {
                  _path: true,
                  controlId,
                  controlLevel,
                  rectId, 
                  rectLevel,
                  result: 'still-visible'
                }, 'overlap-detector visibility');
              }
            }
            }
          }
          
          // Set the visibility in the map
          visibilityMap.set(controlId, isVisible);
          this.lastVisibilityMap.set(controlId, isVisible);
          
          // Track changes
          const previousVisibility = this.lastVisibilityMap.get(controlId);
          if (previousVisibility !== isVisible) {
            hasChanges = true;
          }
        } catch (controlError) {
          // Log error for this specific control but continue with others
          logger.error(`Error processing control ${controlId}`, {
            _path: true,
            controlId,
            error: controlError instanceof Error ? controlError.message : String(controlError)
          }, 'overlap-detector error');
          
          // Default to previous visibility or true for this control
          const previousVisibility = this.lastVisibilityMap.get(controlId);
          visibilityMap.set(controlId, previousVisibility !== undefined ? previousVisibility : true);
        }
      }
      
      // Log summary of changes
      if (hasChanges) {
        // Create a detailed log of what changed and why
        const changeDetails = Array.from(visibilityMap.entries())
          .filter(([id, _]) => this.lastVisibilityMap.get(id) !== visibilityMap.get(id))
          .map(([id, isNowVisible]) => {
            const control = this.controls.get(id);
            const previousState = this.lastVisibilityMap.get(id);
            
            return {
              id,
              controlLevel: control?.level,
              linkedElement: control?.linkedElement,
              previousState,
              newState: isNowVisible,
              change: previousState === undefined 
                ? 'new' 
                : (previousState ? 'visible→hidden' : 'hidden→visible')
            };
          });
        
        logger.debug('Overlap detection completed with changes', {
          _path: true,
          visibleControls: Array.from(visibilityMap.entries()).filter(([_, v]) => v).length,
          hiddenControls: Array.from(visibilityMap.entries()).filter(([_, v]) => !v).length,
          changedItems: changeDetails.length,
          changes: changeDetails
        }, 'overlap-detector update');
        
        // Dispatch an event for other systems to know about visibility changes
        if (typeof window !== 'undefined' && !isStateBeingRestored()) {
          window.dispatchEvent(new CustomEvent('control-visibility-changed', {
            detail: {
              changes: changeDetails,
              timestamp: Date.now()
            }
          }));
        }
      }
      
      // Return the final visibility map
      return visibilityMap;
    } catch (error) {
      // Log error but return last known visibility map
      logger.error('Error during overlap detection', {
        _path: true,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : 'No stack available'
      }, 'overlap-detector error');
      
      return this.lastVisibilityMap;
    }
  }
  
  
  /**
   * Check if two rectangles overlap with improved accuracy
   */
  private doOverlap(a: Bounds, b: Bounds): boolean {
    // Use a smaller margin for more accurate detection
    const margin = 2;
    
    // Calculate the overlap percentage to determine if it's significant
    const overlapArea = Math.max(0, 
      Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
    ) * Math.max(0, 
      Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
    );
    
    const aArea = a.width * a.height;
    const minOverlapPercentage = 0.15; // 15% overlap threshold
    
    // Only consider it an overlap if it's more than 15% of the control area
    // or if it's a direct intersection
    const isSignificantOverlap = (overlapArea / aArea) >= minOverlapPercentage;
    
    const isGeometricOverlap = (
      a.x < (b.x + b.width - margin) &&
      (a.x + a.width - margin) > b.x &&
      a.y < (b.y + b.height - margin) &&
      (a.y + a.height - margin) > b.y
    );
    
    return isGeometricOverlap && isSignificantOverlap;
  }

  /**
 * Get actual bounds from a DOM element
 * Used for detailed logging
 */
  private getElementBounds(element: Element): Bounds | null {
    try {
      // For SVG elements, we need to use getBBox
      if (element instanceof SVGGraphicsElement) {
        try {
          const bbox = element.getBBox();
          
          // Get transform if any
          let x = bbox.x;
          let y = bbox.y;
          
          // Get transform attribute to adjust position
          const transform = element.getAttribute('transform');
          if (transform) {
            const match = transform.match(/translate\(([^,]+),([^)]+)\)/);
            if (match && match.length >= 3) {
              x += parseFloat(match[1]);
              y += parseFloat(match[2]);
            }
          }
          
          return {
            x,
            y,
            width: bbox.width,
            height: bbox.height
          };
        } catch (e) {
          // Fallback to getBoundingClientRect
          const rect = element.getBoundingClientRect();
          return {
            x: rect.left,
            y: rect.top,
            width: rect.width,
            height: rect.height
          };
        }
      } else {
        // For HTML elements, use getBoundingClientRect
        const rect = element.getBoundingClientRect();
        return {
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height
        };
      }
    } catch (error) {
      logger.error('Failed to get element bounds', {
        _path: true, 
        elementId: element.id || 'unknown',
        error
      }, 'overlap-detector error');
      return null;
    }
  }

  /**
   * Clear all elements and clean up event listeners
   */
  public clear(): void {
    logger.info('Clearing overlap detector state', {
      _path: true
    }, 'overlap-detector cleanup');
    
    this.rectangles.clear();
    this.controls.clear();
    this.lastVisibilityMap.clear();
    
    // Re-initialize mutation observer if it was disconnected
    if (this.mutationObserver === null) {
      this.setupMutationObserver();
    }
  }
  
  /**
   * Clear just control elements
   */
  public clearControls(): void {
    logger.info('Clearing control elements from overlap detector', {}, 'overlap-detector cleanup');
    this.controls.clear();
    this.lastVisibilityMap.clear();
  }
  
  /**
   * Manually trigger an overlap check
   */
  public requestCheck(): void {
    this.scheduleOverlapCheck();
  }
  
  /**
   * Update visibility of controls based on overlap detection
   * This is a public method for external components to trigger visibility updates
   */
  public updateVisibility(): void {
    this.detectOverlaps();
  }
  
  /**
   * Debug a specific overlap between a control and rectangle
   * This method is for debugging specific overlap cases
   * @returns Debug report object or void
   */
  public debugSpecificOverlap(controlId: string, rectId: string): any {
    try {
      const control = this.controls.get(controlId);
      const rect = this.rectangles.get(rectId);
      
      if (!control || !rect) {
        logger.warn('Cannot debug overlap - elements not found', {
          _path: true, 
          controlId, 
          rectId,
          controlFound: !!control,
          rectFound: !!rect
        }, 'overlap-detector debug');
        return;
      }
      
      // Get DOM elements
      const controlElement = document.querySelector(`#${controlId}`) || 
                            document.querySelector(`[data-id="${controlId}"]`);
      const rectElement = document.querySelector(`#${rectId}`) || 
                         document.querySelector(`[data-id="${rectId}"]`);
      
      // Check for geometric overlap
      const isOverlapping = this.doOverlap(control.bounds, rect.bounds);
      
      // Get control and rect levels
      let controlLevel = control.level;
      let rectLevel = rect.level;
      
      // Get levels from DOM if available
      if (controlElement) {
        const domLevel = controlElement.getAttribute('data-level');
        if (domLevel && !isNaN(parseInt(domLevel))) {
          controlLevel = parseInt(domLevel);
        }
      }
      
      if (rectElement) {
        const domLevel = rectElement.getAttribute('data-level');
        if (domLevel && !isNaN(parseInt(domLevel))) {
          rectLevel = parseInt(domLevel);
        }
      }
      
      // Is the control currently marked as overlapped?
      const isMarkedOverlapped = controlElement ? 
        controlElement.classList.contains('overlapped-control') || 
        controlElement.getAttribute('data-overlapped') === 'true' : 
        false;
      
      // Is the control currently visible in DOM?
      const isVisibleInDOM = controlElement ? 
        getComputedStyle(controlElement).visibility !== 'hidden' && 
        getComputedStyle(controlElement).display !== 'none' : 
        false;
      
      // Get workspace state for task state
      const state = workspaceStateManager.getState();
      const taskId = controlId.startsWith('task-control-') ? 
        controlId.replace('task-control-', '') : controlId;
      const taskState = state.taskVisualStates.get(taskId);
      
      // Calculate whether control should be hidden
      const shouldBeHiddenByLevel = isOverlapping && rectLevel > controlLevel;
      
      // Create comprehensive report
      const report = {
        controlId,
        rectId,
        controlLevel,
        rectLevel,
        taskState,
        isOverlapping,
        shouldBeHiddenByLevel,
        isMarkedOverlapped,
        isVisibleInDOM,
        levelDifference: rectLevel - controlLevel,
        controlBounds: {
          x: Math.round(control.bounds.x),
          y: Math.round(control.bounds.y),
          width: Math.round(control.bounds.width),
          height: Math.round(control.bounds.height)
        },
        rectBounds: {
          x: Math.round(rect.bounds.x),
          y: Math.round(rect.bounds.y),
          width: Math.round(rect.bounds.width),
          height: Math.round(rect.bounds.height)
        },
        hasControlElement: !!controlElement,
        hasRectElement: !!rectElement,
        controlStyles: controlElement ? {
          display: getComputedStyle(controlElement).display,
          visibility: getComputedStyle(controlElement).visibility,
          opacity: getComputedStyle(controlElement).opacity,
          classList: Array.from(controlElement.classList)
        } : null,
        conclusion: shouldBeHiddenByLevel ? 
          (isMarkedOverlapped ? 
            'CORRECT: Control should be hidden and is marked as overlapped' : 
            'ERROR: Control should be hidden but is NOT marked as overlapped') :
          (isMarkedOverlapped ? 
            'ERROR: Control should be visible but is marked as overlapped' : 
            'CORRECT: Control should be visible and is not marked as overlapped')
      };
      
      // Log the report
      logger.info('Overlap Debug Report', {
        _path: true,
        ...report
      }, 'overlap-detector debug');
      
      // Fix if needed
      if (shouldBeHiddenByLevel && !isMarkedOverlapped && controlElement) {
        logger.warn('Fixing incorrectly visible control', {
          _path: true,
          controlId,
          rectId
        }, 'overlap-detector debug');
        
        // Mark as overlapped
        controlElement.classList.add('overlapped-control');
        controlElement.setAttribute('data-overlapped', 'true');
        
        // Apply inline styles
        if (controlElement instanceof HTMLElement || controlElement instanceof SVGElement) {
          controlElement.style.setProperty('display', 'none', 'important');
          controlElement.style.setProperty('visibility', 'hidden', 'important');
          controlElement.style.setProperty('opacity', '0', 'important');
        }
      } else if (!shouldBeHiddenByLevel && isMarkedOverlapped && controlElement) {
        logger.warn('Fixing incorrectly hidden control', {
          _path: true,
          controlId,
          rectId
        }, 'overlap-detector debug');
        
        // Unmark as overlapped
        controlElement.classList.remove('overlapped-control');
        controlElement.removeAttribute('data-overlapped');
        
        // Remove inline styles
        if (controlElement instanceof HTMLElement || controlElement instanceof SVGElement) {
          controlElement.style.removeProperty('display');
          controlElement.style.removeProperty('visibility');
          controlElement.style.removeProperty('opacity');
        }
      }
      
      return report;
    } catch (error) {
      logger.error('Error debugging specific overlap', {
        _path: true,
        controlId,
        rectId,
        error: error instanceof Error ? error.message : String(error)
      }, 'overlap-detector debug');
    }
  }
}

export const overlapDetector = OverlapDetector.getInstance();

// Make detector available on window for access
if (typeof window !== 'undefined') {
  // Use a slightly different approach to avoid TypeScript errors
  (window as any).overlapDetector = overlapDetector;
  
  // Add a debug function to check specific overlaps
  (window as any).debugSpecificOverlap = (controlId: string, rectId: string) => {
    return overlapDetector.debugSpecificOverlap(controlId, rectId);
  };
  
  // Add a helper function to find all potential overlapping control/rect pairs
  (window as any).findAllOverlappingPairs = () => {
    try {
      // Get all rectangles and controls
      const rectangles = document.querySelectorAll('[id^="task-"], [id^="project-"]');
      const controls = document.querySelectorAll('.task-control, .task-split-button, [data-control-type]');
      
      const potentialPairs: Array<{ controlId: string, rectId: string, controlLevel: number, rectLevel: number }> = [];
      
      // For each rectangle, check each control
      Array.from(rectangles).forEach(rectElement => {
        const rectId = rectElement.id;
        const rectLevelAttr = rectElement.getAttribute('data-level');
        if (!rectId || !rectLevelAttr) return;
        
        const rectLevel = parseInt(rectLevelAttr);
        if (isNaN(rectLevel)) return;
        
        const rectBounds = rectElement.getBoundingClientRect();
        
        Array.from(controls).forEach(controlElement => {
          // Skip if not a valid control
          const controlId = controlElement.id || 
                          controlElement.getAttribute('data-id') || 
                          controlElement.getAttribute('data-task-id');
                          
          const controlLevelAttr = controlElement.getAttribute('data-level');
          if (!controlId || !controlLevelAttr) return;
          
          const controlLevel = parseInt(controlLevelAttr);
          if (isNaN(controlLevel)) return;
          
          // Skip if control belongs to this rectangle
          if (controlElement.getAttribute('data-task-id') === rectId.replace('task-', '')) return;
          
          const controlBounds = controlElement.getBoundingClientRect();
          
          // Check if they overlap
          const isOverlapping = !(
            controlBounds.right < rectBounds.left || 
            controlBounds.left > rectBounds.right || 
            controlBounds.bottom < rectBounds.top || 
            controlBounds.top > rectBounds.bottom
          );
          
          if (isOverlapping) {
            potentialPairs.push({
              controlId,
              rectId,
              controlLevel,
              rectLevel
            });
          }
        });
      });
      
      // Log all potential pairs
      console.table(potentialPairs);
      
      // Return the pairs for further debugging
      return potentialPairs;
    } catch (error) {
      console.error('Error finding overlapping pairs:', error);
      return [];
    }
  };
  
  // Self-executing function to activate debugging for specific problematic case
  (function activateSpecificCaseDebugging() {
    // Adding a delayed check to debug the known problematic control
    setTimeout(() => {
      try {
        // Debugging the specific case mentioned in the problem description
        // This will run once after page load to diagnose any issues
        const specificControlId = 'task-control-67ea2a31c9ad3bf4b5e1b3fb';
        const specificRectId = 'task-67ebb58a41870047e3def8d8';
        
        // Check if these elements exist in DOM
        const controlExists = document.getElementById(specificControlId) || 
                            document.querySelector(`[data-id="${specificControlId}"]`);
                            
        const rectExists = document.getElementById(specificRectId) || 
                          document.querySelector(`[data-id="${specificRectId}"]`);
        
        if (controlExists && rectExists) {
          // Set flag for others to know we're debugging this case
          document.body.setAttribute('data-debug-overlaps', `${specificControlId}:${specificRectId}`);
          
          // Debug this specific case
          overlapDetector.debugSpecificOverlap(specificControlId, specificRectId);
          
          console.log('Debugging specific case activated:', specificControlId, specificRectId);
        }
      } catch (e) {
        console.error('Error in specific debugging activation:', e);
      }
    }, 2000);
  })();
}