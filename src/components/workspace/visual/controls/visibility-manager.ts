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
      
      // Start observing after a delay to ensure DOM is ready
      setTimeout(() => {
        const workspace = document.querySelector('.workspace-visual');
        if (workspace) {
          observer.observe(workspace, { 
            childList: true,
            subtree: true,
            attributeFilter: ['transform', 'style', 'class', 'visibility', 'opacity']
          });
          
          logger.debug('Mutation observer for control visibility started', {}, 'controls visibility');
        }
      }, 1000);
    } catch (error) {
      logger.error('Failed to set up mutation observer', { error }, 'controls visibility error');
    }
  }

  /**
   * Handle DOM mutations to trigger visibility updates efficiently
   */
  private handleDomMutations(mutations: MutationRecord[]): void {
    // Skip if we're already pending an update or during state restoration
    if (this.pendingUpdate || isStateBeingRestored()) return;
    
    // Check if any of the mutations are related to controls or task elements
    const relevantMutation = mutations.some(mutation => {
      if (!mutation.target) return false;
      
      const targetEl = mutation.target as Element;
      const className = targetEl.className?.toString() || '';
      
      return (
        className.includes('task-rect') ||
        className.includes('task-control') ||
        className.includes('project-counter') ||
        className.includes('counter-display') ||
        targetEl.getAttribute('data-project-counter') === 'true' ||
        targetEl.getAttribute('data-task-id')
      );
    });
    
    if (relevantMutation) {
      this.throttledUpdateVisibility();
    }
  }

  /**
   * Throttled update to prevent too frequent visibility checks
   */
  private throttledUpdateVisibility(): void {
    // Skip if an update is already pending or during state restoration
    if (this.pendingUpdate || isStateBeingRestored()) return;
    
    const now = Date.now();
    const timeSinceLastUpdate = now - this.lastUpdateTimestamp;
    
    if (timeSinceLastUpdate < this.updateThrottleDelay) {
      // Schedule update for later
      this.pendingUpdate = true;
      setTimeout(() => {
        this.pendingUpdate = false;
        this.lastUpdateTimestamp = Date.now();
        this.updateVisibility();
      }, this.updateThrottleDelay - timeSinceLastUpdate);
    } else {
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
  public updateVisibility(): void {
    try {
      // Skip during state restoration
      if (isStateBeingRestored()) return;
      
      // Get visibility map from overlap detector
      const visibilityMap = overlapDetector.detectOverlaps();

      // Get current workspace state
      const workspaceState = workspaceStateManager.getState();
      
      // Process visibility for all registered controls
      this.controlRegistry.forEach((control, controlId) => {
        // Skip forced visible controls
        if (this.activeControlIds.has(controlId)) return;

        // Find element if not already stored
        let element = control.element;
        if (!element) {
          element = document.querySelector(`.${controlId}`);
          if (element) {
            control.element = element;
          } else {
            // Skip controls that don't exist in the DOM
            return;
          }
        }

        // Skip if element is no longer in the DOM
        if (!element.isConnected) {
          // Remove from registry
          this.controlRegistry.delete(controlId);
          return;
        }

        // Get task state
        const taskState = workspaceState.taskVisualStates.get(control.taskId);
        
        // Determine visibility based on task state and overlap
        let isVisible = visibilityMap.get(controlId) || false;
        let opacity = 1;

        if (taskState === 'hidden') {
          isVisible = false;
          opacity = 0;
        } else if (taskState === 'active') {
          opacity = 1;
          
          // For active tasks, respect the overlap detection for project counters only
          if (controlId.startsWith('project-counter-')) {
            // Only check overlap for project counters
            isVisible = visibilityMap.get(controlId) || false;
          } else {
            // For other controls on active tasks, always show
            isVisible = true;
          }
        } else if (taskState === 'semi-transparent') {
          opacity = 0.5;
          
          // For semi-transparent tasks, respect the overlap detection result
          isVisible = visibilityMap.get(controlId) || false;
        }

        // Apply visibility directly - no transitions during overlap handling
        (element as HTMLElement).style.visibility = isVisible ? 'visible' : 'hidden';
        (element as HTMLElement).style.opacity = String(opacity);
        (element as HTMLElement).style.pointerEvents = 'none';
      });
    } catch (error) {
      logger.error('Failed to update control visibility', { error }, 'controls visibility error');
    }
  }
}

export const controlVisibilityManager = ControlVisibilityManager.getInstance();

// Make manager available on window for access from preload-state
if (typeof window !== 'undefined') {
  window.controlVisibilityManager = controlVisibilityManager;
}
