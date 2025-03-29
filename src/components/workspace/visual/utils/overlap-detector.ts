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

class OverlapDetector {
  private static instance: OverlapDetector;
  private rectangles: Map<string, RegisteredElement>= new Map();
  private controls: Map<string, RegisteredElement>= new Map();
  private lastVisibilityMap: Map<string, boolean>= new Map();
  private lastCheckTimestamp: number = 0;
  private checkThrottleDelay: number = 100; // ms between checks
  private pendingCheck: boolean = false;

  private constructor() {}

  public static getInstance(): OverlapDetector {
    if (!OverlapDetector.instance) {
      OverlapDetector.instance = new OverlapDetector();
    }
    return OverlapDetector.instance;
  }

  public registerRectangle(id: string, bounds: Bounds, level: number): void {
    // Validate bounds
    if (!bounds || typeof bounds.x !== 'number' || isNaN(bounds.x)) {
      logger.warn('Invalid rectangle bounds', { id, bounds }, 'overlap-detector validation');
      return;
    }
    
    this.rectangles.set(id, { id, bounds, level, visible: true });
    
    // Schedule check after registration
    this.scheduleOverlapCheck();
  }

  public registerControl(id: string, bounds: Bounds, level: number, linkedElement: string): void {
    // Validate bounds
    if (!bounds || typeof bounds.x !== 'number' || isNaN(bounds.x)) {
      logger.warn('Invalid control bounds', { id, bounds }, 'overlap-detector validation');
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
    
    // Schedule check after registration
    this.scheduleOverlapCheck();
  }

  public updateRectangleBounds(id: string, bounds: Bounds): void {
    const rect = this.rectangles.get(id);
    if (rect) {
      // Validate bounds
      if (!bounds || typeof bounds.x !== 'number' || isNaN(bounds.x)) {
        logger.warn('Invalid rectangle bounds for update', { id, bounds }, 'overlap-detector validation');
        return;
      }
      
      rect.bounds = bounds;
      
      // Schedule check after update
      this.scheduleOverlapCheck();
    }
  }

  public updateControlBounds(id: string, bounds: Bounds): void {
    const control = this.controls.get(id);
    if (control) {
      // Validate bounds
      if (!bounds || typeof bounds.x !== 'number' || isNaN(bounds.x)) {
        logger.warn('Invalid control bounds for update', { id, bounds }, 'overlap-detector validation');
        return;
      }
      
      control.bounds = bounds;
      
      // Schedule check after update
      this.scheduleOverlapCheck();
    }
  }

  /**
   * Schedule a throttled overlap check
   */
  private scheduleOverlapCheck(): void {
    // Skip if already pending or during state restoration
    if (this.pendingCheck || isStateBeingRestored()) return;
    
    const now = Date.now();
    const timeSinceLastCheck = now - this.lastCheckTimestamp;
    
    // If we've checked recently, delay the next check
    if (timeSinceLastCheck < this.checkThrottleDelay) {
      this.pendingCheck = true;
      
      setTimeout(() => {
        this.pendingCheck = false;
        this.lastCheckTimestamp = Date.now();
        this.detectOverlaps();
      }, this.checkThrottleDelay - timeSinceLastCheck);
    } else {
      // Check immediately
      this.lastCheckTimestamp = now;
      this.detectOverlaps();
    }
  }

  /**
   * Detect overlaps between controls and rectangles
   */
  public detectOverlaps(): Map<string, boolean>{
    // Skip during state restoration
    if (isStateBeingRestored()) {
      return this.lastVisibilityMap;
    }
    
    const visibilityMap = new Map<string, boolean>();
    let hasChanges = false;
    
    // Check each control against all rectangles
    const controlEntries = Array.from(this.controls.entries());
    const rectEntries = Array.from(this.rectangles.entries());
    
    // Only log if we have a significant number of elements
    if (controlEntries.length > 0 || rectEntries.length > 0) {
      logger.debug('Detecting overlaps for controls', {
        controlCount: controlEntries.length,
        rectangleCount: this.rectangles.size
      }, 'overlap-detector check');
    }
    
    for (const [controlId, control] of controlEntries) {
      // Skip controls that are being preserved or restored (during centering operations)
      const controlElement = document.querySelector(`[data-id="${controlId}"]`) || 
                           document.querySelector(`#${controlId}`);
      
      if (controlElement && 
          (controlElement.classList.contains('preserved') || 
           controlElement.classList.contains('restoring'))) {
        // Keep the previous visibility state
        const previousVisibility = this.lastVisibilityMap.get(controlId);
        visibilityMap.set(controlId, previousVisibility !== undefined ? previousVisibility : true);
        continue;
      }
      
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
      const state = workspaceStateManager.getState();
      const taskState = state.taskVisualStates.get(taskId);
      
      // Skip overlap check and force hidden for hidden tasks
      if (taskState === 'hidden') {
        visibilityMap.set(controlId, false);
        this.lastVisibilityMap.set(controlId, false);
        continue;
      }
      
      // Skip overlap check and during centering operations for counters
      if (document.body.classList.contains('is-centering') && 
          (controlId.includes('counter') || controlId.includes('Counter'))) {
        visibilityMap.set(controlId, true);
        this.lastVisibilityMap.set(controlId, true);
        continue;
      }
      
      // Special case for project counter displays
      const isProjectCounter = controlId.startsWith('project-counter-') || 
                              controlElement?.getAttribute('data-project-counter') === 'true';
      
      // For active tasks that aren't project counters, always show controls
      if (taskState === 'active' && !isProjectCounter) {
        visibilityMap.set(controlId, true);
        this.lastVisibilityMap.set(controlId, true);
        continue;
      }

      // For semi-transparent tasks that aren't project counters, show controls
      // only if they're at an appropriate level
      if (taskState === 'semi-transparent' && !isProjectCounter && linkedRect && linkedRect.level <= 5) {
        visibilityMap.set(controlId, true);
        this.lastVisibilityMap.set(controlId, true);
        continue;
      }

      // For all other cases (including all counters), check for overlaps
      for (const [rectId, rect] of rectEntries) {
        // Skip the rectangle if it's the linked element
        if (rectId === control.linkedElement) {
          continue;
        }
        
        // Skip rectangles with a lower or same z-index level for non-counter elements
        // For counter elements, we want to check all potentially overlapping elements
        if (!isProjectCounter && !controlId.includes('counter') && linkedRect && rect.level <= linkedRect.level) {
          continue;
        }
        
        // Skip hidden rectangles
        const rectTaskId = rectId.startsWith('task-') ? rectId.substring(5) : rectId;
        const rectState = state.taskVisualStates.get(rectTaskId);
        if (rectState === 'hidden') {
          continue;
        }

        // Check for overlap
        if (this.doOverlap(control.bounds, rect.bounds)) {
          isVisible = false;
          break;
        }
      }

      // Check if visibility has changed
      const previousVisibility = this.lastVisibilityMap.get(controlId);
      if (previousVisibility !== isVisible) {
        hasChanges = true;
        
        logger.debug('Control visibility changed', {
          controlId,
          taskId,
          previousVisibility,
          newVisibility: isVisible,
          taskState,
          isProjectCounter
        }, 'overlap-detector visibility');
      }
      
      visibilityMap.set(controlId, isVisible);
      this.lastVisibilityMap.set(controlId, isVisible);
    }

    // Only log if there were changes
    if (hasChanges) {
      logger.debug('Control visibility map updated', {
        visibleControls: Array.from(visibilityMap.entries()).filter(([_, v]) => v).length,
        hiddenControls: Array.from(visibilityMap.entries()).filter(([_, v]) => !v).length
      }, 'overlap-detector update');
    }
    
    return visibilityMap;
  }

  /**
   * Check if two rectangles overlap
   */
  private doOverlap(a: Bounds, b: Bounds): boolean {
    // Add a small margin to reduce false positives
    const margin = 4;
    return (
      a.x < (b.x + b.width - margin) &&
      (a.x + a.width - margin) > b.x &&
      a.y < (b.y + b.height - margin) &&
      (a.y + a.height - margin) > b.y
    );
  }

  /**
   * Clear all elements
   */
  public clear(): void {
    logger.info('Clearing overlap detector state', {}, 'overlap-detector cleanup');
    this.rectangles.clear();
    this.controls.clear();
    this.lastVisibilityMap.clear();
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
}

export const overlapDetector = OverlapDetector.getInstance();

// Make detector available on window for access
if (typeof window !== 'undefined') {
  window.overlapDetector = overlapDetector;
}
