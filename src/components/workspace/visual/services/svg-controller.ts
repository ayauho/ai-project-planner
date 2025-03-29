'use client';
import { Selection } from 'd3-selection';
import * as d3 from 'd3';
import { logger } from '@/lib/client/logger';
import { layerManager } from './layer-manager';
import { PROJECT_WIDTH, PROJECT_HEIGHT } from '@/lib/client/visual/project/constants';
import { useTaskOperations } from '@/components/workspace/hooks/useTaskOperations';
import { Rectangle } from '../utils/geometry';
import { select } from 'd3-selection';
import { syncZoomWithTransform } from '../hooks/useZoom';
import { isStateBeingRestored, getRestorationPhase, markElementPositioned } from '@/app/preload-state';
import { TaskVisualState } from '@/lib/workspace/state/types';

// Define state machine for controller operations
export const CONTROLLER_STATES = {
  IDLE: 'idle',
  CENTERING: 'centering',
  SPLITTING: 'splitting',
};

// Track global controller state
let controllerState = CONTROLLER_STATES.IDLE;

interface RenderState {
  projectId: string | null;
  version: number;
}

interface SplitEvent {
  elementId: string;
}

type Handlers = {
  split: (event: SplitEvent) => Promise<void>;
  regenerate?: (event: { elementId: string }) => Promise<void>;
  delete?: (event: { elementId: string }) => Promise<void>;
}

// Store counter state
interface CounterState {
  element: Element;
  rect: DOMRect;
  key: string;
  cloneElement?: HTMLElement;
}

// Counter tracking by project
const projectCounters: Map<string, CounterState[]> = new Map();

/**
 * Remove all preserve-counter elements from the DOM
 */
function cleanupPreserveCounters(): void {
  try {
    // Find and remove all preserve-counter elements
    const preserveCounters = document.querySelectorAll('.preserve-counter');
    
    if (preserveCounters.length > 0) {
      logger.debug('Cleaning up preserve-counters', {
        count: preserveCounters.length
      });
    }
    
    preserveCounters.forEach(el => {
      if (el.parentNode) {
        el.parentNode.removeChild(el);
      }
    });
    
    // Also clean up any potential cloned elements
    document.querySelectorAll('.counter-clone').forEach(el => {
      if (el.parentNode) {
        el.parentNode.removeChild(el);
      }
    });
    
    // Reset all counter styles to default
    document.querySelectorAll('.counter-display, [data-project-counter="true"]').forEach(el => {
      const element = el as HTMLElement;
      element.style.opacity = '';
      element.style.visibility = '';
      element.style.display = '';
      element.style.pointerEvents = 'none';
      
      // Remove any temporary classes
      element.classList.remove('temp-hidden', 'preserved', 'restoring');
    });
  } catch (error) {
    logger.error('Error cleaning up preserve-counters', { error });
  }
}

/**
 * Create fixed position counter clone with improved styling
 */
function _createFixedPositionClone(element: Element, rect: DOMRect): HTMLElement {
  const clone = document.createElement('div');
  
  // Extract content and styling - only take numerical content to avoid SVG elements
  let content = '';
  element.querySelectorAll('text').forEach(text => {
    content += text.textContent;
  });
  
  // If no text content found, try to get innerHTML but extract only text
  if (!content) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = element.innerHTML;
    content = tempDiv.textContent || '';
  }
  
  const computedStyle = window.getComputedStyle(element as HTMLElement);
  
  // Apply content and styling
  clone.textContent = content;
  clone.classList.add('preserve-counter', 'counter-clone');
  
  // Add project-specific class if this is a project counter
  if (element.classList.contains('project-counter') || 
      element.getAttribute('data-project-counter') === 'true') {
    clone.classList.add('project-counter-clone');
  }
  
  // Position and size
  clone.style.position = 'fixed';
  clone.style.left = `${rect.left}px`;
  clone.style.top = `${rect.top}px`;
  clone.style.width = `${rect.width}px`;
  clone.style.height = `${rect.height}px`;
  clone.style.zIndex = '10000';
  clone.style.pointerEvents = 'none';
  
  // Styling - take more specific project counter styles if available
  if (element.classList.contains('project-counter') || 
      element.getAttribute('data-project-counter') === 'true') {
    // Use PROJECT_COUNT_DISPLAY styles for project counters 
    clone.style.background = '#ffffff'; // Match project counter background
    clone.style.color = '#1e293b';      // Match project counter text color
    clone.style.borderRadius = '4px';   // Match project counter border radius
    clone.style.border = '2px solid #2563eb'; // Match project counter border
  } else {
    // For other counters, use computed styles
    clone.style.background = computedStyle.fill || computedStyle.background || '#ffffff';
    clone.style.borderRadius = computedStyle.borderRadius || '4px';
    clone.style.border = `${computedStyle.strokeWidth || '1px'} solid ${computedStyle.stroke || computedStyle.borderColor || '#2563eb'}`;
  }
  
  // Text styling
  clone.style.display = 'flex';
  clone.style.alignItems = 'center';
  clone.style.justifyContent = 'center';
  clone.style.fontFamily = computedStyle.fontFamily || 'sans-serif';
  clone.style.fontSize = computedStyle.fontSize || '12px';
  clone.style.color = computedStyle.color || '#000000';
  clone.style.textAlign = 'center';
  
  // Add transition for smoother appearance/disappearance
  clone.style.transition = 'opacity 0.2s ease-out';
  
  // Add to body
  document.body.appendChild(clone);
  
  // Track the original element ID
  if (element.id) {
    clone.dataset.originalId = element.id;
  } else if (element.getAttribute('data-id')) {
    clone.dataset.originalId = element.getAttribute('data-id') || '';
  }
  
  // Add reference to original element's project ID if available
  const projectId = element.getAttribute('data-project-id') || 
                    element.closest('[data-project-id]')?.getAttribute('data-project-id');
  if (projectId) {
    clone.dataset.projectId = projectId;
  }
  
  logger.debug('Created fixed position clone for counter', {
    content,
    rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
    isProjectCounter: element.classList.contains('project-counter') || 
                     element.getAttribute('data-project-counter') === 'true'
  });
  
  return clone;
}

