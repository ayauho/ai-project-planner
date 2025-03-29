'use client';

import { logger } from '@/lib/client/logger';
import { svgController } from '@/components/workspace/visual/services/svg-controller';
import { TaskEventEmitter } from '../task/events';
import { Rectangle } from '@/components/workspace/visual/utils/geometry';
import { CONTROLLER_STATES } from '@/components/workspace/visual/services/svg-controller';
import { isStateBeingRestored } from '@/app/preload-state';
import { transformCoordinator } from '@/lib/client/debug/transform-coordinator';
import { select } from 'd3-selection';

// Add TypeScript declaration for window.saveWorkspaceState
declare global {
  interface Window {
    saveWorkspaceState?: () => void;
  }
}

// Flag to prevent duplicate centering operations
let isCenteringInProgress = false;

// Track the last centering timestamp
let lastCenteringTime = 0;

// Cooldown period between centerings in milliseconds
const CENTERING_COOLDOWN = 300;

// Set flag for centering progress
export function setCenteringInProgress(value: boolean): void {
  // Skip during state restoration
  if (isStateBeingRestored()) return;
  
  // Update global state
  isCenteringInProgress = value;
  
  // When centering is complete, update the timestamp
  if (!value) {
    lastCenteringTime = Date.now();
  }
  
  // Update body class for CSS styling
  if (typeof document !== 'undefined') {
    if (value) {
      document.body.classList.add('centering-in-progress');
    } else {
      document.body.classList.remove('centering-in-progress');
    }
  }
}

// Check if centering is currently in progress
export function isCenteringActive(): boolean {
  return isCenteringInProgress;
}

// Check if we're in cooldown period
export function isInCenteringCooldown(): boolean {
  return Date.now() - lastCenteringTime < CENTERING_COOLDOWN;
}

/**
 * Core centering function that coordinates all centering operations
 * All centering operations should go through this function
 */
