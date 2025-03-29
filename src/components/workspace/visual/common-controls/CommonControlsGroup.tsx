'use client';

import React, { useReducer, useRef, useEffect, useCallback } from 'react';
import { logger } from '@/lib/client/logger';
import { workspaceStateManager } from '@/lib/workspace/state/manager';
import { TaskVisualState } from '@/lib/workspace/state/types';
import { svgController } from '../services/svg-controller';
import { animationCoordinator } from '@/lib/client/visual/animation/coordinator';
import { taskControlEventDispatcher } from '@/lib/svg/controls/task/event-dispatcher';
import { select } from 'd3-selection';
import { TaskEventEmitter } from '@/lib/client/visual/task/events';
import { TaskControls } from '@/lib/svg/controls/task/controls';

interface CommonControlsProps {
  className?: string;
  _style?: React.CSSProperties;
}

// Control modes
type ControlMode = 'none' | 'regenerate' | 'delete';

// Action types for the reducer
type Action = 
  | { type: 'TOGGLE_PANEL' }
  | { type: 'SET_EXPANDED', payload: boolean }
  | { type: 'SET_MODE', payload: ControlMode }
  | { type: 'SET_TRANSITIONING', payload: boolean }
  | { type: 'RESET_ALL' };

// State interface
interface ControlState {
  expanded: boolean;
  activeMode: ControlMode;
  isTransitioning: boolean;
}

// Initial state
const initialState: ControlState = {
  expanded: false,
  activeMode: 'none',
  isTransitioning: false
};

// Reducer function
function controlsReducer(state: ControlState, action: Action): ControlState {
  switch (action.type) {
    case 'TOGGLE_PANEL':
      return {
        ...state,
        expanded: !state.expanded,
        isTransitioning: true
      };
    case 'SET_EXPANDED':
      return {
        ...state,
        expanded: action.payload
      };
    case 'SET_MODE':
      return {
        ...state, 
        activeMode: action.payload,
        expanded: action.payload !== 'none' ? true : state.expanded // Always expand when setting a mode
      };
    case 'SET_TRANSITIONING':
      return {
        ...state,
        isTransitioning: action.payload
      };
    case 'RESET_ALL':
      return {
        ...state,
        activeMode: 'none'
      };
    default:
      return state;
  }
}

// Create a unique ID for SVG controls
const getSvgControlId = (taskId: string, mode: 'regenerate' | 'delete') => `${mode}-control-${taskId}`;

/**
 * Common controls group component that provides regenerate and delete functionality
 * across all task rectangles using SVG-native controls
 */
