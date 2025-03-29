'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { select } from 'd3-selection';
import { useWorkspaceStore } from '@/lib/workspace/store';
import { workspaceStateManager } from '@/lib/workspace/state/manager';
import { logger } from '@/lib/client/logger';
import { LayoutElement } from '@/types/layout';
import { TaskRectangleRenderer } from '@/lib/client/visual/task';
import { projectRectangleRenderer } from '@/lib/client/visual/project/rectangle';
import { DEFAULT_TASK_CONFIG } from '@/lib/client/visual/task/constants';
import { PROJECT_WIDTH, PROJECT_HEIGHT } from '@/lib/client/visual/project/constants';
import { createCircularLayoutManager } from '@/lib/client/layout';
import { DEFAULT_LAYOUT_OPTIONS } from '@/lib/client/layout/constants';
import { useTaskOperations } from '@/components/workspace/hooks/useTaskOperations';
import { useWorkspacePersistence, WORKSPACE_STATE_VISUAL_READY_EVENT } from '@/components/workspace/hooks/useWorkspacePersistence';
import { useDimensions } from './hooks/useDimensions';
import { 
  useZoom, 
  preInitializeSvg 
} from './hooks/useZoom';
import { getSavedViewportState } from './hooks/useZoom';
import { svgController, CONTROLLER_STATES } from './services/svg-controller';
import { connectionDrawer } from './services/connection-drawer';
import { Task } from '@/lib/task/types';
import { TaskRect } from '@/lib/client/visual/task/rect-type';
import { TaskVisualState } from '@/lib/workspace/state/types';
import { svgOrderManager } from '@/lib/client/visual/utils/svg-order';
import { overlapDetector } from './utils/overlap-detector';
import { TaskEventEmitter, TaskEvent } from '@/lib/client/visual/task/events';
import { syncZoomWithTransform } from './hooks/useZoom';
import { taskStateCoordinator } from './task-hierarchy/state-coordinator';
import { centerAfterSplit } from '@/lib/client/visual/utils/centering';
import { isStateBeingRestored, getRestorationPhase, markElementPositioned, beginPositioningPhase } from '@/app/preload-state';
import { controlVisibilityManager } from './controls/visibility-manager';
import { counterHandler } from '@/lib/client/visual/utils/counter-handler';
import TransformSynchronizer from './transform/TransformSynchronizer';
import { CommonControlsGroup } from './common-controls/CommonControlsGroup';
import { taskControlEventDispatcher } from '@/lib/svg/controls/task/event-dispatcher';

interface WorkspaceVisualProps {
  className?: string;
}

const TASK_WIDTH = 240;
const TASK_HEIGHT = 120;

// Add class to body when document loaded to enable saved transform styles
if (typeof document !== 'undefined') {
  // Check if we have saved transform from _document.js script
  if ((window as Window & { __savedTransform?: unknown }).__savedTransform) {
    document.body.classList.add('has-saved-transform');
  }
}