/**
 * Completely remove all counters before centering operations
 * This is a radical approach: remove before centering, recreate after
 */
function _removeAllCounters(projectId: string): void {
  try {
    // Clean up any existing preserved counters first
    cleanupPreserveCounters();
    
    // Find all counter elements with a comprehensive set of selectors
    const selectors = [
      // Project-specific counters
      `.project-counter-${projectId}`,
      `[data-project-counter="true"]`,
      `.project-counter`,
      `.counter-display[data-project-id="${projectId}"]`,
      `g[id="project-counter-${projectId}"]`,
      `g[data-project-id="${projectId}"]`,
      
      // Generic counters that might be related
      `.counter-display`,
      `.task-counter-display`,
      `[class*="project-counter-"]`,
      `g[id^="project-counter-"]`,
      `g[data-counter-text]`,
      
      // Already preserved or cloned counters
      `.preserved-counter`,
      `.counter-clone`,
      `.preserve-counter`
    ];
    
    const counters = document.querySelectorAll(selectors.join(', '));
    
    logger.info('Removing all counters before centering', {
      projectId,
      counterCount: counters.length
    });
    
    // Store information about counters for later recreation
    const counterData: { 
      id: string; 
      childrenCount: number; 
      descendantCount: number; 
      text: string; 
      parentId: string; 
      rect: DOMRect; 
    }[] = [];
    
    // Completely remove all counter elements
    counters.forEach(counter => {
      try {
        // Extract data for recreation
        const data = {
          id: counter.id || counter.getAttribute('data-id') || '',
          childrenCount: parseInt(counter.getAttribute('data-children-count') || '0', 10) || 0,
          descendantCount: parseInt(counter.getAttribute('data-descendant-count') || '0', 10) || 0,
          text: counter.getAttribute('data-counter-text') || counter.textContent || '',
          parentId: counter.getAttribute('data-project-id') || projectId || '',
          rect: counter.getBoundingClientRect()
        };
        
        counterData.push(data);
        
        // First mark with special class for any animations
        counter.classList.add('counter-being-removed');
        
        // Remove from DOM - do this directly
        if (counter.parentNode) {
          counter.parentNode.removeChild(counter);
          
          logger.debug('Removed counter element', {
            id: data.id,
            className: counter.className.toString ? counter.className.toString() : counter.className,
            childrenCount: data.childrenCount,
            descendantCount: data.descendantCount
          });
        }
      } catch (error) {
        logger.warn('Error removing counter element', { 
          error: error instanceof Error ? error.message : String(error),
          counterId: counter.id
        });
      }
    });
    
    // Also remove any potential clones or preserved counters by selector
    document.querySelectorAll('.preserve-counter, .counter-clone, .preserved-counter').forEach(element => {
      if (element.parentNode) {
        element.parentNode.removeChild(element);
      }
    });
    
    // Store counter data for recreation
    if (counterData.length > 0) {
      // Set data attribute on body for later access
      document.body.setAttribute('data-counter-recreation-data', JSON.stringify({
        projectId,
        counters: counterData
      }));
    }
    
    logger.debug('All counters removed before centering', {
      projectId,
      storedDataCount: counterData.length
    });
  } catch (error) {
    logger.error('Failed to remove counters', { 
      projectId, 
      error: error instanceof Error ? error.message : String(error) 
    });
  }
}

/**
 * Recreate counters after centering operations are complete
 * This completely recreates counters rather than trying to restore them
 */
function _recreateCounters(projectId: string): void {
  try {
    logger.info('Recreating counters for project', { projectId });
    
    // Clean up any leftover clones or preserved counters
    cleanupPreserveCounters();
    
    // Schedule multiple recreation attempts with increasing delays
    // This improves reliability as the DOM may still be settling
    [200, 400, 800, 1500].forEach(delay => {
      setTimeout(() => {
        // Initiate counter recreation process
        triggerCounterRecreation(projectId, delay);
      }, delay);
    });
    
    logger.debug('Counter recreation scheduled', { projectId });
  } catch (error) {
    logger.error('Failed to schedule counter recreation', { 
      projectId, 
      error: error instanceof Error ? error.message : String(error) 
    });
  }
}

/**
 * Trigger actual counter recreation with appropriate project data
 */