export const CommonControlsGroup: React.FC<CommonControlsProps> = ({
  className = '',
  _style
}) => {// Use reducer for more predictable state management
  const [state, dispatch] = useReducer(controlsReducer, initialState);
  const { expanded, activeMode, isTransitioning } = state;
  
  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const activeModeRef = useRef<ControlMode>('none');
  const createdControlsRef = useRef<Map<string, boolean>>(new Map());
  const controlsRef = useRef<TaskControls | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  
  // Debug flag
  const debugMode = true;
  
  // Log debug information
  const logDebug = useCallback((message: string, data?: Record<string, unknown>) => {
    if (debugMode) {
      logger.debug(`[CommonControls] ${message}`, data, 'controls debug');
    }
  }, []);
  
  // Initialize controls
  useEffect(() => {
    controlsRef.current = new TaskControls({
      split: async (event) => {
        try {
          await taskControlEventDispatcher.handleSplit(event.elementId);
        } catch (error) {
          logger.error('Split control handler error', { error }, 'controls error');
        }
      }
    });
    
    return () => {
      if (controlsRef.current) {
        controlsRef.current = null;
      }
    };
  }, []);
  
  // Update the active mode ref when state changes
  useEffect(() => {
    activeModeRef.current = activeMode;
    logDebug('Active mode updated', { activeMode });
    
    // Add/remove mode classes to body
    document.body.classList.remove('mode-regenerate', 'mode-delete');
    if (activeMode !== 'none') {
      document.body.classList.add(`mode-${activeMode}`);
    }
  }, [activeMode, logDebug]);
  
  // Clear transition state after animation completes
  useEffect(() => {
    if (isTransitioning) {
      const timer = setTimeout(() => {
        dispatch({ type: 'SET_TRANSITIONING', payload: false });
      }, 300);
      
      return () => clearTimeout(timer);
    }
  }, [isTransitioning]);
  
  // Import deletion tracker
  useEffect(() => {
    import('@/lib/client/visual/utils/deletion-tracker')
      .then((_module) => {
        logDebug('Deletion tracker imported');
      })
      .catch(error => {
        logger.error('Failed to import deletion tracker:', { error }, 'controls error');
      });
  }, [logDebug]);
  
  // Debug state changes and ensure DOM reflects current state
  useEffect(() => {
    logDebug('Component state updated', { expanded, activeMode, isTransitioning });
    
    // Ensure the correct mode is reflected in the DOM
    if (containerRef.current) {
      // Update data attribute on container for CSS targeting
      containerRef.current.setAttribute('data-active-mode', activeMode);
      
      // Force immediate update of button styles
      const regenerateButton = containerRef.current.querySelector('[data-mode="regenerate"]');
      const deleteButton = containerRef.current.querySelector('[data-mode="delete"]');
      
      if (regenerateButton && deleteButton) {
        // Update regenerate button
        if (activeMode === 'regenerate') {
          regenerateButton.classList.add('bg-blue-500', 'text-white', 'regenerate-active');
          regenerateButton.classList.remove('bg-gray-100', 'hover:bg-gray-200', 'text-gray-700');
          
          deleteButton.classList.remove('bg-red-500', 'text-white', 'delete-active');
          deleteButton.classList.add('bg-gray-100', 'hover:bg-gray-200', 'text-gray-700');
        } 
        // Update delete button
        else if (activeMode === 'delete') {
          deleteButton.classList.add('bg-red-500', 'text-white', 'delete-active');
          deleteButton.classList.remove('bg-gray-100', 'hover:bg-gray-200', 'text-gray-700');
          
          regenerateButton.classList.remove('bg-blue-500', 'text-white', 'regenerate-active');
          regenerateButton.classList.add('bg-gray-100', 'hover:bg-gray-200', 'text-gray-700');
        }
        // Reset all buttons when no mode is active
        else {
          regenerateButton.classList.remove('bg-blue-500', 'text-white', 'regenerate-active');
          regenerateButton.classList.add('bg-gray-100', 'hover:bg-gray-200', 'text-gray-700');
          
          deleteButton.classList.remove('bg-red-500', 'text-white', 'delete-active');
          deleteButton.classList.add('bg-gray-100', 'hover:bg-gray-200', 'text-gray-700');
        }
      }
    }
  }, [expanded, activeMode, isTransitioning, logDebug]);
  
  // Handle click outside to collapse
  useEffect(() => {
    if (!expanded) return;
    
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        logDebug('Click outside detected');
        
        // Reset any active mode first
        if (activeMode !== 'none') {
          clearSvgControls();
          document.body.classList.remove('mode-regenerate', 'mode-delete');
          
          // Animate tasks back to active state
          const state = workspaceStateManager.getState();
          const visibleTaskIds: string[] = [];
          
          state.taskVisualStates.forEach((visualState, taskId) => {
            if (visualState === 'active' || visualState === 'semi-transparent') {
              visibleTaskIds.push(taskId);
            }
          });
          
          // Show split buttons again
          document.querySelectorAll('.task-split-button:not(.being-removed):not(.force-hidden-element)').forEach(element => {
            (element as HTMLElement).style.display = '';
          });
          
          // Animate tasks back to active state
          if (visibleTaskIds.length > 0) {
            animateTasksToState(visibleTaskIds, 'active');
          }
          
          activeModeRef.current = 'none';
          dispatch({ type: 'SET_MODE', payload: 'none' });
        }
        
        // Then collapse
        dispatch({ type: 'SET_EXPANDED', payload: false });
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [expanded, activeMode, logDebug]);
  
  // Listen for reset events
  useEffect(() => {
    const handleResetEvent = () => {
      logDebug('Reset common controls event received');
      
      if (activeMode !== 'none') {
        clearSvgControls();
        resetMode();
      }
      
      if (expanded) {
        dispatch({ type: 'SET_EXPANDED', payload: false });
      }
    };
    
    // Listen for force control visibility events
    const handleForceVisibilityEvent = (event: CustomEvent) => {
      try {
        if (!event.detail || !event.detail.taskIds) return;
        
        const taskIds = event.detail.taskIds as string[];
        if (taskIds.length === 0) return;
        
        logDebug('Force control visibility event received', { count: taskIds.length });
        
        // Force visibility for controls
        setTimeout(() => {
          // Show all split buttons for these tasks
          taskIds.forEach(taskId => {
            document.querySelectorAll(`.task-split-button[data-task-id="${taskId}"]`).forEach(element => {
              if (element instanceof HTMLElement || element instanceof SVGElement) {
                element.style.removeProperty('display');
                element.style.removeProperty('visibility');
                element.style.removeProperty('opacity');
                element.classList.remove('force-hidden-element', 'hidden-during-operation', 'being-removed');
              }
            });
          });
        }, 50);
      } catch (error) {
        logger.error('Error handling force visibility event:', { error }, 'controls error');
      }
    };
    
    window.addEventListener('reset-common-controls', handleResetEvent);
    window.addEventListener('force-control-visibility', handleForceVisibilityEvent as EventListener);
    
    // Listen for TaskEventEmitter events
    const handleTaskEvent = (event: { 
      type: string; 
      taskId: string; 
      data?: { 
        isStarting?: boolean; 
        operation?: string; 
        parentId?: string; 
        projectId?: string; 
        error?: unknown; 
      } 
    }) => {
      // Handle regenerate/delete events
      if (['regenerate', 'regenerateComplete', 'delete', 'deleteComplete'].includes(event.type)) {
        logDebug(`Task event received: ${event.type}`, { 
          taskId: event.taskId,
          hasData: !!event.data
        });
        
        // For delete starting, disable controls and show loading state
        if (event.type === 'delete' && event.data?.isStarting) {
          // Set mode to inactive to prevent further clicks during deletion
          document.body.classList.add('controls-disabled');
          
          // If we're in delete mode, show loading state on the control
          if (activeMode === 'delete') {
            const controlId = `delete-control-${event.taskId}`;
            const controlElement = document.getElementById(controlId);
            
            if (controlElement) {
              logDebug('Showing loading state on delete control', { 
                taskId: event.taskId,
                controlId
              });
              showLoadingState(controlElement, true);
            }
          }
        }
        
        // Handle completion events
        if (event.type.endsWith('Complete')) {
          logDebug(`Operation complete event: ${event.type}`, {
            taskId: event.taskId
          });
          
          // Remove disabled class
          document.body.classList.remove('controls-disabled');
          
          // Reset active mode
          if (activeMode !== 'none') {
            resetMode();
          }
          
          // For deletion completion, make sure all controls are reset and container is collapsed
          if (event.type === 'deleteComplete') {
            logDebug('Delete complete, resetting all controls', {
              taskId: event.taskId
            });
            
            // Force reset expanded state
            dispatch({ type: 'SET_EXPANDED', payload: false });
            
            // Make sure active mode is reset
            activeModeRef.current = 'none';
            dispatch({ type: 'SET_MODE', payload: 'none' });
            
            // Clear any mode classes from body
            document.body.classList.remove('mode-regenerate', 'mode-delete');
            
            // Clear all SVG controls
            clearSvgControls();
            
            // Dispatch custom event to fully reset UI state
            window.dispatchEvent(new CustomEvent('task-deleted', {
              detail: {
                taskId: event.taskId,
                parentId: event.data?.parentId,
                projectId: event.data?.projectId
              }
            }));
            
            // Show split buttons again after a delay
            setTimeout(() => {
              document.querySelectorAll('.task-split-button').forEach(element => {
                (element as HTMLElement).style.display = '';
              });
            }, 100);
          }
        }
      }
      
      // Handle error events
      if (event.type === 'error' && event.data?.operation) {
        logDebug(`Error event received for operation: ${event.data.operation}`, {
          taskId: event.taskId,
          error: event.data.error
        });
        
        // Reset active mode and controls
        resetMode();
        
        // Remove any operation-specific classes
        document.body.classList.remove('controls-disabled');
        document.body.classList.remove('deletion-in-progress');
        document.body.classList.remove('mode-regenerate', 'mode-delete');
      }
    };
    
    // Subscribe to task events
    const unsubscribe = TaskEventEmitter.getInstance().addListener(handleTaskEvent);
    
    return () => {
      window.removeEventListener('reset-common-controls', handleResetEvent);
      window.removeEventListener('force-control-visibility', handleForceVisibilityEvent as EventListener);
      unsubscribe();
      
      // Reset active mode on unmount
      if (activeMode !== 'none') {
        resetMode();
      }
      
      // Cancel any pending animation frame
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [activeMode, expanded, logDebug]);

  /**
   * Clear all SVG controls
   */
  const clearSvgControls = useCallback(() => {
    try {
      logDebug('Clearing all SVG controls');
      
      // Get content layer from SVG controller
      const layers = svgController.getLayers();
      if (!layers) {
        logger.warn('SVG layers not available', {}, 'controls warning');
        return;
      }
      
      // Check for the active task being deleted
      const deletingTaskId = document.body.getAttribute('data-deleting-task');
      
      // More aggressive approach to find and remove all control elements
      // Use multiple methods to ensure complete removal
      
      // Method 1: D3 selection - find and remove all control elements by class
      const controlSelector = '.regenerate-control, .delete-control, g[class*="regenerate-control"], g[class*="delete-control"], [data-control-type="regenerate"], [data-control-type="delete"]';
      layers.controls.group.selectAll(controlSelector)
        .each(function() {
          const element = this as SVGElement;
          if (element.parentNode) {
            element.parentNode.removeChild(element);
          }
        });
      
      // Method 2: Direct DOM query - find and remove all control elements
      document.querySelectorAll('.regenerate-control, .delete-control, g.regenerate-control, g.delete-control').forEach(element => {
        if (element.parentNode) {
          element.parentNode.removeChild(element);
        }
      });
      
      // Method 3: Force hide any remaining controls with aggressive styling
      document.querySelectorAll('[id*="regenerate-control"], [id*="delete-control"], [class*="regenerate-control"], [class*="delete-control"]').forEach(element => {
        if (element instanceof HTMLElement || element instanceof SVGElement) {
          element.style.setProperty('display', 'none', 'important');
          element.style.setProperty('visibility', 'hidden', 'important');
          element.style.setProperty('opacity', '0', 'important');
          element.style.setProperty('pointer-events', 'none', 'important');
          element.classList.add('force-hidden-element');
          
          // If we can remove it, do so
          if (element.parentNode) {
            try {
              element.parentNode.removeChild(element);
            } catch (e) {
              // If removal fails, at least it's hidden
              logger.info('Failed to remove element, but it is hidden', { error: e }, 'controls cleanup');
            }
          }
        }
      });
      
      // Clear tracking map
      createdControlsRef.current.clear();
      
      // Collect all indicators of tasks being deleted
      const tasksBeingDeleted = new Set<string>();
      
      // Add the current actively deleting task ID from body attribute
      if (deletingTaskId) {
        tasksBeingDeleted.add(deletingTaskId);
      }
      
      // Find elements marked as being deleted or removed
      document.querySelectorAll([
        '.task-rect.being-removed', 
        '.task-rect.force-hidden-element',
        '.task-rect.being-deleted',
        '[data-being-deleted="true"]',
        '.task-rect[data-being-deleted="true"]',
        'g[id^="task-"].being-removed',
        'g[id^="task-"].force-hidden-element',
        'g[id^="task-"][data-being-deleted="true"]'
      ].join(',')).forEach(element => {
        const id = element.id?.replace('task-', '');
        if (id) {
          tasksBeingDeleted.add(id);
        }
      });
      
      // Also check for any tasks whose descendants are being deleted
      const tasksWithDescendantsBeingDeleted = new Set<string>();
      
      // Process all tasks in two passes for reliability
      // First pass - collect elements that should be hidden and those that can be shown
      const elementsToHide: HTMLElement[] = [];
      const elementsToShow: HTMLElement[] = [];
      
      document.querySelectorAll('.task-split-button, .counter-display, [data-task-id], g[data-task-id]').forEach(element => {
        const taskId = element.getAttribute('data-task-id');
        const htmlElement = element as HTMLElement;
        
        // Skip regenerate and delete controls - they should always be hidden when clearing
        if (element.classList.contains('regenerate-control') || 
            element.classList.contains('delete-control') ||
            (element.id && (element.id.includes('regenerate-control') || element.id.includes('delete-control')))) {
          elementsToHide.push(htmlElement);
          return;
        }
        
        // Check if this control belongs to a deleted task
        if (taskId && tasksBeingDeleted.has(taskId)) {
          elementsToHide.push(htmlElement);
        }
        // Check if element has any markers indicating it should be hidden
        else if (
          element.classList.contains('being-removed') || 
          element.classList.contains('force-hidden-element') ||
          element.classList.contains('hidden-during-operation') ||
          element.classList.contains('force-hidden-control') ||
          element.getAttribute('data-force-hidden') === 'true' ||
          element.getAttribute('data-being-removed-task') === 'true'
        ) {
          elementsToHide.push(htmlElement);
        }
        // For controls of tasks with descendants being deleted, temporarily hide them
        else if (taskId && tasksWithDescendantsBeingDeleted.has(taskId)) {
          elementsToHide.push(htmlElement);
        }
        // Otherwise, this control can be shown
        else {
          // But only if it's not a regenerate or delete control
          if (!element.classList.contains('regenerate-control') && 
              !element.classList.contains('delete-control')) {
            elementsToShow.push(htmlElement);
          }
        }
      });
      
      // Second pass - apply appropriate styles
      // Hide elements
      if (elementsToHide.length > 0) {
        elementsToHide.forEach(element => {
          // Add all marker classes
          element.classList.add('force-hidden-control');
          element.classList.add('force-hidden-element');
          element.classList.add('hidden-during-operation');
          element.setAttribute('data-force-hidden', 'true');
          
          // Apply inline styles with !important for maximum specificity
          element.style.setProperty('display', 'none', 'important');
          element.style.setProperty('visibility', 'hidden', 'important');
          element.style.setProperty('opacity', '0', 'important');
          element.style.setProperty('pointer-events', 'none', 'important');
          element.style.setProperty('position', 'absolute', 'important');
          element.style.setProperty('z-index', '-9999', 'important');
          element.style.setProperty('width', '0', 'important');
          element.style.setProperty('height', '0', 'important');
          element.style.setProperty('overflow', 'hidden', 'important');
        });
      }
      
      // Show other elements, but only if they're not regenerate or delete controls
      if (elementsToShow.length > 0) {
        elementsToShow.forEach(element => {
          // Make sure this isn't a control we're trying to hide
          if (!element.classList.contains('regenerate-control') && 
              !element.classList.contains('delete-control') &&
              !(element.id && (element.id.includes('regenerate-control') || element.id.includes('delete-control')))) {
            element.style.removeProperty('display');
            element.style.removeProperty('visibility');
            element.style.removeProperty('opacity');
          }
        });
      }
      
      // One final check for the controls layer to ensure it's clean
      if (layers.controls && layers.controls.group) {
        try {
          // Try to remove all regenerate and delete controls
          const controlElements = layers.controls.group.selectAll('.regenerate-control, .delete-control').nodes();
          controlElements.forEach((node) => {
            // Type guard to check if node is an SVGElement or HTMLElement with parentNode
            if (node && 'parentNode' in node && node.parentNode) {
              node.parentNode.removeChild(node);
            }
          });
        } catch (error) {
          logger.error('Error during final cleanup of control elements', { error }, 'controls cleanup');
        }
      }
    } catch (error) {
      logger.error('Error clearing SVG controls', { 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      }, 'controls error');
    }
  }, [logDebug]);
  
  /**
   * Reset mode and related UI elements
   */
  const resetMode = useCallback(() => {
    logDebug('Resetting mode', { currentMode: activeMode });
    
    // Skip if already in none mode
    if (activeMode === 'none') {
      return;
    }
    
    // Store the current mode before resetting
    const prevMode = activeMode;
    
    // Update ref immediately
    activeModeRef.current = 'none';
    
    // Update container data attribute for CSS targeting
    if (containerRef.current) {
      containerRef.current.setAttribute('data-active-mode', 'none');
      
      // Update button styling for immediate visual feedback
      const regenerateButton = containerRef.current.querySelector('[data-mode="regenerate"]');
      const deleteButton = containerRef.current.querySelector('[data-mode="delete"]');
      
      if (regenerateButton && deleteButton) {
        // Reset regenerate button
        regenerateButton.classList.remove('bg-blue-500', 'text-white', 'regenerate-active');
        regenerateButton.classList.add('bg-gray-100', 'hover:bg-gray-200', 'text-gray-700');
        
        // Reset delete button
        deleteButton.classList.remove('bg-red-500', 'text-white', 'delete-active');
        deleteButton.classList.add('bg-gray-100', 'hover:bg-gray-200', 'text-gray-700');
      }
    }
    
    // Cancel any pending animation frame
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    
    // Remove mode classes from body
    document.body.classList.remove('mode-regenerate', 'mode-delete');
    
    // Aggressively remove all SVG controls
    try {
      // First find and remove all existing controls
      clearSvgControls();
      
      // Get layers for more targeted cleanup
      const layers = svgController.getLayers();
      if (layers && layers.controls) {
        // Direct cleanup of controls layer
        const controlsToRemove = layers.controls.group.selectAll(`.${prevMode}-control, [data-control-type="${prevMode}"]`).nodes();
        if (controlsToRemove && controlsToRemove.length > 0) {
          controlsToRemove.forEach((node) => {
            // Type guard to check if node is an SVGElement or HTMLElement with parentNode
            if (node && 'parentNode' in node && node.parentNode) {
              node.parentNode.removeChild(node);
            }
          });
        }
      }
      
      // Also remove them from the DOM directly
      document.querySelectorAll(`.regenerate-control, .delete-control, .${prevMode}-control`).forEach(element => {
        if (element.parentNode) {
          element.parentNode.removeChild(element);
        }
      });
    } catch (error) {
      logger.error('Error during aggressive control cleanup', { error }, 'controls cleanup');
    }
    
    // Get visible tasks
    const state = workspaceStateManager.getState();
    const visibleTaskIds: string[] = [];
    
    state.taskVisualStates.forEach((visualState, taskId) => {
      if (visualState === 'active' || visualState === 'semi-transparent') {
        visibleTaskIds.push(taskId);
      }
    });
    
    // Get the task ID being deleted, if any
    const deletingTaskId = document.body.getAttribute('data-deleting-task');
    
    // Show split buttons again, but exclude those from tasks being deleted
    document.querySelectorAll('.task-split-button:not(.being-removed):not(.force-hidden-element)').forEach(element => {
      // Make sure the task this control belongs to isn't being deleted
      const taskId = element.getAttribute('data-task-id');
      if (taskId) {
        // Immediate check for the current deleting task
        if (deletingTaskId && taskId === deletingTaskId) {
          // Aggressively keep hidden
          (element as HTMLElement).style.setProperty('display', 'none', 'important');
          (element as HTMLElement).style.setProperty('visibility', 'hidden', 'important');
          (element as HTMLElement).style.setProperty('opacity', '0', 'important');
          element.classList.add('hidden-during-operation');
          element.classList.add('force-hidden-control');
          element.setAttribute('data-force-hidden', 'true');
          return; // Early return from forEach callback
        }
        
        // Check if the task element exists and isn't being removed
        const taskElement = document.getElementById(`task-${taskId}`);
        if (taskElement && 
            !taskElement.classList.contains('being-removed') && 
            !taskElement.classList.contains('force-hidden-element') &&
            !taskElement.classList.contains('being-deleted') &&
            !taskElement.hasAttribute('data-being-deleted')) {
          (element as HTMLElement).style.removeProperty('display');
          (element as HTMLElement).style.removeProperty('visibility');
          (element as HTMLElement).style.removeProperty('opacity');
        } else {
          // Keep hidden if task is being removed
          (element as HTMLElement).style.setProperty('display', 'none', 'important');
          (element as HTMLElement).style.setProperty('visibility', 'hidden', 'important');
          (element as HTMLElement).style.setProperty('opacity', '0', 'important');
          element.classList.add('hidden-during-operation');
          element.classList.add('force-hidden-control');
        }
      } else {
        // If no task ID, just make it visible
        (element as HTMLElement).style.removeProperty('display');
        (element as HTMLElement).style.removeProperty('visibility');
        (element as HTMLElement).style.removeProperty('opacity');
      }
    });
    
    // Animate tasks back to active state with more direct approach
    if (visibleTaskIds.length > 0) {
      logDebug('Restoring task opacity', { count: visibleTaskIds.length });
      
      visibleTaskIds.forEach(taskId => {
        const taskElement = document.getElementById(`task-${taskId}`);
        if (taskElement) {
          // Reset data-state
          taskElement.setAttribute('data-state', 'active');
          
          // Remove semi-transparent class
          taskElement.classList.remove('semi-transparent-task');
          
          // Reset rect opacity directly
          const rect = taskElement.querySelector('rect');
          if (rect) {
            rect.style.removeProperty('opacity');
          }
          
          // Reset group opacity
          taskElement.style.removeProperty('opacity');
          
          // Use animation coordinator
          try {
            if (taskElement instanceof SVGElement) {
              animationCoordinator.animateStateChange(
                taskElement,
                'active',
                { duration: 300 }
              );
            } else {
              const svgElement = taskElement.querySelector('g') as SVGGElement;
              if (svgElement) {
                animationCoordinator.animateStateChange(
                  svgElement,
                  'active',
                  { duration: 300 }
                );
              } else {
                animationCoordinator.animateStateChange(
                  taskElement as unknown as SVGElement,
                  'active',
                  { duration: 300 }
                );
              }
            }
          } catch (error) {
            logger.error(`Error restoring task ${taskId} opacity`, { error }, 'controls animation');
          }
        }
      });
    }
    
    // Update state
    dispatch({ type: 'SET_MODE', payload: 'none' });
    
    // Dispatch an event to notify other components
    window.dispatchEvent(new CustomEvent('controls-mode-reset'));
    
    logDebug('Mode reset complete');
  }, [activeMode, logDebug, clearSvgControls]);
  
  /**
   * Helper function to set a mode active
   * Extracted to avoid code duplication and ensure consistent mode activation
   */
  const setModeActive = useCallback((mode: ControlMode) => {
    if (mode === 'none') return;
    
    logDebug('Setting mode active', { mode });
    
    // Clear any existing controls
    clearSvgControls();
    
    // Update activeMode ref immediately to prevent race conditions
    activeModeRef.current = mode;
    
    // Add mode classes to body
    document.body.classList.remove('mode-regenerate', 'mode-delete');
    document.body.classList.add(`mode-${mode}`);
    
    // Directly update button styling for immediate visual feedback
    const container = containerRef.current;
    if (container) {
      container.setAttribute('data-active-mode', mode);
      
      const regenerateButton = container.querySelector('[data-mode="regenerate"]');
      const deleteButton = container.querySelector('[data-mode="delete"]');
      
      if (regenerateButton && deleteButton) {
        // Apply styles based on the new mode
        if (mode === 'regenerate') {
          regenerateButton.classList.add('bg-blue-500', 'text-white', 'regenerate-active');
          regenerateButton.classList.remove('bg-gray-100', 'hover:bg-gray-200', 'text-gray-700');
          
          deleteButton.classList.remove('bg-red-500', 'text-white', 'delete-active');
          deleteButton.classList.add('bg-gray-100', 'hover:bg-gray-200', 'text-gray-700');
        } 
        else if (mode === 'delete') {
          deleteButton.classList.add('bg-red-500', 'text-white', 'delete-active');
          deleteButton.classList.remove('bg-gray-100', 'hover:bg-gray-200', 'text-gray-700');
          
          regenerateButton.classList.remove('bg-blue-500', 'text-white', 'regenerate-active');
          regenerateButton.classList.add('bg-gray-100', 'hover:bg-gray-200', 'text-gray-700');
        }
      }
    }
    
    // Update mode in state after visual update
    dispatch({ type: 'SET_MODE', payload: mode });
    
    // Get visible tasks
    const state = workspaceStateManager.getState();
    const visibleTaskIds: string[] = [];
    
    state.taskVisualStates.forEach((visualState, taskId) => {
      if (visualState === 'active') {
        visibleTaskIds.push(taskId);
      }
    });
    
    // Hide all split buttons
    document.querySelectorAll('.task-split-button').forEach(element => {
      (element as HTMLElement).style.display = 'none';
    });
    
    // Apply semi-transparent state to tasks
    if (visibleTaskIds.length > 0) {
      logDebug('Animating tasks to semi-transparent state', { count: visibleTaskIds.length });
      
      // Use a stronger approach to ensure task opacity changes are applied
      visibleTaskIds.forEach(taskId => {
        // Direct DOM manipulation for immediate visual feedback
        const taskElement = document.getElementById(`task-${taskId}`);
        if (taskElement) {
          // Add semi-transparent state directly
          taskElement.setAttribute('data-state', 'semi-transparent');
          
          // Find task rectangle and apply opacity directly
          const rect = taskElement.querySelector('rect');
          if (rect) {
            rect.style.opacity = '0.6';
          }
          
          // Apply additional semi-transparent class
          taskElement.classList.add('semi-transparent-task');
          
          // Also use animation coordinator for proper animation
          try {
            // Check if the element is an SVG element or safely cast if we're sure it's an SVG
            if (taskElement instanceof SVGElement) {
              // Direct use if it's already an SVG element
              animationCoordinator.animateStateChange(
                taskElement,
                'semi-transparent',
                { duration: 300 }
              );
            } else {
              // Find the actual SVG element if we have an HTML container
              const svgElement = taskElement.querySelector('g') as SVGGElement;
              if (svgElement) {
                animationCoordinator.animateStateChange(
                  svgElement,
                  'semi-transparent',
                  { duration: 300 }
                );
              } else {
                // Safer cast through unknown when we're confident element is SVG-like
                animationCoordinator.animateStateChange(
                  taskElement as unknown as SVGElement,
                  'semi-transparent',
                  { duration: 300 }
                );
              }
            }
          } catch (error) {
            logger.error(`Error animating task ${taskId}`, { error }, 'controls animation');
          }
        }
      });
    }
    
    // Create SVG controls with a small delay
    setTimeout(() => {
      // Clear tracking map
      createdControlsRef.current.clear();
      
      // Create controls for each visible task
      visibleTaskIds.forEach(taskId => {
        createSvgControl(taskId, mode);
      });
      
      // One final check to ensure button styling is still correct after other operations
      if (container) {
        const regenerateButton = container.querySelector('[data-mode="regenerate"]');
        const deleteButton = container.querySelector('[data-mode="delete"]');
        
        if (regenerateButton && deleteButton) {
          // Re-apply styles in case they were overridden
          if (mode === 'regenerate') {
            regenerateButton.classList.add('bg-blue-500', 'text-white', 'regenerate-active');
            regenerateButton.classList.remove('bg-gray-100', 'hover:bg-gray-200', 'text-gray-700');
          } 
          else if (mode === 'delete') {
            deleteButton.classList.add('bg-red-500', 'text-white', 'delete-active');
            deleteButton.classList.remove('bg-gray-100', 'hover:bg-gray-200', 'text-gray-700');
          }
        }
      }
      
      // Ensure tasks remain semi-transparent
      visibleTaskIds.forEach(taskId => {
        const taskElement = document.getElementById(`task-${taskId}`);
        if (taskElement) {
          taskElement.setAttribute('data-state', 'semi-transparent');
        }
      });
    }, 100);
  }, [clearSvgControls, logDebug]);
  
  /**
   * Handle mode toggle
   */
  const handleModeToggle = useCallback((e: React.MouseEvent, mode: ControlMode) => {
    // Stop event propagation
    e.stopPropagation();
    e.preventDefault();
    
    // Skip during transitions
    if (isTransitioning) return;
    
    logDebug('Mode toggle initiated', { currentMode: activeMode, requestedMode: mode });
    
    // If same mode clicked, reset mode
    if (activeMode === mode) {
      resetMode();
      return;
    }
    
    // Always expand when setting a mode
    if (!expanded) {
      dispatch({ type: 'SET_EXPANDED', payload: true });
    }
    
    // IMPORTANT: If there's an active mode, reset it first before setting a new one
    if (activeMode !== 'none') {
      logDebug('Resetting current active mode before setting new mode', { currentMode: activeMode });
      
      // First reset the current mode completely
      resetMode();
      
      // Give it a moment to complete the reset
      setTimeout(() => {
        // Now proceed with setting the new mode
        setModeActive(mode);
      }, 50);
    } else {
      // If no active mode, directly set the new mode
      setModeActive(mode);
    }
  }, [activeMode, expanded, isTransitioning, resetMode, setModeActive, logDebug]);
  
  /**
   * Toggle expanded state with preventions for accidental mode resets
   */
  const handleToggleExpand = useCallback(() => {
    // Skip during transitions
    if (isTransitioning) return;
    
    logDebug('Toggle expand initiated', { currentExpanded: expanded, activeMode });
    
    // If expanding, just expand
    if (!expanded) {
      dispatch({ type: 'TOGGLE_PANEL' });
      return;
    }
    
    // If collapsing with active mode, completely reset mode first
    if (expanded && activeMode !== 'none') {
      logDebug('Container being collapsed with active mode - ensuring full reset');
      
      // First try to directly trigger a click on the active mode button
      // This is the cleanest way to ensure proper mode toggling
      try {
        const container = containerRef.current;
        if (container) {
          // Find the currently active button
          const activeButton = container.querySelector(`[data-mode="${activeMode}"]`) as HTMLElement;
          if (activeButton) {
            logDebug('Triggering click on active mode button', { mode: activeMode });
            
            // Create a click event
            const clickEvent = new MouseEvent('click', {
              bubbles: true,
              cancelable: true,
              view: window
            });
            
            // Dispatch event on the button - this will trigger the normal mode toggle handler
            activeButton.dispatchEvent(clickEvent);
            
            // Wait a moment for the click to be processed
            setTimeout(() => {
              // Verify mode was reset
              if (activeModeRef.current !== 'none') {
                logDebug('Click did not reset mode, forcing reset', { currentMode: activeModeRef.current });
                resetMode();
              }
              
              // Now collapse the panel
              dispatch({ type: 'TOGGLE_PANEL' });
            }, 50);
            
            // Return early since we're handling the toggle asynchronously
            return;
          }
        }
      } catch (error) {
        logger.error('Error triggering mode button click', { error }, 'controls interaction');
        // Continue with manual reset as fallback
      }
      
      // Direct approach if the button click method fails
      try {
        // Force a complete reset of the active mode
        resetMode();
        
        // Force additional cleanup
        clearSvgControls();
        
        // Remove all controls directly from the DOM
        document.querySelectorAll('.regenerate-control, .delete-control').forEach(control => {
          if (control.parentNode) {
            control.parentNode.removeChild(control);
          }
        });
        
        // Get all active or semi-transparent tasks
        const state = workspaceStateManager.getState();
        const visibleTaskIds: string[] = [];
        
        state.taskVisualStates.forEach((visualState, taskId) => {
          if (visualState === 'active' || visualState === 'semi-transparent') {
            visibleTaskIds.push(taskId);
          }
        });
        
        // Restore task opacity directly
        visibleTaskIds.forEach(taskId => {
          const taskElement = document.getElementById(`task-${taskId}`);
          if (taskElement) {
            // Reset data state
            taskElement.setAttribute('data-state', 'active');
            
            // Remove semi-transparent class
            taskElement.classList.remove('semi-transparent-task');
            
            // Reset rect opacity
            const rect = taskElement.querySelector('rect');
            if (rect) {
              rect.style.removeProperty('opacity');
            }
            
            // Reset group opacity
            taskElement.style.removeProperty('opacity');
          }
        });
        
        // Show split buttons again
        document.querySelectorAll('.task-split-button:not(.being-removed):not(.force-hidden-element)').forEach(button => {
          if (button instanceof HTMLElement) {
            button.style.removeProperty('display');
            button.style.removeProperty('visibility');
            button.style.removeProperty('opacity');
          }
        });
        
        // Remove mode classes from body
        document.body.classList.remove('mode-regenerate', 'mode-delete');
        
        // Ensure activeMode is set to none
        activeModeRef.current = 'none';
        dispatch({ type: 'SET_MODE', payload: 'none' });
        
        // Update container state
        if (containerRef.current) {
          containerRef.current.setAttribute('data-active-mode', 'none');
        }
      } catch (error) {
        logger.error('Error during expanded mode reset', { error }, 'controls error');
      }
    }
    
    // Toggle panel state
    dispatch({ type: 'TOGGLE_PANEL' });
  }, [expanded, activeMode, isTransitioning, resetMode, clearSvgControls, logDebug]);
  
  /**
   * Animate tasks to a specific state
   */
  const animateTasksToState = useCallback((taskIds: string[], state: TaskVisualState) => {
    logDebug(`Animating ${taskIds.length} tasks to ${state} state`);
    
    taskIds.forEach(taskId => {
      try {
        // Get task element
        const taskElement = document.getElementById(`task-${taskId}`);
        if (!taskElement) {
          logDebug(`Task element not found for ID: ${taskId}`);
          return;
        }
        
        // Set data-state attribute for CSS targeting
        taskElement.setAttribute('data-state', state);
        
        // Apply direct styling for immediate effect
        if (state === 'semi-transparent') {
          // Add class for CSS targeting
          taskElement.classList.add('semi-transparent-task');
          
          // Apply opacity directly to the rectangle
          const rect = taskElement.querySelector('rect');
          if (rect) {
            rect.style.opacity = '0.6';
          }
          
          // Ensure the group is visible but semi-transparent
          taskElement.style.opacity = '0.8';
          taskElement.style.visibility = 'visible';
        } else if (state === 'active') {
          // Remove semi-transparent class
          taskElement.classList.remove('semi-transparent-task');
          
          // Reset opacity
          const rect = taskElement.querySelector('rect');
          if (rect) {
            rect.style.removeProperty('opacity');
          }
          
          // Ensure the group is fully visible
          taskElement.style.removeProperty('opacity');
          taskElement.style.visibility = 'visible';
        } else if (state === 'hidden') {
          // Hide the element
          taskElement.style.opacity = '0';
          taskElement.style.visibility = 'hidden';
        }
        
        // Use animation coordinator for proper animation
        if (taskElement instanceof SVGElement) {
          // Direct use if it's already an SVG element
          animationCoordinator.animateStateChange(
            taskElement,
            state,
            { duration: 300 }
          );
        } else {
          // Find the actual SVG element if we have an HTML container
          const svgElement = taskElement.querySelector('g') as SVGGElement;
          if (svgElement) {
            animationCoordinator.animateStateChange(
              svgElement,
              state,
              { duration: 300 }
            );
          } else {
            // Safer cast through unknown when we're confident element is SVG-like
            try {
              animationCoordinator.animateStateChange(
                taskElement as unknown as SVGElement,
                state,
                { duration: 300 }
              );
            } catch (err) {
              logger.error(`Failed to animate element using type cast`, {
                taskId,
                state,
                error: err
              }, 'controls animation');
            }
          }
        }
        
        logDebug(`Applied ${state} state to task ${taskId}`);
      } catch (error) {
        logger.error(`Error animating task ${taskId} to ${state} state`, {
          error: error instanceof Error ? error.message : String(error)
        }, 'controls animation');
      }
    });
  }, [logDebug]);
  
  /**
   * Create a control using native SVG elements with improved position calculation
   */
  const createSvgControl = useCallback((taskId: string, mode: ControlMode) => {
    try {
      // Verify mode is valid
      if (mode === 'none') {
        logger.warn('Attempted to create control with none mode', {}, 'controls warning');
        return null;
      }
      
      // Get layers from SVG controller
      const layers = svgController.getLayers();
      if (!layers) {
        logger.warn('SVG layers not available', {}, 'controls warning');
        return null;
      }
      
      // Create a unique ID for this control
      const controlId = getSvgControlId(taskId, mode as 'regenerate' | 'delete');
      
      // Skip if control already exists
      if (createdControlsRef.current.has(controlId)) {
        return null;
      }
      
      // Find the task element
      const taskElement = document.getElementById(`task-${taskId}`);
      if (!taskElement) {
        return null;
      }
      
      // Get task position in SVG coordinates
      let taskX = 0, taskY = 0;
      
      // Try with the transform attribute
      const taskTransform = taskElement.getAttribute('transform');
      if (taskTransform) {
        const match = taskTransform.match(/translate\(([^,]+),([^)]+)\)/);
        if (match && match.length >= 3) {
          taskX = parseFloat(match[1]);
          taskY = parseFloat(match[2]);
        }
      }
      
      // If we couldn't get position from transform, use the first rect element's position
      if (taskX === 0 && taskY === 0) {
        const taskRect = taskElement.querySelector('rect');
        if (taskRect) {
          taskX = parseFloat(taskRect.getAttribute('x') || '0');
          taskY = parseFloat(taskRect.getAttribute('y') || '0');
        }
      }
      
      // Get task dimensions from the first rect
      const taskRectElement = taskElement.querySelector('rect');
      const width = parseFloat(taskRectElement?.getAttribute('width') || '240');
      const height = parseFloat(taskRectElement?.getAttribute('height') || '120');
      
      // Calculate control position (center of task)
      const x = taskX + (width / 2) + 5; // Added 5px correction
      const y = taskY + height + 25; // Position below the task
      
      // Create control group with pointer-events enabled
      const controlGroup = layers.controls.group.append('g')
        .attr('id', controlId)
        .attr('class', `${mode}-control svg-task-control`)
        .attr('data-task-id', taskId)
        .attr('transform', `translate(${x}, ${y})`)
        .style('cursor', 'pointer')
        .style('pointer-events', 'all');
      
      // Create background circle
      const bgColor = mode === 'regenerate' ? '#3b82f6' : '#ef4444';
      const borderColor = mode === 'regenerate' ? '#2563eb' : '#dc2626';
      
      controlGroup.append('circle')
        .attr('r', 15)
        .attr('fill', bgColor)
        .attr('stroke', borderColor)
        .attr('stroke-width', 2);
      
      // Add icon based on mode
      if (mode === 'regenerate') {
        // Regenerate icon (refresh)
        controlGroup.append('path')
          .attr('d', 'M0,-8 A8,8 0 1,1 -5,6 M-5,6 L-8,3 L-3,2')
          .attr('fill', 'none')
          .attr('stroke', 'white')
          .attr('stroke-width', 2)
          .attr('stroke-linecap', 'round')
          .attr('stroke-linejoin', 'round');
      } else {
        // Delete icon (trash)
        controlGroup.append('rect')
          .attr('x', -6)
          .attr('y', -7)
          .attr('width', 12)
          .attr('height', 14)
          .attr('rx', 1)
          .attr('fill', 'none')
          .attr('stroke', 'white')
          .attr('stroke-width', 1.5);
          
        controlGroup.append('path')
          .attr('d', 'M-8,-7 H8')
          .attr('fill', 'none')
          .attr('stroke', 'white')
          .attr('stroke-width', 1.5);
          
        controlGroup.append('path')
          .attr('d', 'M-3,-10 V-7 M3,-10 V-7')
          .attr('fill', 'none')
          .attr('stroke', 'white')
          .attr('stroke-width', 1.5);
          
        controlGroup.append('path')
          .attr('d', 'M-3,-3 V5 M3,-3 V5')
          .attr('fill', 'none')
          .attr('stroke', 'white')
          .attr('stroke-width', 1.5);
      }
      
      // Add invisible click target with larger radius
      controlGroup.append('circle')
        .attr('r', 20)
        .attr('fill', 'transparent')
        .style('cursor', 'pointer')
        .style('pointer-events', 'all');
      
      // Track this control as created
      createdControlsRef.current.set(controlId, true);
      
      // Add click event using explicit data binding and event handler
      controlGroup.on('click', function(event) {
        // Stop propagation
        event.stopPropagation();
        
        // Call appropriate handler based on mode
        try {
          // Show loading state
          const element = document.getElementById(controlId);
          if (element) {
            showLoadingState(element, true);
          }
          
          if (mode === 'regenerate') {
            // Add regeneration-in-progress class
            document.body.classList.add('regeneration-in-progress');
            
            taskControlEventDispatcher.handleRegenerate(taskId)
              .then(() => {
                // Remove regeneration-in-progress class
                document.body.classList.remove('regeneration-in-progress');
                resetMode();
              })
              .catch(error => {
                logger.error('Error during regenerate operation', { 
                  taskId, 
                  error: error instanceof Error ? error.message : String(error)
                }, 'controls task-operation');
                const element = document.getElementById(controlId);
                if (element) {
                  showLoadingState(element, false);
                }
                // Remove regeneration-in-progress class even on error
                document.body.classList.remove('regeneration-in-progress');
              });
          } else if (mode === 'delete') {
            // Add deletion-in-progress class
            document.body.classList.add('deletion-in-progress');
            
            taskControlEventDispatcher.handleDelete(taskId)
              .then(() => {
                // Remove deletion-in-progress class
                document.body.classList.remove('deletion-in-progress');
                resetMode();
              })
              .catch(error => {
                logger.error('Error during delete operation', { 
                  taskId, 
                  error: error instanceof Error ? error.message : String(error)
                }, 'controls task-operation');
                const element = document.getElementById(controlId);
                if (element) {
                  showLoadingState(element, false);
                }
                // Remove deletion-in-progress class even on error
                document.body.classList.remove('deletion-in-progress');
              });
          }
        } catch (error) {
          logger.error(`Error handling ${mode} click`, { 
            taskId, 
            error: error instanceof Error ? error.message : String(error)
          }, 'controls interaction');
          const element = document.getElementById(controlId);
          if (element) {
            showLoadingState(element, false);
          }
        }
      });
      
      // Add hover effects
      controlGroup
        .on('mouseenter', function() {
          select(this).select('circle').transition().duration(200).attr('r', 17);
        })
        .on('mouseleave', function() {
          select(this).select('circle').transition().duration(200).attr('r', 15);
        });
      
      return controlGroup.node();
    } catch (error) {
      logger.error('Error creating SVG control', { 
        taskId, 
        mode, 
        error: error instanceof Error ? error.message : String(error)
      }, 'controls error');
      return null;
    }
  }, [resetMode, logDebug]);
  
  /**
   * Show loading state for a control
   */
  const showLoadingState = useCallback((element: string | Element, isLoading: boolean): void => {
    try {
      // Convert element to DOM element if it's a string
      const controlElement = typeof element === 'string' 
        ? document.querySelector(element.startsWith('#') ? element : `#${element}`) 
        : element;
        
      if (!controlElement) {
        return;
      }
      
      // Get control ID and type
      const controlId = controlElement.id || '';
      const isRegenerateControl = controlId.includes('regenerate');
      const isDeleteControl = controlId.includes('delete');
      const dataTaskId = controlElement.getAttribute('data-task-id') || '';
      
      if (isLoading) {
        // Remove all child elements
        while (controlElement.firstChild) {
          controlElement.removeChild(controlElement.firstChild);
        }
        
        // Create SVG elements manually
        const xmlns = "http://www.w3.org/2000/svg";
        
        // Create background circle
        const circle = document.createElementNS(xmlns, "circle");
        circle.setAttribute("r", "14");
        circle.setAttribute("fill", isRegenerateControl ? '#3b82f6' : '#ef4444');
        controlElement.appendChild(circle);
        
        // Create spinner
        const spinnerRadius = 6;
        const spinner = document.createElementNS(xmlns, "circle");
        spinner.setAttribute("r", spinnerRadius.toString());
        spinner.setAttribute("cx", "0");
        spinner.setAttribute("cy", "0");
        spinner.setAttribute("fill", "none");
        spinner.setAttribute("stroke", "white");
        spinner.setAttribute("stroke-width", "2");
        spinner.setAttribute("stroke-dasharray", 
          `${Math.PI * spinnerRadius / 2} ${Math.PI * spinnerRadius}`);
        
        // Create animation
        const anim = document.createElementNS(xmlns, "animateTransform");
        anim.setAttribute("attributeName", "transform");
        anim.setAttribute("type", "rotate");
        anim.setAttribute("from", "0 0 0");
        anim.setAttribute("to", "360 0 0");
        anim.setAttribute("dur", "1s");
        anim.setAttribute("repeatCount", "indefinite");
        
        spinner.appendChild(anim);
        controlElement.appendChild(spinner);
      } else {
        // Remove all existing children
        while (controlElement.firstChild) {
          controlElement.removeChild(controlElement.firstChild);
        }
        
        const xmlns = "http://www.w3.org/2000/svg";
        
        // For regenerate controls
        if (isRegenerateControl) {
          // Background circle
          const circle = document.createElementNS(xmlns, "circle");
          circle.setAttribute("r", "14");
          circle.setAttribute("fill", "#3b82f6");
          circle.setAttribute("stroke", "#2563eb");
          circle.setAttribute("stroke-width", "1");
          controlElement.appendChild(circle);
          
          // Create the arrow path
          const path = document.createElementNS(xmlns, "path");
          path.setAttribute("d", "M0,-6 A6,6 0 1,1 -3.5,5 M-3.5,5 L-6,3 L-2,2");
          path.setAttribute("fill", "none");
          path.setAttribute("stroke", "white");
          path.setAttribute("stroke-width", "2");
          path.setAttribute("stroke-linecap", "round");
          path.setAttribute("stroke-linejoin", "round");
          controlElement.appendChild(path);
        }
        // For delete controls
        else if (isDeleteControl) {
          // Background circle
          const circle = document.createElementNS(xmlns, "circle");
          circle.setAttribute("r", "14");
          circle.setAttribute("fill", "#ef4444");
          circle.setAttribute("stroke", "#dc2626");
          circle.setAttribute("stroke-width", "1");
          controlElement.appendChild(circle);
          
          // Trash icon elements
          const rect = document.createElementNS(xmlns, "rect");
          rect.setAttribute("x", "-6");
          rect.setAttribute("y", "-7");
          rect.setAttribute("width", "12");
          rect.setAttribute("height", "14");
          rect.setAttribute("rx", "1");
          rect.setAttribute("fill", "none");
          rect.setAttribute("stroke", "white");
          rect.setAttribute("stroke-width", "1.5");
          controlElement.appendChild(rect);
          
          const hLine = document.createElementNS(xmlns, "path");
          hLine.setAttribute("d", "M-8,-7 H8");
          hLine.setAttribute("fill", "none");
          hLine.setAttribute("stroke", "white");
          hLine.setAttribute("stroke-width", "1.5");
          controlElement.appendChild(hLine);
          
          const handles = document.createElementNS(xmlns, "path");
          handles.setAttribute("d", "M-3,-10 V-7 M3,-10 V-7");
          handles.setAttribute("fill", "none");
          handles.setAttribute("stroke", "white");
          handles.setAttribute("stroke-width", "1.5");
          controlElement.appendChild(handles);
          
          const lines = document.createElementNS(xmlns, "path");
          lines.setAttribute("d", "M-3,-3 V3 M3,-3 V3");
          lines.setAttribute("fill", "none");
          lines.setAttribute("stroke", "white");
          lines.setAttribute("stroke-width", "1.5");
          controlElement.appendChild(lines);
        }
        // For regular split controls
        else if (dataTaskId && controlsRef.current) {
          // Create split control
          controlsRef.current.render(controlElement as SVGGElement, {
            id: dataTaskId,
            type: 'split',
            state: 'active',
            position: { x: 0, y: 0 }
          });
        }
      }
    } catch (error) {
      logger.error('Failed to update loading state', { 
        element: typeof element === 'string' ? element : element.id,
        error 
      }, 'controls error');
    }
  }, []);

  return (<div 
    ref={containerRef}
    className={`fixed top-[70px] right-0 z-[9999] flex flex-col items-center common-controls-container shadow-lg ${className}`}
    style={{ position: 'fixed' }}
    data-expanded={expanded ? 'true' : 'false'}
    data-active-mode={activeMode}
  >{/* Main toggle button */}<button
      className="bg-white p-2 rounded-full hover:bg-gray-100 transition-colors"
      onClick={handleToggleExpand}
      title="Common controls"
      data-testid="common-controls-toggle"
    ><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="7" r="4" /><circle cx="12" cy="17" r="4" /></svg></button>
      
      {/* Controls container - for better debugging and isolation, add the zIndex here */}
      <div 
        id="common-controls-panel"
        className={`transition-all duration-300 ease-in-out overflow-hidden bg-white rounded-lg shadow-lg mt-2 common-controls-panel ${
          expanded ? 'max-h-28 p-2 opacity-100' : 'max-h-0 p-0 opacity-0 pointer-events-none'
        }`}
        style={{ zIndex: 50 }}
        data-testid="common-controls-panel"
      >
        {/* Regenerate button */}
        <button
          className={`mb-2 p-2 rounded-full w-10 h-10 flex items-center justify-center transition-colors ${
            activeMode === 'regenerate' 
              ? 'bg-blue-500 text-white regenerate-active' 
              : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
          }`}
          onClick={(e) => handleModeToggle(e, 'regenerate')}
          data-mode="regenerate"
          title="Toggle regenerate controls"
          aria-pressed={activeMode === 'regenerate'}
          data-testid="regenerate-mode-button"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
            <path d="M8 16H3v5" />
          </svg>
        </button>
        
        {/* Delete button */}
        <button
          className={`p-2 rounded-full w-10 h-10 flex items-center justify-center transition-colors ${
            activeMode === 'delete' 
              ? 'bg-red-500 text-white delete-active' 
              : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
          }`}
          onClick={(e) => handleModeToggle(e, 'delete')}
          data-mode="delete"
          title="Toggle delete controls"
          aria-pressed={activeMode === 'delete'}
          data-testid="delete-mode-button"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18" />
            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
            <line x1="10" y1="11" x2="10" y2="17" />
            <line x1="14" y1="11" x2="14" y2="17" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default CommonControlsGroup;