export const WorkspaceVisual: React.FC<WorkspaceVisualProps>= ({
  className = ''
}) =>{
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const renderVersionRef = useRef(0);
  const previousProjectRef = useRef<string | null>(null);
  const selectedTaskRef = useRef<string | null>(null);
  const isFirstRenderRef = useRef(true);
  const renderCompleteRef = useRef(false);
  const preInitializedRef = useRef(false);
  const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(true);
  
  // Detect mobile device on initial render
  useEffect(() => {
    const detectMobileDevice = () => {
      const isMobileDevice = window.innerWidth <= 768 || 
                           /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      
      if (isMobileDevice) {
        document.body.setAttribute('data-mobile-view', 'true');
        logger.info('Mobile device detected, applying mobile optimizations', {}, 'workspace device');
      } else {
        document.body.removeAttribute('data-mobile-view');
      }
    };
    
    // Run detection immediately
    detectMobileDevice();
    
    // Add resize event listener
    window.addEventListener('resize', detectMobileDevice);
    
    // Clean up
    return () => window.removeEventListener('resize', detectMobileDevice);
  }, []);

  const { setBounds } = useWorkspaceStore();
  const dimensions = useDimensions({ containerRef });
  const { initializeZoom, isInitialized } = useZoom();
  const taskOps = useTaskOperations();
  const { splitOperation, handleSplit } = taskOps;
  const [error, setError] = useState<string | null>(null);
  
  // Initialize state persistence
  useWorkspacePersistence({
    autoSave: true,
    restoreOnMount: true
  });
  
  // Define a saveState function that uses the global saveWorkspaceState
  const saveState = useCallback(() =>{
    if (typeof window.saveWorkspaceState === 'function') {
      window.saveWorkspaceState();
    }
  }, []);

  const taskRenderer = new TaskRectangleRenderer(DEFAULT_TASK_CONFIG);
  const layoutManager = createCircularLayoutManager();  // Handle when the workspace is ready to show (transform properly applied)
  // Handle when the workspace is ready to show (transform properly applied)
  const handleWorkspaceReady = () =>{
    setIsWorkspaceLoading(false);
    logger.info('Workspace ready to display, transform properly applied', {}, 'workspace transform');
    
    // Add class to body to show we're ready with transform
    document.body.classList.add('transform-ready');
    
    // FORCE VISIBILITY of all elements
    document.querySelectorAll('.task-rect, .project-rect, .counter-display, .connection-line').forEach(el =>{
      (el as HTMLElement).style.visibility = 'visible';
      (el as HTMLElement).style.opacity = '1';
    });
    
    // Clear any lingering direct click flags that might have been left
    if (document.body.hasAttribute('data-direct-click-in-progress')) {
      document.body.removeAttribute('data-direct-click-in-progress');
    }
    
    // With the absolute positioning approach, we only need to update SVG dimensions
    // when the toggle is complete, no transform adjustments needed
    const handleSidePanelToggleComplete = () =>{
      // Update SVG dimensions to match container
      if (svgRef.current && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        svgRef.current.setAttribute('width', rect.width.toString());
        svgRef.current.setAttribute('height', rect.height.toString());
        
        logger.debug('Updated SVG dimensions after side panel toggle', {
          width: rect.width,
          height: rect.height
        }, 'workspace dimension');
      }
      
      // FORCE VISIBILITY after panel toggle
      document.querySelectorAll('.task-rect, .project-rect, .counter-display, .connection-line').forEach(el =>{
        (el as HTMLElement).style.visibility = 'visible';
        (el as HTMLElement).style.opacity = '1';
      });
    };
    
    // Add listener for side panel toggle completion
    window.addEventListener('side-panel-toggle-complete', handleSidePanelToggleComplete);
  };
  
  // Pre-apply saved transform to the SVG as soon as it's available
  useEffect(() =>{
    const savedState = getSavedViewportState();
    
    if (svgRef.current && !preInitializedRef.current && savedState) {
      preInitializedRef.current = true;
      logger.info('Pre-initializing SVG with saved state before any rendering', {
        scale: savedState.scale,
        x: savedState.translate.x,
        y: savedState.translate.y
      }, 'workspace transform');
      
      // Add workspace loading class to body to disable transitions
      document.body.classList.add('workspace-loading');
      
      // Apply saved state directly to SVG
      preInitializeSvg(svgRef.current);
      
      // Apply saved state to transform-group as soon as it appears
      const checkForTransformGroup = () =>{
        const transformGroup = document.querySelector('.transform-group');
        if (transformGroup) {
          // Apply saved transform directly to transform group
          const transform = `translate(${savedState.translate.x},${savedState.translate.y}) scale(${savedState.scale})`;
          transformGroup.setAttribute('transform', transform);
          logger.debug('Applied saved transform directly to transform-group', {}, 'workspace transform');
          
          // Remove the workspace loading class after a delay
          setTimeout(() =>{
            document.body.classList.remove('workspace-loading');
          }, 500);
        } else {
          // Check again in a moment
          setTimeout(checkForTransformGroup, 20);
        }
      };
      
      checkForTransformGroup();
    }
  }, []);

// Initialize zoom when SVG is ready
useEffect(() =>{
  if (svgRef.current && dimensions.width && dimensions.height) {
    logger.info("Initializing zoom with dimensions", { 
      width: dimensions.width, 
      height: dimensions.height,
      restorationPhase: getRestorationPhase(),
      isWorkspaceLoading
    }, 'workspace transform');
    
    // Get saved viewport state
    const savedState = getSavedViewportState();
    
    // Add class to indicate transform initialization is in progress
    document.body.classList.add('transform-initializing');
    
    // Add stronger interaction prohibition class and ensure document-wide selection prevention
    document.body.classList.add('transform-interaction-prohibited');
    
    // Also add anti-selection class to document
    document.documentElement.classList.add('prevent-selection');
    
    // Apply saved state directly before initializing zoom behavior
    if (savedState) {
      preInitializeSvg(svgRef.current);
    }
    
    // Initialize zoom behavior with project switching flag to ensure proper state handling
    initializeZoom(svgRef.current, dimensions, { 
      isProjectSwitch: previousProjectRef.current !== null && 
                       previousProjectRef.current !== workspaceStateManager.getState().selectedProject?._id?.toString()
    });
    
    // Check if this is a new project and ensure zoom is initialized immediately
    const isNewProject = sessionStorage.getItem("__new_project_needs_centering") === "true";
    if (isNewProject) {
      logger.info("New project detected, ensuring zoom is initialized immediately", {}, 'workspace project');
      // Force zoom initialization for new projects
      const forceZoomInit = () =>{
        if (!isInitialized && svgRef.current) {
          logger.debug("Forcing zoom initialization for new project", {}, 'workspace transform');
          initializeZoom(svgRef.current, dimensions, { isProjectSwitch: false });
        }
      };
      
      // Try multiple times to ensure initialization
      setTimeout(forceZoomInit, 200);
      setTimeout(forceZoomInit, 400);
      setTimeout(forceZoomInit, 600);
    }
    
    // Mark workspace as stable after a longer delay to ensure complete stabilization
    setTimeout(() => {
      // First remove prohibition classes
      document.body.classList.remove('transform-initializing', 'transform-interaction-prohibited');
      document.documentElement.classList.remove('prevent-selection');
      
      // Then add stable class
      document.body.classList.add('transform-stable');
      
      // Only make elements visible after a slight additional delay
      setTimeout(() => {
        // Make all elements visible again - with a longer fade-in
        document.querySelectorAll('.task-rect, .project-rect, .counter-display, .connection-line, svg g').forEach(el => {
          (el as HTMLElement).style.visibility = 'visible';
          (el as HTMLElement).style.opacity = '1';
          (el as HTMLElement).style.transition = 'opacity 0.3s ease-out';
        });
        
        logger.info("Elements made visible after transform stabilization", {
          timestamp: new Date().toISOString()
        }, 'workspace visibility');
      }, 300);
      
      logger.info("Transform stabilized after initialization delay, interaction enabled", {
        timestamp: new Date().toISOString()
      }, 'workspace transform');
    }, 1800); // Significantly extended delay to ensure complete stabilization
    
    // Handler for side panel toggle completion events
    const handleSidePanelToggleComplete = () =>{
      // With absolute positioning, we only need to update dimensions
      if (svgRef.current && containerRef.current) {
        // Get the container dimensions
        const rect = containerRef.current.getBoundingClientRect();
        
        // Simply update the SVG dimensions
        svgRef.current.setAttribute('width', rect.width.toString());
        svgRef.current.setAttribute('height', rect.height.toString());
        
        logger.debug('Updated SVG dimensions after side panel toggle', {
          width: rect.width,
          height: rect.height
        }, 'workspace dimension');
      }
    };
    
    // Add listener for side panel toggle completion
    window.addEventListener('side-panel-toggle-complete', handleSidePanelToggleComplete);
    
    // Clean up on unmount
    return () =>{
      window.removeEventListener('side-panel-toggle-complete', handleSidePanelToggleComplete);
      document.body.classList.remove('transform-initializing', 'transform-stable');
    };
  }
}, [dimensions.width, dimensions.height, initializeZoom, isInitialized]);

  // Apply counter handler to ensure counters are not clickable
  // and verify control positions on mobile
  useEffect(() =>{
    // This will continuously ensure counters are non-interactive
    counterHandler.disableAllCounters();
    
    // Function to verify and fix control positions on mobile
    const verifyControlPositions = () => {
      const isMobile = document.body.getAttribute('data-mobile-view') === 'true' || 
                       window.innerWidth <= 768;
      
      if (isMobile) {
        logger.debug('Verifying control positions on mobile device', {}, 'workspace control');
        
        // Get all split buttons
        const splitButtons = document.querySelectorAll('.task-split-button[data-task-id]');
        
        // Process each control
        splitButtons.forEach(button => {
          // Mark as mobile for CSS targeting
          button.setAttribute('data-mobile', 'true');
          
          // Get stored position data
          const taskId = button.getAttribute('data-task-id');
          const x = button.getAttribute('data-x');
          const y = button.getAttribute('data-y');
          
          if (taskId && x && y) {
            // Apply both SVG and CSS transforms for better compatibility
            button.setAttribute('transform', `translate(${x},${y})`);
            (button as HTMLElement).style.transform = `translate(${x}px,${y}px)`;
            
            // Ensure visibility
            (button as HTMLElement).style.visibility = 'visible';
            (button as HTMLElement).style.opacity = '1';
            (button as HTMLElement).style.display = 'block';
            
            logger.debug('Fixed control position', { taskId, x, y }, 'workspace control');
          }
        });
      }
    };
    
    // Force counter handler to run after state restoration
    const handleStateRestored = () =>{
      setTimeout(() =>{
        counterHandler.disableAllCounters();
        verifyControlPositions();
      }, 500);
    };
    
    window.addEventListener(WORKSPACE_STATE_VISUAL_READY_EVENT, handleStateRestored);
    
    // Also verify positions after viewport changes
    window.addEventListener('resize', () => {
      setTimeout(verifyControlPositions, 300);
    });
    
    window.addEventListener('orientationchange', () => {
      setTimeout(verifyControlPositions, 500);
    });
    
    // Run initial verification after a delay
    setTimeout(verifyControlPositions, 1000);
    
    return () =>{
      window.removeEventListener(WORKSPACE_STATE_VISUAL_READY_EVENT, handleStateRestored);
      window.removeEventListener('resize', verifyControlPositions);
      window.removeEventListener('orientationchange', verifyControlPositions);
    };
  }, []);

  // Set up handlers for regenerate and delete operations
  useEffect(() =>{
    // Set up regenerate and delete handlers
    const handleRegenerate = async (event: { elementId: string }) =>{
      try {
        logger.info('Handling regenerate event', { taskId: event.elementId }, 'workspace task-operation');
        await taskControlEventDispatcher.handleRegenerate(event.elementId);
      } catch (error) {
        logger.error('Failed to handle regenerate event', { taskId: event.elementId, error: String(error) }, 'workspace error');
      }
    };

    const handleDelete = async (event: { elementId: string }) =>{
      try {
        logger.info('Handling delete event', { taskId: event.elementId }, 'workspace task-operation');
        await taskControlEventDispatcher.handleDelete(event.elementId);
      } catch (error) {
        logger.error('Failed to handle delete event', { taskId: event.elementId, error: String(error) }, 'workspace error');
      }
    };

    // Add these handlers to the controller when available
    const layers = svgController.getLayers();
    if (layers) {
      const handlers = {
        split: async (event: { elementId: string }) =>{
          await handleTaskSplit(event.elementId);
        },
        regenerate: handleRegenerate,
        delete: handleDelete
      };

      // Re-initialize with the new handlers
      svgController.initialize(
        select(svgRef.current!),
        workspaceStateManager.getState().selectedProject?._id?.toString() || '',
        renderVersionRef.current,
        handlers,
        dimensions,
        taskOps
      );
    }
  }, []);

  // Handle project and task selection
  const _handleSelection = useCallback((taskId: string, rect?: DOMRect) =>{
    // If this is the same selection, skip
    if (selectedTaskRef.current === taskId) return;
    
    // Update selected task ref
    selectedTaskRef.current = taskId;
    
    // Get current state
    const state = workspaceStateManager.getState();
    
    // If no project selected, can't proceed
    if (!state.selectedProject) return;
    
    // Check if this is the project itself
    const isProject = taskId === state.selectedProject._id.toString();
    
    logger.info('[WORKSPACE] Handling selection from direct click', { 
      taskId,
      isProject,
      projectId: state.selectedProject._id.toString(),
      hasRect: !!rect,
      calledFrom: 'workspace.handleSelection',
      _style: 'background-color: #673AB7; color: white; padding: 2px 5px; border-radius: 3px;'
    }, 'workspace selection');
    
    // NOTE: This handler should mostly be unused now as the task/project rectangles
    // call the taskStateCoordinator directly. This remains as a fallback.      // Save state after selection
      setTimeout(() =>{
        saveState();
      }, 100);// Ensure counters are non-interactive
    setTimeout(() =>{
      counterHandler.disableAllCounters();
    }, 200);
  }, [saveState]);  
  
  // Handle task splitting
  const handleTaskSplit = useCallback(async (taskId: string) =>{
    try {
      // Skip if the click was on a counter
      const isCounterClick = document.activeElement?.classList.contains('counter-display') || 
                             document.activeElement?.classList.contains('project-counter') ||
                             document.activeElement?.getAttribute('data-project-counter') === 'true';
      
      if (isCounterClick) {
        logger.debug('Ignoring split attempt from counter click', { taskId }, 'workspace interaction');
        return;
      }
      
      // Set controller state to splitting
      svgController.setControllerState(CONTROLLER_STATES.SPLITTING);
      
      // Add class to body to disable interactions during splitting
      document.body.classList.add('splitting-in-progress');
      
      logger.info('Handling task split', { 
        taskId, 
        interactionState: 'disabled' 
      }, 'workspace task-operation');
      
      // Emit split event
      TaskEventEmitter.getInstance().emit({
        taskId,
        type: 'split'
      });
      
      // Execute the split operation
      await handleSplit(taskId);
      
      // Emit split complete event
      TaskEventEmitter.getInstance().emit({
        taskId,
        type: 'splitComplete'
      });
      
      // Get updated state
      const state = workspaceStateManager.getState();
      
      // Find the split task
      const splitTask = state.tasks.find(t =>t._id?.toString() === taskId);
      
      if (splitTask) {
        // Center viewport on the split task after a delay
        setTimeout(() =>{
          // Find the task element by ID
          const taskElement = document.getElementById(`task-${taskId}`);
          
          if (taskElement) {
            // Use the centralized centering utility
            centerAfterSplit(taskId).then(() =>{
              // Force visibility update
              setTimeout(() =>{
                // Remove splitting-in-progress class to re-enable interactions
                document.body.classList.remove('splitting-in-progress');
                
                controlVisibilityManager.updateVisibility();
                
                // Ensure counters are non-interactive
                counterHandler.disableAllCounters();
                
                logger.info('Split operation completed, interactions re-enabled', { 
                  taskId, 
                  interactionState: 'enabled' 
                }, 'workspace task-operation');
              }, 100);
            });
          } else {
            // Fall back to task selection without centering
            taskStateCoordinator.handleTaskSelection(taskId);
            
            // Reset controller state
            svgController.setControllerState(CONTROLLER_STATES.IDLE);
            
            // Remove splitting-in-progress class to re-enable interactions
            document.body.classList.remove('splitting-in-progress');
            
            logger.info('Split operation completed (fallback path), interactions re-enabled', { 
              taskId, 
              interactionState: 'enabled' 
            }, 'workspace task-operation');
          }
        }, 300);
      } else {
        // Reset controller state
        svgController.setControllerState(CONTROLLER_STATES.IDLE);
        
        // Remove splitting-in-progress class to re-enable interactions
        document.body.classList.remove('splitting-in-progress');
        
        logger.info('Split operation completed (no task found), interactions re-enabled', { 
          taskId, 
          interactionState: 'enabled' 
        }, 'workspace task-operation');
      }
    } catch (error) {
      // Log the error for debugging purposes
      logger.error('Error during task split operation', { 
        taskId, 
        error: String(error) 
      }, 'workspace error');
      
      // Reset controller state
      svgController.setControllerState(CONTROLLER_STATES.IDLE);
      
      // Remove splitting-in-progress class to re-enable interactions even on error
      document.body.classList.remove('splitting-in-progress');
      
      logger.info('Split operation failed, interactions re-enabled', { 
        taskId, 
        interactionState: 'enabled' 
      }, 'workspace task-operation');
    }
  }, [handleSplit]);

  // Handle task event listener
  useEffect(() =>{
    const handleTaskEvent = (event: TaskEvent) =>{
      // Handle selection events
      if (event.type === 'stateChange' && event.data) {
        const data = event.data as { 
          state: string; 
          rect?: DOMRect; 
          isComplete?: boolean;
          isStarting?: boolean;
          directClick?: boolean;
        };
        
        // Only handle main selection events (not sub-events)
        if ((data.state === 'selected' || data.state === 'projectSelected') && 
            !data.isComplete && !data.isStarting) {
          // Reset any active control mode from CommonControlsGroup
          window.dispatchEvent(new CustomEvent('reset-common-controls'));
          
          // Check for direct click flag on the document body
          const hasDirectClickFlag = document.body.getAttribute('data-direct-click-in-progress') === event.taskId;
          const isDirectClick = data.directClick === true || hasDirectClickFlag;
          
          // If this is a direct click (flagged by handleSelection), 
          // the taskStateCoordinator will handle the centering directly.
          // If not, we just update the reference.
          if (!isDirectClick) {
            // Just update the selected task reference without triggering centering
            selectedTaskRef.current = event.taskId;
            
            // Prevent any duplicate centering operations for this event
            logger.debug('Task selection handled by event listener, not triggering centering', {
              taskId: event.taskId,
              state: data.state,
              hasDirectClickFlag
            }, 'workspace interaction');
          } else {
            logger.debug('Direct click event received, centering handled by coordinator', {
              taskId: event.taskId,
              state: data.state,
              hasDirectClickFlag
            }, 'workspace interaction');
          }
        }
      }
    };
    
    // Listen for task events
    const removeListener = TaskEventEmitter.getInstance().addListener(handleTaskEvent);
    
    return () =>removeListener();
  }, []);

  // Handle workspace state changes
  useEffect(() =>{
    const unsubscribe = workspaceStateManager.subscribe((state, updateType) =>{
      logger.debug('Workspace state update received', { updateType }, 'workspace state');

      const newProjectId = state.selectedProject?._id?.toString() || null;
      
      // Project change detection
      if (newProjectId !== previousProjectRef.current) {
        logger.info('Project change detected', {
          from: previousProjectRef.current,
          to: newProjectId
        }, 'workspace project');

        // Reset first render flag
        isFirstRenderRef.current = true;
        renderCompleteRef.current = false;

        // Reset selected task reference
        selectedTaskRef.current = null;

        // Force SVG cleanup on project change
        if (svgRef.current) {
          const svg = select(svgRef.current);
          svg.selectAll('*').remove();
          svgController.cleanup(svg);

          // Clear managers
          svgOrderManager.clear();
          overlapDetector.clear();
          
          // Re-initialize zoom
          if (dimensions.width && dimensions.height) {
            initializeZoom(svgRef.current, dimensions);
          }
        }

        previousProjectRef.current = newProjectId;
        renderVersionRef.current++;
      }

      // For loading state changes or project changes, increment render version
      if (updateType === 'loading' || updateType === 'project') {
        renderVersionRef.current++;
      }

      // For visual updates, just trigger a re-render
      if (updateType === 'visual') {
        renderVersionRef.current++;
      }
      
      // Save state after significant updates
      if (['project', 'visual'].includes(updateType) && !state.isLoading) {
        // Add a slight delay to ensure the visual state is fully updated
        setTimeout(() =>{
          saveState();
        }, 100);
      }
    });
    
    return unsubscribe;
  }, [dimensions, initializeZoom, saveState]);

  // Update workspace bounds
  useEffect(() =>{
    if (dimensions.width && dimensions.height) {
      setBounds(dimensions);
    }
  }, [dimensions, setBounds]);

  // Get task parent
  const getTaskParent = (task: Task, tasks: Task[]): Task | null =>{
    if (!task.parentId) return null;
    return tasks.find(t =>t._id && task.parentId && t._id.toString() === task.parentId.toString()) || null;
  };

  // Get task state
  const getTaskState = (taskId: string): TaskVisualState =>{
    const state = workspaceStateManager.getState();
    return state.taskVisualStates.get(taskId) || 'active';
  };

  // Calculate task counts
  const calculateTaskCounts = (tasks: Task[]): Record<string, { childrenCount: number; descendantCount: number }>=>{
    // Initialize counts
    const counts: Record<string, { childrenCount: number; descendantCount: number }>= {};

    // First pass: count direct children
    tasks.forEach(task =>{
      const taskId = task._id?.toString();
      if (!taskId) return;

      // Initialize if not exists
      if (!counts[taskId]) {
        counts[taskId] = { childrenCount: 0, descendantCount: 0 };
      }

      // Increment parent's childrenCount
      if (task.parentId) {
        const parentId = task.parentId.toString();
        if (!counts[parentId]) {
          counts[parentId] = { childrenCount: 0, descendantCount: 0 };
        }
        counts[parentId].childrenCount++;
      }
    });

    // Recursive function to calculate descendants
    const calculateDescendants = (taskId: string): number =>{
      const directChildren = tasks.filter(t =>t.parentId?.toString() === taskId);
      let total = directChildren.length;

      directChildren.forEach(child =>{
        if (child._id) {
          total += calculateDescendants(child._id.toString());
        }
      });

      return total;
    };

    // Second pass: calculate descendant counts
    tasks.forEach(task =>{
      const taskId = task._id?.toString();
      if (!taskId) return;

      counts[taskId].descendantCount = calculateDescendants(taskId);
    });

    // Add count for project
    const state = workspaceStateManager.getState();
    const projectId = state.selectedProject?._id?.toString();
    
    if (projectId && !counts[projectId]) {
      const rootTasks = tasks.filter(t =>!t.parentId || (t.parentId && t.parentId.toString() === projectId));
      let descendantCount = rootTasks.length;

      rootTasks.forEach(task =>{
        if (task._id) {
          const taskId = task._id.toString();
          if (counts[taskId]) {
            descendantCount += counts[taskId].descendantCount;
          }
        }
      });

      counts[projectId] = {
        childrenCount: rootTasks.length,
        descendantCount
      };
    }

    return counts;
  };

  // Render the workspace
  useEffect(() =>{
    try {
      // Skip if no SVG or dimensions
      if (!svgRef.current || !dimensions.width || !dimensions.height) {
        return;
      }

      const state = workspaceStateManager.getState();
      
      // Skip if loading or no project/tasks
      if (state.isLoading || !state.selectedProject || !state.tasks.length) {
        return;
      }

      // Get current version to prevent stale renders
      const currentVersion = renderVersionRef.current;
      const svg = select(svgRef.current);
      
      // Check if we're in state restoration
      const stateBeingRestored = isStateBeingRestored();
      const restorationPhase = getRestorationPhase();
      
      logger.debug('Rendering workspace', {
        version: currentVersion,
        projectId: state.selectedProject._id.toString(),
        taskCount: state.tasks.length,
        stateBeingRestored,
        restorationPhase,
        isFirstRender: isFirstRenderRef.current,
        renderComplete: renderCompleteRef.current,
        zoomInitialized: isInitialized,
        isWorkspaceLoading
      }, 'workspace rendering');
      
      // Skip during certain phases of state restoration
      if (stateBeingRestored && restorationPhase !== 'positioning' && restorationPhase !== 'revealing') {
        logger.debug('Skipping render during state restoration phase', { restorationPhase }, 'workspace state');
        return;
      }
      
      // Only initialize SVG controller if project changed or first render
      let layers = svgController.getLayers();
      
      if (!layers || state.selectedProject._id.toString() !== previousProjectRef.current) {
        layers = svgController.initialize(
          svg,
          state.selectedProject._id.toString(),
          currentVersion,
          {
            split: async (event) =>{
              await handleTaskSplit(event.elementId);
            },
            regenerate: async (event) =>{
              logger.info('Handling regenerate event', { taskId: event.elementId }, 'workspace task-operation');
              await taskControlEventDispatcher.handleRegenerate(event.elementId);
            },
            delete: async (event) =>{
              logger.info('Handling delete event', { taskId: event.elementId }, 'workspace task-operation');
              await taskControlEventDispatcher.handleDelete(event.elementId);
            }
          },
          dimensions,
          taskOps
        );

        if (!layers) {
          throw new Error('Failed to initialize layers');
        }

        // Setup SVG order manager
        if (layers.content.node() && layers.controls) {
          svgOrderManager.setLayers(
            layers.content.node() as SVGGElement,
            layers.controls.group.node() as SVGGElement
          );
        }
      }

      const contentNode = layers.content.node();
      if (!contentNode) {
        return;
      }

      // Create task layout elements
      const elements: LayoutElement[] = state.tasks.map(task =>({
        id: task._id ? task._id.toString() : "",
        parentId: task.parentId?.toString(),
        position: { x: 0, y: 0 },
        dimensions: { width: TASK_WIDTH, height: TASK_HEIGHT }
      })).filter(el =>el.id !== "");

      // Calculate project position
      const projectPosition = {
        x: Math.max(0, (dimensions.width - PROJECT_WIDTH) / 2),
        y: Math.max(0, (dimensions.height - PROJECT_HEIGHT) / 2) // Changed from /3 to /2 for true centering
      };

      const projectRect = {
        x: projectPosition.x,
        y: projectPosition.y,
        width: PROJECT_WIDTH,
        height: PROJECT_HEIGHT
      };

      // Calculate all task counts
      const allCounts = calculateTaskCounts(state.tasks);
      const projectId = state.selectedProject._id.toString();

      // Determine if we should animate
      const shouldAnimate = isFirstRenderRef.current && !stateBeingRestored;
      
      // Reset first render flag
      isFirstRenderRef.current = false;

      // Get project counts and state
      const projectCounts = allCounts[projectId] || { childrenCount: 0, descendantCount: 0 };
      const projectState = state.taskVisualStates.get(projectId) || 'active';
      
      // Create project data
      const projectRectData: TaskRect = {
        id: projectId,
        type: 'task',
        position: projectPosition,
        dimensions: { width: PROJECT_WIDTH, height: PROJECT_HEIGHT },
        state: projectState,
        text: {
          title: state.selectedProject.name,
          description: state.selectedProject.description
        },
        isProject: true,
        childrenCount: projectCounts.childrenCount,
        descendantCount: projectCounts.descendantCount
      };

      // Clear existing content
      layers.content.selectAll('*').remove();
      layers.connections.selectAll('*').remove();

      // Add appropriate class for state restoration
      const _elementClass = stateBeingRestored ? 'sr-pending' : '';

      // Render project
      const projectElement = projectRectangleRenderer.render(contentNode, projectRectData, { 
        animate: shouldAnimate
      });
      
      // Add sr-pending class if restoring state
      if (projectElement && stateBeingRestored) {
        select(projectElement).classed('sr-pending', true);
        
        // Track element for state restoration
        markElementPositioned();
      }

      // Create project counter
      if (layers.controls && projectCounts.childrenCount >0) {
        layers.controls.updateProjectCounter({
          projectId,
          x: projectPosition.x,
          y: projectPosition.y,
          width: PROJECT_WIDTH,
          height: PROJECT_HEIGHT,
          childrenCount: projectCounts.childrenCount,
          descendantCount: projectCounts.descendantCount,
          state: projectState
        });
        
        // Add sr-pending class if restoring state
        if (stateBeingRestored) {
          select(`.project-counter-${projectId}`).classed('sr-pending', true);
          
          // Track element for state restoration
          markElementPositioned();
        }
      }

      // Distribute tasks in layout
      layoutManager.distribute(elements, {
        ...DEFAULT_LAYOUT_OPTIONS,
        screenBounds: dimensions
      }).then(layoutedElements =>{
        // Skip if render version has changed
        if (currentVersion !== renderVersionRef.current) return;

        // Collect tasks by visibility
        const visibleTasks = new Set<string>();
        const hiddenTasks = new Set<string>();

        // Process all task elements
        layoutedElements.forEach((element) =>{
          const task = state.tasks.find(t =>t._id && t._id.toString() === element.id);
          if (!task || !element.position || !task._id) {
            return;
          }

          const taskId = task._id.toString();
          const taskState = getTaskState(taskId);

          // Add task to appropriate visibility set
          if (taskState === 'hidden') {
            hiddenTasks.add(taskId);
            return;
          } else {
            visibleTasks.add(taskId);
          }

          // Create task rectangle
          const taskRect = {
            x: element.position.x,
            y: element.position.y,
            width: TASK_WIDTH,
            height: TASK_HEIGHT
          };

          // Calculate opacity and z-index based on state
          const opacity = taskState === 'semi-transparent' ? 0.5 : 1;
          const zIndex = taskState === 'active' ? 5 : 3;

          // Get task parent
          const parent = getTaskParent(task, state.tasks);

          // Draw connection to parent
          if (parent) {
            const parentId = parent._id?.toString();

            if (parentId) {
              const parentState = getTaskState(parentId);

              // Only draw connections between visible elements
              if (parentState !== 'hidden') {
                const parentElement = layoutedElements.find(e =>e.id === parentId);

                if (parentElement?.position) {
                  const parentRect = {
                    x: parentElement.position.x,
                    y: parentElement.position.y,
                    width: TASK_WIDTH,
                    height: TASK_HEIGHT
                  };

                  // Set connection opacity based on task state
                  const connectionOpacity = taskState === 'semi-transparent' ? 0.5 : 1;

                  // Draw connection
                  const connection = connectionDrawer.drawConnection(
                    layers.connections,
                    parentRect,
                    taskRect,
                    connectionOpacity,
                    zIndex,
                    shouldAnimate
                  );
                  
                  // Add sr-pending class if restoring state
                  if (connection && stateBeingRestored) {
                    select(connection).classed('sr-pending', true);
                    
                    // Track element for state restoration
                    markElementPositioned();
                  }
                }
              }
            }
          } else {
            // Connection from project to first-level tasks
            const connection = connectionDrawer.drawConnection(
              layers.connections,
              projectRect,
              taskRect,
              opacity,
              2,
              shouldAnimate
            );
            
            // Add sr-pending class if restoring state
            if (connection && stateBeingRestored) {
              select(connection).classed('sr-pending', true);
              
              // Track element for state restoration
              markElementPositioned();
            }
          }

          // Get task counts
          const taskCounts = allCounts[taskId] || { childrenCount: 0, descendantCount: 0 };

          // Create task rect data
          const taskRectData: TaskRect = {
            id: taskId,
            type: 'task',
            position: element.position,
            dimensions: element.dimensions,
            state: taskState,
            text: {
              title: task.name,
              description: task.description
            },
            childrenCount: taskCounts.childrenCount,
            descendantCount: taskCounts.descendantCount,
            parentId: parent && parent._id ? parent._id.toString() : `project-${projectId}`,
            isPartOfChain: taskState === 'semi-transparent'
          };

          // Render task
          const taskGroup = taskRenderer.render(contentNode, taskRectData, { 
            animate: shouldAnimate
          });

          if (taskGroup) {
            const taskElement = select(taskGroup);
            
            // Add sr-pending class if restoring state
            if (stateBeingRestored) {
              taskElement.classed('sr-pending', true);
              
              // Track element for state restoration
              markElementPositioned();
            }
            
            // Get content height
            const contentHeight = taskElement.node() ?
              Number(taskElement.attr('data-content-height')) || element.dimensions.height :
              element.dimensions.height;

            // Add data-task-id attribute
            taskElement.attr('data-task-id', taskId);

            // Update control position
            layers.controls.updateTaskPosition(taskId, {
              taskId,
              x: element.position.x,
              y: element.position.y,
              width: element.dimensions.width,
              height: element.dimensions.height,
              contentHeight,
              childrenCount: taskCounts.childrenCount,
              descendantCount: taskCounts.descendantCount,
              state: taskState
            });
            
            // Add sr-pending class to controls if restoring state
            if (stateBeingRestored) {
              select(`.task-control-${taskId}`).classed('sr-pending', true);
              
              // Track element for state restoration
              markElementPositioned();
            }
          }
        });

        // Notify control layer about hidden tasks
        layers.controls.setHiddenTasks(Array.from(hiddenTasks));

        // Apply final ordering
        svgOrderManager.applyOrder();
        
        // Mark rendering as complete
        renderCompleteRef.current = true;
        
        // During state restoration, signal that elements are positioned
        if (stateBeingRestored && restorationPhase === 'loading') {
          // Transition to positioning phase
          beginPositioningPhase();
        }      // Check if this is a new project that needs centering
      // Parse the detailed flag if it exists
      let isNewProject = false;
      let newProjectData = null;
      try {
        const newProjectFlag = sessionStorage.getItem('__new_project_needs_centering');
        if (newProjectFlag) {
          if (newProjectFlag === 'true') {
            // Handle the simple boolean flag for backward compatibility
            isNewProject = true;
          } else {
            // Try to parse as JSON for the enhanced flag
            newProjectData = JSON.parse(newProjectFlag);
            isNewProject = !!newProjectData;
            
            // Log the detailed project data
            if (newProjectData) {
              logger.debug('Found detailed new project data', { 
                projectId: newProjectData.projectId,
                timestamp: newProjectData.timestamp,
                dimensions: newProjectData.dimensions,
                zoomScale: newProjectData.zoomScale
              }, 'workspace project');
            }
          }
        }
      } catch (error) {
        // If JSON parsing fails, fall back to simple boolean check
        isNewProject = !!sessionStorage.getItem('__new_project_needs_centering');
        logger.warn('Error parsing new project data, falling back to boolean flag', { error }, 'workspace error');
      }if (isNewProject && !stateBeingRestored && projectId) {
                // Add class to hide elements until centered
                document.body.classList.add('hide-elements-until-centered');
                
                logger.info('New project detected, hiding elements until properly centered', { projectId }, 'workspace project');
                
                // Clear the new project centering flag to prevent duplicate processing
                sessionStorage.removeItem('__new_project_needs_centering');
                
                // Use a more direct approach to center correctly
                setTimeout(async () =>{
                  try {
                    if (!svgRef.current) {
                      logger.warn('SVG element not available for centering', {}, 'workspace error');
                      document.body.classList.remove('hide-elements-until-centered');
                      return;
                    }
                    
                    // Import the dedicated centering calculation function from constants
                    const calculateProjectCenterModule = await import('@/lib/client/layout/constants');
                    const { calculateProjectCenter } = calculateProjectCenterModule;
                    
                    // Get the SVG dimensions
                    const svgRect = svgRef.current.getBoundingClientRect();
                    const svgWidth = svgRect.width;
                    const svgHeight = svgRect.height;
                    
                    // Get the project dimensions
                    const projectWidth = PROJECT_WIDTH;
                    const projectHeight = PROJECT_HEIGHT;
                    
                    // Calculate the center position using the utility function
                    const centerPosition = calculateProjectCenter(
                      svgWidth,
                      svgHeight,
                      projectWidth,
                      projectHeight
                    );
                    
                    logger.info('Calculated centering values for new project', {
                      svgDimensions: { width: svgWidth, height: svgHeight },
                      projectDimensions: { width: projectWidth, height: projectHeight },
                      centerPosition: {
                        x: centerPosition.x,
                        y: centerPosition.y,
                        scale: centerPosition.scale
                      }
                    }, 'workspace transform');
                    
                    // Get transform group
                    const transformGroup = document.querySelector('.transform-group');
                    if (transformGroup) {
                      // First reset the transform to ensure clean application
                      transformGroup.setAttribute('transform', 'translate(0,0) scale(1)');
                      
                      // Force a reflow to ensure the reset is applied
                      svgRef.current.getBoundingClientRect();
                      
                      // Apply the calculated transform
                      const newTransform = `translate(${centerPosition.x}, ${centerPosition.y}) scale(${centerPosition.scale})`;
                      transformGroup.setAttribute('transform', newTransform);
                      
                      logger.info('Applied calculated transform for new project', {
                        x: centerPosition.x,
                        y: centerPosition.y,
                        scale: centerPosition.scale,
                        transform: newTransform
                      }, 'workspace transform');
                      
                      // Ensure transform coordinator is updated
                      try {
                        const coordinator = (window as Window & { 
                          __transformCoordinator?: { 
                            setInitialTransform: (transform: { scale: number; translate: { x: number; y: number } }) => void 
                          } 
                        }).__transformCoordinator;
                        if (coordinator && typeof coordinator.setInitialTransform === 'function') {
                          coordinator.setInitialTransform({
                            scale: centerPosition.scale,
                            translate: {
                              x: centerPosition.x,
                              y: centerPosition.y
                            }
                          });
                        }
                      } catch (coordError) {
                        logger.warn('Error updating transform coordinator', { error: coordError }, 'workspace error');
                      }
                      
                      // Make sure zoom is synchronized
                      if (svgRef.current) {
                        syncZoomWithTransform(svgRef.current);
                      }
                      
                      // Save state with correct positioning
                      setTimeout(() =>{
                        if (typeof window.saveWorkspaceState === 'function') {
                          window.saveWorkspaceState();
                        }
                      }, 100);
                      
                      // Verify project is centered correctly
                      setTimeout(() =>{
                        // Find the project element now that it should be rendered
                        const projectElement = document.getElementById(`project-${projectId}`);
                        if (projectElement) {
                          const projectRect = projectElement.getBoundingClientRect();
                          const projectCenterX = projectRect.left + projectRect.width / 2;
                          const projectCenterY = projectRect.top + projectRect.height / 2;
                          const svgCenterX = svgRect.left + svgRect.width / 2;
                          const svgCenterY = svgRect.top + svgRect.height / 2;
                          
                          // Calculate offset from center
                          const offsetX = Math.abs(svgCenterX - projectCenterX);
                          const offsetY = Math.abs(svgCenterY - projectCenterY);
                          
                          logger.debug('Verifying project centering', {
                            projectCenter: { x: projectCenterX, y: projectCenterY },
                            svgCenter: { x: svgCenterX, y: svgCenterY },
                            offset: { x: offsetX, y: offsetY }
                          }, 'workspace transform');
                          
                          // Apply correction if needed (offset is too large)
                          if (offsetX >5 || offsetY >5) {
                            logger.info('Applying centering correction, project not precisely centered', {
                              offsetX,
                              offsetY
                            }, 'workspace transform');
                            
                            // Calculate correction
                            const correctionX = svgCenterX - projectCenterX;
                            const correctionY = svgCenterY - projectCenterY;
                            
                            // Get current transform
                            const transform = transformGroup.getAttribute('transform') || '';
                            const match = transform.match(/translate\(([^,]+),\s*([^)]+)\)\s*scale\(([^)]+)\)/);
                            
                            if (match && match.length >= 4) {
                              const currentX = parseFloat(match[1]);
                              const currentY = parseFloat(match[2]);
                              const scale = parseFloat(match[3]);
                              
                              // Apply the correction
                              const correctedX = currentX + correctionX;
                              const correctedY = currentY + correctionY;
                              const correctedTransform = `translate(${correctedX}, ${correctedY}) scale(${scale})`;
                              
                              transformGroup.setAttribute('transform', correctedTransform);
                              
                              logger.info('Applied centering correction', {
                                from: { x: currentX, y: currentY },
                                to: { x: correctedX, y: correctedY },
                                offset: { x: correctionX, y: correctionY }
                              }, 'workspace transform');
                              
                              // Sync zoom again after correction
                              syncZoomWithTransform(svgRef.current);
                            }
                          }
                        }
                      }, 150);
                    }
                    
                    // Short delay before showing elements
                    setTimeout(() =>{
                      // Remove hiding class to show elements in correct position
                      document.body.classList.remove('hide-elements-until-centered');
                      
                      // Dispatch project-ready event
                      document.dispatchEvent(new CustomEvent('project-ready'));
                      
                      logger.info('Elements revealed after centering', { projectId }, 'workspace visibility');
                      
                      // Additional save after showing elements
                      if (typeof window.saveWorkspaceState === 'function') {
                        window.saveWorkspaceState();
                      }
                    }, 200);
                  } catch (error) {
                    logger.error('Error applying centering for new project', { 
                      projectId, 
                      error: error instanceof Error ? error.message : String(error) 
                    }, 'workspace error');
                    
                    // Remove hiding class even if there's an error
                    document.body.classList.remove('hide-elements-until-centered');
                    
                    // Still dispatch ready event for fallback
                    document.dispatchEvent(new CustomEvent('project-ready'));
                  }
                }, 200);
              }// After positioning, make sure zoom behavior is synced
        if (svgRef.current && isInitialized) {
          syncZoomWithTransform(svgRef.current);
        }
        
        // Force visibility update after render
        setTimeout(() =>{
          controlVisibilityManager.updateVisibility();
          
          // Ensure counters are non-interactive
          counterHandler.disableAllCounters();
          
          // Dispatch event to signal ready state
          window.dispatchEvent(new CustomEvent(WORKSPACE_STATE_VISUAL_READY_EVENT));
          
          // Mark workspace as ready
          handleWorkspaceReady();
        }, 100);
      });

      setError(null);

    } catch (err) {
      logger.error('Workspace render failed', { error: err }, 'workspace error');
      setError('Failed to render workspace');
    }
  }, [dimensions, renderVersionRef.current, isInitialized, taskOps, isWorkspaceLoading]);

  // Wrap the SVG in the TransformSynchronizer
  return (
    <div ref={containerRef} className={`relative w-full h-full ${className}`}>
      <TransformSynchronizer>
        <svg
          ref={svgRef}
          width={dimensions.width}
          height={dimensions.height}
          className="w-full h-full"
          style={{ 
            /* Ensure the SVG doesn't apply any unexpected transformations */
            transformOrigin: '0 0',
            overflow: 'visible'
          }}
        ></svg>
      </TransformSynchronizer>
      
      {/* Add Common Controls Group directly without wrapper - positioned below header */}
      <CommonControlsGroup 
        className="pointer-events-auto fixed top-[70px] right-4 z-[9999]" 
      />
      
      {(error || splitOperation.error) && (
        <div className="absolute bottom-4 right-4 bg-red-50 text-red-600 px-4 py-2 rounded shadow z-50">
          {error || splitOperation.error}
        </div>
      )}
    </div>
  );
};

export default WorkspaceVisual;