function triggerCounterRecreation(projectId: string, attemptDelay: number): void {
  try {
    // Check if counters already exist (from previous recreation attempts)
    const existingCounters = document.querySelectorAll(
      `.project-counter-${projectId}, [data-project-id="${projectId}"].project-counter`
    );
    
    // If counters already exist, don't recreate
    if (existingCounters.length > 0) {
      logger.debug('Counters already exist, skipping recreation', { 
        projectId, 
        existingCount: existingCounters.length,
        attemptDelay
      });
      return;
    }
    
    // Get project element
    const projectElement = document.getElementById(`project-${projectId}`);
    if (!projectElement) {
      logger.warn('Project element not found for counter recreation', { 
        projectId,
        attemptDelay 
      });
      return;
    }
    
    // Get project state and position
    const projectRect = projectElement.getBoundingClientRect();
    const projectState = projectElement.getAttribute('data-state') || 'active';
    
    // Get counter data - try from data attribute first
    let childrenCount = 0;
    let descendantCount = 0;
    
    try {
      // Try to get from stored data first
      const storedDataString = document.body.getAttribute('data-counter-recreation-data');
      if (storedDataString) {
        const storedData = JSON.parse(storedDataString);
        if (storedData.projectId === projectId && storedData.counters.length > 0) {
          const counterData = storedData.counters[0]; // Use first counter's data
          childrenCount = counterData.childrenCount || 0;
          descendantCount = counterData.descendantCount || 0;
          
          logger.debug('Using stored counter data for recreation', {
            projectId,
            childrenCount,
            descendantCount,
            attemptDelay
          });
        }
      }
    } catch (error) {
      logger.warn('Error parsing stored counter data', { error });
    }
    
    // If no stored data, try to count from workspace state
    if (childrenCount === 0) {
      try {
        const wsManager = (window as Window & { workspaceStateManager?: { getState: () => { tasks: Map<string, { parentId?: string }> } } }).workspaceStateManager;
        if (wsManager?.getState) {
          const state = wsManager.getState();
          if (state && state.tasks) {
            // Count direct children
            childrenCount = Array.from(state.tasks.values())
              .filter((task) => task.parentId?.toString() === projectId)
              .length;
            
            // Count all tasks except the project itself for descendants
            descendantCount = state.tasks.size - 1;
            
            logger.debug('Counted tasks from workspace state', {
              projectId,
              childrenCount,
              descendantCount,
              attemptDelay
            });
          }
        }
      } catch (error) {
        logger.warn('Error accessing workspace state for counter data', { error });
      }
    }
    
    // If still no data, count DOM elements
    if (childrenCount === 0) {
      childrenCount = document.querySelectorAll(`.task-rect[data-parent-id="${projectId}"]`).length;
      descendantCount = document.querySelectorAll('.task-rect').length - 1;
      
      logger.debug('Counted tasks from DOM for counter data', {
        projectId,
        childrenCount,
        descendantCount,
        attemptDelay
      });
    }
    
    // Only proceed if we have tasks
    if (childrenCount === 0) {
      logger.debug('No children found, skipping counter recreation', { 
        projectId,
        attemptDelay 
      });
      return;
    }
    
    // Calculate counter position
    const rect = {
      x: projectRect.x,
      y: projectRect.y,
      width: projectRect.width,
      height: projectRect.height
    };
    
    // Dispatch event to recreate counter
    const event = new CustomEvent('recreate-project-counter', {
      detail: {
        projectId,
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        childrenCount,
        descendantCount,
        state: projectState as TaskVisualState,
        className: 'recreated-counter',
        attemptDelay
      },
      bubbles: true
    });
    
    document.dispatchEvent(event);
    
    logger.info('Dispatched counter recreation event', {
      projectId,
      childrenCount,
      descendantCount,
      state: projectState,
      attemptDelay
    });
    
    // After a short delay, check if the counter was successfully created
    setTimeout(() => {
      const createdCounter = document.querySelector(
        `.project-counter-${projectId}, [data-project-id="${projectId}"].project-counter`
      );
      
      logger.debug('Counter recreation result check', {
        projectId,
        success: !!createdCounter,
        attemptDelay
      });
    }, 100);
    
  } catch (error) {
    logger.error('Failed to trigger counter recreation', { 
      projectId, 
      attemptDelay,
      error: error instanceof Error ? error.message : String(error) 
    });
  }
}

/**
 * Schedule project counter recreation
 * This function will trigger the control layer to recreate the project counter
 */