export async function centerOnElement(
  rect: Rectangle, 
  options: {
    taskId?: string; 
    projectId?: string; 
    skipAnimation?: boolean;
    isPostDeletion?: boolean;
    isSplitting?: boolean;
    isNewProject?: boolean;
    radicalCentering?: boolean;
    directClick?: boolean;
  } = {}
): Promise<void> {
  // Skip during state restoration
  if (isStateBeingRestored()) {
    logger.debug('Skipping centerOnElement during state restoration', {}, 'centering-utility state-restoration');
    return Promise.resolve();
  }
  
  // Skip if already centering
  if (isCenteringInProgress) {
    logger.warn('Centering already in progress, ignoring duplicate request', {}, 'centering-utility operation-conflict');
    return Promise.resolve();
  }
  
  // Check for direct click flag on the document
  const elementId = options.taskId || options.projectId;
  const hasDirectClickFlag = document.body.getAttribute('data-direct-click-in-progress') === elementId;
  const isDirectClick = options.directClick === true || hasDirectClickFlag;
  
  // Skip if in cooldown period (except for special cases or direct clicks)
  if (isInCenteringCooldown() && 
      !options.isPostDeletion && 
      !options.isSplitting && 
      !options.isNewProject &&
      !isDirectClick) {
    logger.debug('In centering cooldown period, skipping request', {}, 'centering-utility cooldown');
    return Promise.resolve();
  }
  
  // Mark centering as in progress
  setCenteringInProgress(true);
  
  // Coordinate with transform coordinator
  transformCoordinator.startCentering();
  
  // Update controller state
  svgController.setControllerState(CONTROLLER_STATES.CENTERING);
  
  // Add centering class for transitions
  document.body.classList.add('is-centering');
  
  // Store current project ID in a data attribute for reference
  if (options.projectId) {
    document.body.setAttribute('data-current-project-id', options.projectId);
  }
  
  // Generate a unique operation ID for this centering operation
  const operationId = `center-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  
  logger.info('[CENTERING UTILITY] ▶️ Starting centering operation', { 
    operationId,
    rect,
    taskId: options.taskId,
    projectId: options.projectId,
    isSplitting: options.isSplitting,
    isPostDeletion: options.isPostDeletion,
    skipAnimation: options.skipAnimation,
    isNewProject: options.isNewProject,
    isDirectClick,
    source: 'centerOnElement',
    _style: 'background-color: #E91E63; color: white; padding: 2px 5px; border-radius: 3px;'
  }, 'centering-utility operation');
  
  try {
    // For new projects, check if we have initial transform values
    if (options.isNewProject) {
      const initialTransform = transformCoordinator.getInitialTransform();
      if (initialTransform) {
        logger.info('Using initial transform for new project', {
          scale: initialTransform.scale,
          x: initialTransform.translate.x,
          y: initialTransform.translate.y
        }, 'centering-utility new-project');
        
        // Apply the transform directly to DOM
        const transformGroup = select('.transform-group');
        if (!transformGroup.empty()) {
          const transform = `translate(${initialTransform.translate.x}, ${initialTransform.translate.y}) scale(${initialTransform.scale})`;
          transformGroup.attr('transform', transform);
          
          // Dispatch centering-complete event
          document.dispatchEvent(new CustomEvent('centering-complete'));
          
          // Reset centering state
          setCenteringInProgress(false);
          svgController.setControllerState(CONTROLLER_STATES.IDLE);
          document.body.classList.remove('is-centering');
          transformCoordinator.endCentering();
          
          // Trigger state save
          setTimeout(() => {
            if (typeof window.saveWorkspaceState === 'function') {
              window.saveWorkspaceState();
            }
          }, 300);
          
          return Promise.resolve();
        }
      }
    }
    
    // Perform the actual centering through the SVG controller
    await svgController.centerOnElement(rect, options.skipAnimation);
    
    // Signal that centering is complete with a custom event
    const centeringCompleteEvent = new CustomEvent('centering-complete', {
      detail: { 
        taskId: options.taskId, 
        projectId: options.projectId,
        isPostDeletion: options.isPostDeletion,
        isSplitting: options.isSplitting,
        timestamp: Date.now()
      }
    });
    document.dispatchEvent(centeringCompleteEvent);
    
    // End coordinated centering
    transformCoordinator.endCentering();
    
    // Trigger state save after centering completes
    setTimeout(() => {
      // Force state save
      if (typeof window.saveWorkspaceState === 'function') {
        window.saveWorkspaceState();
      }
    }, 300);

    logger.debug('Centering complete event dispatched', {
      taskId: options.taskId,
      projectId: options.projectId
    }, 'centering-utility completion');
    
    // Reset centering state
    setCenteringInProgress(false);
    
    return Promise.resolve();
  } catch (error) {
    logger.error('Error during centering operation', {
      error: error instanceof Error ? error.message : String(error),
      taskId: options.taskId,
      projectId: options.projectId
    }, 'centering-utility error');
    
    // Reset centering state even on error
    setCenteringInProgress(false);
    svgController.setControllerState(CONTROLLER_STATES.IDLE);
    document.body.classList.remove('is-centering');
    transformCoordinator.endCentering();
    
    return Promise.reject(error);
  }
}

/**
 * Center on a task by ID
 * This uses the task element's transform attribute to get accurate SVG coordinates
 */
export async function centerOnTaskById(
  taskId: string, 
  options: { 
    skipAnimation?: boolean;
    isPostDeletion?: boolean;
    isSplitting?: boolean;
    directClick?: boolean;
  } = {}
): Promise<void> {
  try {
    // Find the task element
    const taskElement = document.getElementById(`task-${taskId}`);
    if (!taskElement) {
      logger.warn('Task element not found for centering', { taskId }, 'centering-utility task-centering not-found');
      return Promise.resolve();
    }
    
    // Extract the coordinates from the transform attribute
    let x = 0, y = 0;
    const transform = taskElement.getAttribute('transform');
    if (transform) {
      const match = transform.match(/translate\(([^,]+),([^)]+)\)/);
      if (match && match.length >= 3) {
        x = parseFloat(match[1]);
        y = parseFloat(match[2]);
      }
    }
    
    // Get task dimensions
    let width = 240, height = 120;  // Default values
    const rect = taskElement.querySelector('rect');
    if (rect) {
      const rectWidth = rect.getAttribute('width');
      const rectHeight = rect.getAttribute('height');
      if (rectWidth) width = parseFloat(rectWidth);
      if (rectHeight) height = parseFloat(rectHeight);
    }
    
    // Perform the centering
    return centerOnElement(
      { x, y, width, height },
      { 
        taskId, 
        skipAnimation: options.skipAnimation,
        isPostDeletion: options.isPostDeletion,
        isSplitting: options.isSplitting,
        directClick: options.directClick
      }
    );
  } catch (error) {
    logger.error('Failed to center on task by ID', {
      taskId,
      error: error instanceof Error ? error.message : String(error)
    }, 'centering-utility task-centering error');
    return Promise.reject(error);
  }
}

/**
 * Center on a project by ID
 * This uses the project element's transform attribute to get accurate SVG coordinates
 */
export async function centerOnProjectById(
  projectId: string, 
  options: { 
    skipAnimation?: boolean;
    isNewProject?: boolean;
    radicalCentering?: boolean;
    directClick?: boolean;
  } = {}
): Promise<void> {
  try {
    // Check if this is a new project with initial transform
    if (options.isNewProject) {
      const initialTransform = transformCoordinator.getInitialTransform();
      if (initialTransform) {
        // Create a rectangle from the initial transform
        const rect = {
          x: initialTransform.translate.x,
          y: initialTransform.translate.y,
          width: 280,
          height: 120
        };
        
        // Center on the rectangle
        return centerOnElement(
          rect,
          {
            projectId,
            skipAnimation: true,
            isNewProject: true
          }
        );
      }
    }
    
    // Find the project element
    const projectElement = document.getElementById(`project-${projectId}`);
    if (!projectElement) {
      logger.warn('Project element not found for centering', { projectId }, 'centering-utility project-centering not-found');
      return Promise.resolve();
    }
    
    // Extract the coordinates from the transform attribute
    let x = 0, y = 0;
    const transform = projectElement.getAttribute('transform');
    if (transform) {
      const match = transform.match(/translate\(([^,]+),([^)]+)\)/);
      if (match && match.length >= 3) {
        x = parseFloat(match[1]);
        y = parseFloat(match[2]);
      }
    }
    
    // Get project dimensions
    let width = 280, height = 120;  // Default project dimensions
    const rect = projectElement.querySelector('rect');
    if (rect) {
      const rectWidth = rect.getAttribute('width');
      const rectHeight = rect.getAttribute('height');
      if (rectWidth) width = parseFloat(rectWidth);
      if (rectHeight) height = parseFloat(rectHeight);
    }
    
    // Perform the centering
    return centerOnElement(
      { x, y, width, height },
      { 
        projectId, 
        skipAnimation: options.skipAnimation,
        isNewProject: options.isNewProject,
        radicalCentering: options.radicalCentering,
        directClick: options.directClick
      }
    );
  } catch (error) {
    logger.error('Failed to center on project by ID', {
      projectId,
      error: error instanceof Error ? error.message : String(error)
    }, 'centering-utility project-centering error');
    return Promise.reject(error);
  }
}

/**
 * Center after task splitting
 * This is specialized for post-split centering
 */
export async function centerAfterSplit(taskId: string): Promise<void> {
  try {
    logger.info('Centering after task split', { taskId }, 'centering-utility task-splitting');
    
    // Mark as splitting operation
    const options = {
      isSplitting: true,
      skipAnimation: false
    };
    
    // Center on the split task
    return centerOnTaskById(taskId, options);
  } catch (error) {
    logger.error('Failed to center after split', {
      taskId,
      error: error instanceof Error ? error.message : String(error)
    }, 'centering-utility task-splitting error');
    return Promise.reject(error);
  }
}

/**
 * Emit a direct click selection event for a task
 * This helps coordinate selection and centering
 */
export function emitDirectSelectionEvent(
  taskId: string, 
  isProject: boolean, 
  rect?: Rectangle
): void {
  try {
    // Find the element if no rect provided
    if (!rect) {
      const elementId = isProject ? `project-${taskId}` : `task-${taskId}`;
      const element = document.getElementById(elementId);
      
      if (element) {
        // Extract coordinates from transform
        let x = 0, y = 0;
        const transform = element.getAttribute('transform');
        if (transform) {
          const match = transform.match(/translate\(([^,]+),([^)]+)\)/);
          if (match && match.length >= 3) {
            x = parseFloat(match[1]);
            y = parseFloat(match[2]);
          }
        }
        
        // Get dimensions
        let width = isProject ? 280 : 240; 
        let height = isProject ? 120 : 120;
        
        const rectEl = element.querySelector('rect');
        if (rectEl) {
          const rectWidth = rectEl.getAttribute('width');
          const rectHeight = rectEl.getAttribute('height');
          if (rectWidth) width = parseFloat(rectWidth);
          if (rectHeight) height = parseFloat(rectHeight);
        }
        
        // Create rectangle
        rect = { x, y, width, height };
      }
    }
    
    logger.debug('Emitting direct selection event', { 
      taskId,
      isProject,
      hasRect: !!rect
    }, 'centering-utility selection-event');
    
    // Try to handle directly with state coordinator first
    import('@/components/workspace/visual/task-hierarchy/state-coordinator')
      .then(({ taskStateCoordinator }) => {
        if (isProject) {
          taskStateCoordinator.handleProjectSelection(
            taskId, 
            rect as DOMRect,
            { directClick: true }
          );
        } else {
          taskStateCoordinator.handleTaskSelection(
            taskId, 
            rect as DOMRect,
            { directClick: true }
          );
        }
      })
      .catch(error => {
        logger.warn('Failed to import state coordinator, falling back to event emission', { error }, 'centering-utility selection-fallback');
        
        // Fallback to event emission if direct call fails
        TaskEventEmitter.getInstance().emit({
          taskId,
          type: 'stateChange',
          data: {
            state: isProject ? 'projectSelected' : 'selected',
            rect,
            directClick: true
          }
        });
      });
  } catch (error) {
    logger.error('Failed to handle direct selection event', {
      taskId,
      isProject,
      error: error instanceof Error ? error.message : String(error)
    }, 'centering-utility selection-event error');
  }
}