function _scheduleProjectCounterRecreation(projectId: string): void {
  try {
    logger.debug('Scheduling project counter recreation', { projectId });
    
    // Use multiple attempts with increasing delays for reliability
    [200, 500, 1000].forEach(delay => {
      setTimeout(() => {
        try {
          // Get the project element
          const projectElement = document.getElementById(`project-${projectId}`);
          if (!projectElement) {
            logger.warn('Cannot find project element for counter recreation', { projectId });
            return;
          }
          
          // Get project dimensions and position
          const rect = projectElement.getBoundingClientRect();
          
          // Get project state
          let state: TaskVisualState = 'active';
          if (projectElement.classList.contains('semi-transparent') || 
              projectElement.getAttribute('data-state') === 'semi-transparent') {
            state = 'semi-transparent';
          } else if (projectElement.classList.contains('hidden') || 
                     projectElement.getAttribute('data-state') === 'hidden') {
            state = 'hidden';
          }
          
          // Get existing counts from workspaceStateManager if available
          let childrenCount = 0;
          let descendantCount = 0;
          
          // Try to find the counts from workspace state
          try {
            const wsManager = (window as Window & { workspaceStateManager?: { getState: () => { tasks: Map<string, { parentId?: string }> } } }).workspaceStateManager;
            if (wsManager?.getState) {
              const state = wsManager.getState();
              if (state && state.tasks) {
                // Count direct children
                childrenCount = Array.from(state.tasks.values())
                  .filter((task) => task.parentId?.toString() === projectId)
                  .length;
                
                // Count all tasks except the project itself for descendants
                descendantCount = state.tasks.size - 1;
              }
            }
          } catch (error) {
            logger.warn('Error accessing workspace state for counter recreation', { error });
          }
          
          // Fall back to counting DOM elements if state manager not available
          if (childrenCount === 0) {
            childrenCount = document.querySelectorAll(`.task-rect[data-parent-id="${projectId}"]`).length;
            descendantCount = document.querySelectorAll('.task-rect').length - 1;
          }
          
          // Only proceed if we have tasks
          if (childrenCount === 0) {
            return;
          }
          
          // Custom event to trigger counter recreation
          const event = new CustomEvent('recreate-project-counter', {
            detail: {
              projectId,
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
              childrenCount,
              descendantCount,
              state
            },
            bubbles: true
          });
          
          document.dispatchEvent(event);
          
          logger.debug('Dispatched project counter recreation event', {
            projectId,
            delay,
            childrenCount,
            descendantCount,
            state
          });
        } catch (error) {
          logger.warn('Error in counter recreation attempt', { 
            projectId, 
            delay, 
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }, delay);
    });
  } catch (error) {
    logger.error('Failed to schedule project counter recreation', { 
      projectId, 
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

class SVGController {
  private static instance: SVGController;
  private state: RenderState = {
    projectId: null,
    version: 0
  };
  
  // Add properties for centering management
  private _isCenteringInProgress: boolean = false;
  private _lastPostDeletionCenteringTime: number = 0;

  private constructor() {}

  public static getInstance(): SVGController {
    if (!SVGController.instance) {
      SVGController.instance = new SVGController();
    }
    return SVGController.instance;
  }

  /**
   * Get current layers
   */
  getLayers() {
    return layerManager.getLayers();
  }

  /**
   * Initialize the SVG controller
   */
  initialize(
    _svg: Selection<SVGSVGElement, unknown, null, undefined>,
    projectId: string,
    version: number,
    handlers: Handlers,
    dimensions: { width: number; height: number },
    taskOperations: ReturnType<typeof useTaskOperations>) {
    try {
      logger.debug('Starting SVG initialization', {
        projectId,
        version,
        currentState: {
          projectId: this.state.projectId,
          version: this.state.version
        },
        restorationPhase: getRestorationPhase()
      });

      // Clean up any preserve-counters
      cleanupPreserveCounters();

      // If layers exist and project hasn't changed, just return existing layers
      const existingLayers = this.getLayers();
      if (existingLayers && projectId === this.state.projectId) {
        logger.debug('Reusing existing layers', { projectId });
        return existingLayers;
      }

      // Always clean up previous state
      this.cleanup(_svg);

      // Initialize layers first
      const layers = layerManager.initialize(_svg, handlers, taskOperations);
      if (!layers) {
        throw new Error('Failed to initialize layers');
      }

      // Update state
      this.state = {
        projectId,
        version
      };

      logger.info('SVG initialization complete', {
        projectId,
        version,
        hasLayers: !!layers
      });

      // During state restoration, mark elements as positioned
      if (isStateBeingRestored() && getRestorationPhase() === 'positioning') {
        markElementPositioned();
      }

      return layers;
    } catch (error) {
      logger.error('SVG initialization failed', {
        projectId,
        version,
        error
      });
      this.cleanup(_svg);
      return null;
    }
  }

  /**
   * Clean up resources
   */
  cleanup(_svg: Selection<SVGSVGElement, unknown, null, undefined>) {
    logger.debug('Cleaning up SVG controller', {
      projectId: this.state.projectId,
      version: this.state.version
    });

    // Clean up any preserve-counters
    cleanupPreserveCounters();

    // Reset all project counters
    projectCounters.clear();

    // Clean up layers
    layerManager.dispose();
    
    this.state = {
      projectId: null,
      version: this.state.version + 1 // Increment version on cleanup
    };
  }

  /**
   * Get current controller state
   */
  getControllerState(): string {
    return controllerState;
  }

  /**
   * Set controller state
   */
  setControllerState(state: string): void {
    const previousState = controllerState;
    controllerState = state;
    
    logger.debug('Controller state changed', {
      from: previousState,
      to: state
    });
  }

  /**
   * Centers the viewport on a specific element with structural counter approach
   * Counters now move automatically with parent elements due to structural changes
   */
  centerOnElement(rect: Rectangle, skipAnimation?: boolean): Promise<void> {
    // Skip during state restoration
    if (isStateBeingRestored()) {
      logger.debug('Skipping centerOnElement during state restoration');
      return Promise.resolve();
    }
    
    // Check for direct click flag first
    const elementId = (rect as Rectangle & { taskId?: string; projectId?: string })?.taskId || 
                     (rect as Rectangle & { taskId?: string; projectId?: string })?.projectId;
    const hasDirectClickFlag = elementId && 
      document.body.getAttribute('data-direct-click-in-progress') === elementId;
    
    // Add more detailed logging for centerOnElement
    logger.debug('centerOnElement called with', { 
      rect,
      hasDirectClickFlag,
      isProject: (rect as Rectangle & { isProject?: boolean }).isProject === true,
      isNewProject: (rect as Rectangle & { isNewProject?: boolean }).isNewProject === true,
      skipAnimation,
      _style: 'background-color: #E91E63; color: white; padding: 2px 5px; border-radius: 3px;'
    }, 'svg-controller centering');
    
    // Check if this is a direct centering in progress from centering utility
    // This creates coordination between the two centering systems
    if ((window as Window & { __directCenteringInProgress?: boolean }).__directCenteringInProgress === true) {
      logger.debug('Direct centering already in progress from centering utility, allowing SVG controller to handle it');
      // Continue with the centering since we want the SVG controller to do the actual work
    } else {
      // Use a flag to prevent duplicate centering operations
      if (this._isCenteringInProgress) {
        logger.warn('Centering already in progress, ignoring duplicate request', {
          isDirectClick: hasDirectClickFlag
        });
        return Promise.resolve();
      }
    }
    
    // Mark centering as in progress
    this._isCenteringInProgress = true;
    
    // Check for post-deletion centering request 
    // Check both from rect property and body attribute
    const isPostDeletion = 
      (rect as Rectangle & { isPostDeletion?: boolean })?.isPostDeletion === true || 
      document.body.hasAttribute('data-post-deletion-centering') ||
      document.body.hasAttribute('data-deleting-task') || 
      document.body.classList.contains('deletion-in-progress');
      
    // Note whether this is during splitting
    const isSplitting = controllerState === CONTROLLER_STATES.SPLITTING;
    
    // Set controller state
    this.setControllerState(CONTROLLER_STATES.CENTERING);
    
    // Add centering class for transitions
    document.body.classList.add('is-centering');
    
    // Store current project ID in case needed
    const currentProjectId = this.state.projectId;
    if (currentProjectId) {
      document.body.setAttribute('data-current-project-id', currentProjectId);
    }
    
    // Check if this is part of a parent centering operation from the utility
    const parentOperationId = (window as Window & { __centeringOperationId?: string }).__centeringOperationId;
    const isChildOperation = !!parentOperationId;
    
    // Add distinctive logging with background color for this centering operation
    logger.info(isChildOperation ? '└─ Executing centering' : 'Direct centering', { 
      ...(isChildOperation ? { parentOperationId } : {}),
      rect,
      isSplitting,
      isPostDeletion,
      skipAnimation,
      currentProjectId,
      isDirectClick: hasDirectClickFlag,
      // Simplified to reduce noise
      source: 'centerOnElement',
      _style: 'background-color: #4CAF50; color: white; padding: 2px 5px; border-radius: 3px;'
    }, 'svg-controller centering');

    return new Promise<void>((resolve) => {
      // Use an arrow function to preserve this context
      (async () => {
        try {
          // Find the transform group immediately (no setTimeout)
          const transformGroup = select('.transform-group');
          
          if (transformGroup.empty()) {
            logger.warn('Transform group not found, cannot center viewport');
            
            // Clean up
            document.body.classList.remove('is-centering');
            this.setControllerState(CONTROLLER_STATES.IDLE);
            
            // Reset centering flag
            this._isCenteringInProgress = false;
            
            resolve();
            return;
          }
          
          // Get the SVG element
          const node = transformGroup.node();
          const svg = node && (node as SVGElement).ownerSVGElement;
          
          if (!svg) {
            logger.warn('SVG element not found, cannot center viewport');
            
            // Clean up
            document.body.classList.remove('is-centering');
            this.setControllerState(CONTROLLER_STATES.IDLE);
            
            // Reset centering flag
            this._isCenteringInProgress = false;
            
            resolve();
            return;
          }
          
          // Validate rect before proceeding
          if (!rect || typeof rect.x !== 'number' || typeof rect.y !== 'number') {
            logger.warn('Invalid rectangle provided for centering', { rect });
            
            // Clean up
            document.body.classList.remove('is-centering');
            this.setControllerState(CONTROLLER_STATES.IDLE);
            
            // Reset centering flag
            this._isCenteringInProgress = false;
            
            resolve();
            return;
          }
          
          // Add detailed logging of the rectangle for debugging
          logger.debug('Centering on rectangle', {
            rect,
            skipAnimation,
            isNewProject: (rect as Rectangle & { isNewProject?: boolean }).isNewProject === true,
            isDirectClick: hasDirectClickFlag,
            _style: 'background-color: #E91E63; color: white; padding: 2px 5px; border-radius: 3px;'
          }, 'svg-controller centering');
          
          // Get SVG dimensions
          const svgRect = svg.getBoundingClientRect();
          const svgWidth = (rect as Rectangle & { svgWidth?: number }).svgWidth || svgRect.width || 800;
          const svgHeight = (rect as Rectangle & { svgHeight?: number }).svgHeight || svgRect.height || 600;
          
          // Parse current transform to preserve scale
          const currentTransform = transformGroup.attr('transform') || '';
          const { k: scale } = parseTransform(currentTransform);
          
          // Check if we have a special condition (new project) first
          const isNewProject = (rect as Rectangle & { isNewProject?: boolean }).isNewProject === true;
          
          // Calculate the center point of the element
          const centerX = rect.x + (rect.width || 0) / 2;
          const centerY = rect.y + (rect.height || 0) / 2;
          
          // Calculate the translation needed to center the element
          const translateX = svgWidth / 2 - centerX * scale;
          const translateY = svgHeight / 2 - centerY * scale;
          
          // For new projects, we'll use a fixed transform approach later
          // For regular centering, use our exact calculation formula
          let newTransform = isNewProject 
            ? '' // Will be calculated later for new projects
            : `translate(${translateX}, ${translateY}) scale(${scale})`;
            
          // Log the exact calculation for debugging
          logger.debug('Calculated transform for centering', {
            centerX,
            centerY,
            translateX,
            translateY,
            scale,
            elementRect: { 
              x: rect.x, 
              y: rect.y, 
              width: rect.width || 0, 
              height: rect.height || 0 
            },
            svgDimensions: { width: svgWidth, height: svgHeight },
            resultingTransform: newTransform,
            _style: 'background-color: #4CAF50; color: white; padding: 2px 5px; border-radius: 3px;'
          }, 'svg-controller centering transform');
          
          // Check if we should skip animation (for new projects)
          if (skipAnimation) {
            try {              
              // Direct centering for new projects - bypasses existing transform state
              if ((rect as Rectangle & { isNewProject?: boolean }).isNewProject) {
                try {
                  // Use dynamic import for the centering calculation function from constants
                  const calculateProjectCenterModule = await import('@/lib/client/layout/constants');
                  const { calculateProjectCenter } = calculateProjectCenterModule;
                  
                  // Get all the dimensions we need
                  const projectWidth = PROJECT_WIDTH;
                  const projectHeight = PROJECT_HEIGHT;
                  
                  // Calculate the center position using the utility function
                  const centerPosition = calculateProjectCenter(
                    svgWidth,
                    svgHeight,
                    projectWidth,
                    projectHeight
                  );
                  
                  logger.debug('Using exact center calculation', {
                    svgDimensions: { width: svgWidth, height: svgHeight },
                    projectDimensions: { width: projectWidth, height: projectHeight },
                    centerPosition,
                    translateX: centerPosition.x,
                    translateY: centerPosition.y,
                    scale: centerPosition.scale,
                    _style: 'background-color: #4CAF50; color: white; padding: 2px 5px; border-radius: 3px;'
                  }, 'svg-controller centering calculation');
                  
                  // First, we'll reset the transform to identity
                  // This is critical - we're starting from a clean slate
                  transformGroup.attr('transform', 'translate(0,0) scale(1)');
                  
                  // Force a reflow to ensure the reset is applied
                  svg.getBoundingClientRect();
                  
                  // Create the direct transform with calculated values
                  const directTransform = `translate(${centerPosition.x}, ${centerPosition.y}) scale(${centerPosition.scale})`;
                  
                  // Log the direct transform for debugging with distinctive styling
                  logger.info('Successfully calculated transform for new project', { 
                    x: centerPosition.x,
                    y: centerPosition.y,
                    scale: centerPosition.scale,
                    svgWidth,
                    svgHeight,
                    projectWidth,
                    projectHeight,
                    _style: 'background-color: #4CAF50; color: white; padding: 2px 5px; border-radius: 3px;'
                  }, 'centering transform');
                  
                  // Use calculated transform values directly
                  newTransform = directTransform;
                  
                  // Update the transform coordinator with the calculated values
                   
                  try {
                    const coordinator = (window as Window & { 
                      __transformCoordinator?: { 
                        setInitialTransform: (transform: { scale: number; translate: { x: number; y: number } }) => void 
                      } 
                    }).__transformCoordinator;
                    if (coordinator) {
                      coordinator.setInitialTransform({
                        scale: centerPosition.scale,
                        translate: {
                          x: centerPosition.x,
                          y: centerPosition.y
                        }
                      });
   
                    }
                  } catch (error) {
                    logger.warn('Error updating transform coordinator', { error });
                  }
                  
                  // Add a flag to verify later if correction is needed
                  (rect as Rectangle & { usedRadicalCentering?: boolean }).usedRadicalCentering = true;
                } catch (error) {
                  logger.warn('Error during project centering', { 
                    error: error instanceof Error ? error.message : String(error)
                  });
                }
              }
              // Start coordinated centering with the explicit transform
              try {
                const coordinator = (window as Window & { 
                  __transformCoordinator?: { 
                    startCentering: (transform: string) => void 
                  } 
                }).__transformCoordinator;
                if (coordinator) {
                  coordinator.startCentering(newTransform);
                }
              } catch {
                logger.warn('Transform coordinator not available');
              }
              
              logger.info('Applying centering transform immediately (no animation)', {
                transform: newTransform
              });
              
              // Apply transform immediately without animation
              transformGroup.attr('transform', newTransform);
              
              // Force a reflow to ensure the transform is applied
              svg.getBoundingClientRect();
              
              // Apply correction if needed - with better logging
              if ((rect as Rectangle & { usedRadicalCentering?: boolean }).usedRadicalCentering) {
                // Wait a tiny bit to ensure DOM is updated
                setTimeout(() => {
                  try {
                    // Find the actual project element
                    const projectElement = document.getElementById(`project-${currentProjectId}`);
                    if (!projectElement) {
                      logger.warn('Project element not found for post-centering correction');
                      return;
                    }
                    
                    // Get actual positions
                    const actualRect = projectElement.getBoundingClientRect();
                    const svgRect = svg.getBoundingClientRect();
                    
                    // Calculate centers
                    const svgCenterX = svgRect.left + svgRect.width / 2;
                    const svgCenterY = svgRect.top + svgRect.height / 2;
                    const elementCenterX = actualRect.left + actualRect.width / 2;
                    const elementCenterY = actualRect.top + actualRect.height / 2;
                    
                    // Calculate offsets
                    const offsetX = svgCenterX - elementCenterX;
                    const offsetY = svgCenterY - elementCenterY;
                    
                    logger.debug('Checking if post-centering correction is needed', {
                      svgCenter: { x: svgCenterX, y: svgCenterY },
                      elementCenter: { x: elementCenterX, y: elementCenterY },
                      offset: { x: offsetX, y: offsetY }
                    });
                    
                    // If offset is significant, apply a correction
                    const needsCorrection = Math.abs(offsetX) > 5 || Math.abs(offsetY) > 5;
                    if (needsCorrection) {
                      // Parse the current transform
                      const currentTransform = transformGroup.attr('transform');
                      const { x: currentX, y: currentY, k: currentScale } = parseTransform(currentTransform);
                      
                      // Calculate correction
                      const correctedX = currentX + offsetX;
                      const correctedY = currentY + offsetY;
                      
                      // Apply corrected transform
                      const correctedTransform = `translate(${correctedX}, ${correctedY}) scale(${currentScale})`;
                      transformGroup.attr('transform', correctedTransform);
                      
                      // Log the correction
                      logger.info('Applied post-centering correction', { 
                        from: { x: currentX, y: currentY },
                        to: { x: correctedX, y: correctedY },
                        offset: { x: offsetX, y: offsetY },
                        _style: 'background-color: #FF9800; color: white; padding: 2px 5px; border-radius: 3px;'
                      }, 'centering correction');
                      
                      // Update the transform coordinator
                      try {
                        const coordinator = (window as Window & { 
                          __transformCoordinator?: { 
                            setExplicitTransform: (transform: string) => void 
                          } 
                        }).__transformCoordinator;
                        if (coordinator) {
                          coordinator.setExplicitTransform(correctedTransform);
                        }
                      } catch {
                        logger.warn('Error updating transform coordinator after correction');
                      }
                    } else {
                      logger.debug('No post-centering correction needed', {
                        offsetX,
                        offsetY,
                        threshold: 5
                      });
                    }
                  } catch (error) {
                    logger.warn('Error during post-centering correction', {
                      error: error instanceof Error ? error.message : String(error)
                    });
                  }
                }, 50); // Slightly longer timeout for more reliable correction
              }
              
              // Sync the zoom behavior with new transform
              try {
                // Schedule multiple sync attempts for reliability
                syncZoomWithTransform(svg);
                
                // Additional sync after a delay for reliability
                setTimeout(() => {
                  try {
                    syncZoomWithTransform(svg);
                  } catch {
                    // Silent error handling in production
                  }
                }, 50);
              } catch {
                // Silent error handling in production
              }
              
              // Reset controller state
              this.setControllerState(CONTROLLER_STATES.IDLE);
              
              // Reset centering flag
              this._isCenteringInProgress = false;
              
              // Signal that the centering is complete
              document.dispatchEvent(new CustomEvent('centering-complete'));
              
              // Resolve the promise
              resolve();
            } catch (error) {
              logger.error('Error during immediate transform application', { error });
              
              // End coordinated centering on error
              try {
                const coordinator = (window as Window & { 
                  __transformCoordinator?: { 
                    endCentering: () => void 
                  } 
                }).__transformCoordinator;
                if (coordinator) {
                  coordinator.endCentering();
                }
              } catch {
                // Ignore
              }
              
              // Still try to resolve
              resolve();
            }
            
            return;
          }
          
          // Adjust duration based on operation type
          let duration = isSplitting ? 700 : 500;
          
          // For post-deletion centering, use a slightly shorter duration for faster response
          if (isPostDeletion) {
            duration = 400;
          }
          
          // Apply transform with smooth animation
          transformGroup
            .transition()
            .duration(duration)
            .ease(d3.easeCubicInOut)
            .attr('transform', newTransform)
            .on('end', () => {
              logger.debug('Centering animation complete', { isPostDeletion });
              
              // Sync the zoom behavior with new transform
              syncZoomWithTransform(svg);
              
              // Wait for transform to settle completely
              setTimeout(() => {
                // Remove centering class
                document.body.classList.remove('is-centering');
                
                // Reset controller state
                // If splitting in progress, maintain that state
                if (isSplitting) {
                  this.setControllerState(CONTROLLER_STATES.SPLITTING);
                } else {
                  this.setControllerState(CONTROLLER_STATES.IDLE);
                }
                
                // For post-deletion centering, clean up related attributes
                if (isPostDeletion) {
                  // Remove post-deletion markers
                  document.body.removeAttribute('data-post-deletion-centering');
                  
                  // Dispatch an event indicating post-deletion centering is complete
                  window.dispatchEvent(new CustomEvent('post-deletion-centering-complete'));
                  
                  // Force control visibility reset
                  setTimeout(() => {
                    window.dispatchEvent(new CustomEvent('reset-common-controls'));
                    
                    // Force visibility for controls after post-deletion centering
                    window.dispatchEvent(new CustomEvent('force-control-visibility', {
                      detail: { 
                        isPostDeletion: true,
                        forceAll: true
                      }
                    }));
                  }, 150);
                }
                
                // Schedule multiple overlap detection updates for other controls
                [100, 300, 500].forEach(delay => {
                  setTimeout(() => {
                    try {
                      // Force overlap detection update
                      const overlapDetector = (window as Window & { 
                        overlapDetector?: { requestCheck: () => void } 
                      }).overlapDetector;
                      if (typeof overlapDetector?.requestCheck === 'function') {
                        overlapDetector.requestCheck();
                      }
                      
                      // Also force control visibility update
                      const visibilityManager = (window as Window & { 
                        controlVisibilityManager?: { updateVisibility: () => void } 
                      }).controlVisibilityManager;
                      if (typeof visibilityManager?.updateVisibility === 'function') {
                        visibilityManager.updateVisibility();
                      }
                    } catch (error) {
                      logger.warn('Error updating visibility after centering', { 
                        error, 
                        delay 
                      });
                    }
                  }, delay);
                });
                
                // STRUCTURAL APPROACH: No need to recreate counters
                // Dispatch event for counter visibility update just in case
                if (currentProjectId) {
                  const event = new CustomEvent('counter-visibility-update', {
                    detail: { projectId: currentProjectId },
                    bubbles: true
                  });
                  document.dispatchEvent(event);
                }
                
                // Signal that the centering is complete
                document.dispatchEvent(new CustomEvent('centering-complete'));
                
                // Reset centering flag
                this._isCenteringInProgress = false;
                
                // Clear the operation ID if it exists
                if ((window as Window & { __centeringOperationId?: string }).__centeringOperationId) {
                  delete (window as Window & { __centeringOperationId?: string }).__centeringOperationId;
                }
                
                // Resolve the promise
                resolve();
              }, 250); // Increased for more reliable operation
            });
        } catch (error) {
          logger.error('Failed to center on element', { 
            error: error instanceof Error ? error.message : String(error), 
            isPostDeletion 
          });
          
          // Clean up on error
          document.body.classList.remove('is-centering');
          this.setControllerState(CONTROLLER_STATES.IDLE);
          
          // Reset centering flag
          this._isCenteringInProgress = false;
          
          // Remove post-deletion markers on error
          document.body.removeAttribute('data-post-deletion-centering');
          
          resolve();
        }
      })(); // Execute the async function immediately
    });
  }

  /**
   * Parse transform string into components
   */
  private parseTransform(transform: string): { scale: number; translate: { x: number; y: number } } {
    const result = {
      scale: 1,
      translate: { x: 0, y: 0 }
    };
    
    try {
      // Parse scale
      const scaleMatch = transform.match(/scale\(([^)]+)\)/);
      if (scaleMatch && scaleMatch[1]) {
        result.scale = parseFloat(scaleMatch[1]) || 1;
      }
      
      // Parse translation
      const translateMatch = transform.match(/translate\(([^,]+),\s*([^)]+)\)/);
      if (translateMatch && translateMatch[1] && translateMatch[2]) {
        result.translate.x = parseFloat(translateMatch[1]) || 0;
        result.translate.y = parseFloat(translateMatch[2]) || 0;
      }
    } catch (error) {
      logger.error('Failed to parse transform', { transform, error });
    }
    
    return result;
  }
}

// Helper function to parse transform string
function parseTransform(transform: string): { x: number; y: number; k: number } {
  const defaults = { x: 0, y: 0, k: 1 };
  
  if (!transform) return defaults;
  
  // Parse translate values
  const translateMatch = transform.match(/translate\(([^,]+),\s*([^)]+)\)/);
  const x = translateMatch ? parseFloat(translateMatch[1]) : defaults.x;
  const y = translateMatch ? parseFloat(translateMatch[2]) : defaults.y;
  
  // Parse scale value
  const scaleMatch = transform.match(/scale\(([^)]+)\)/);
  const k = scaleMatch ? parseFloat(scaleMatch[1]) : defaults.k;
  
  return { 
    x: isNaN(x) ? defaults.x : x, 
    y: isNaN(y) ? defaults.y : y, 
    k: isNaN(k) ? defaults.k : k 
  };
}

export const svgController = SVGController.getInstance();
