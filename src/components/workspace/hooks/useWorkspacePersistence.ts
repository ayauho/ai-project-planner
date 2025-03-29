'use client';

import { useCallback, useRef, useEffect, useState } from 'react';
import { logger } from '@/lib/client/logger';
import { workspaceStateManager } from '@/lib/workspace/state/manager';
import { workspacePersistenceManager } from '@/lib/workspace/persistence/manager';
import { UIState } from '@/lib/workspace/persistence/types';
import { AUTO_SAVE_INTERVAL } from '@/lib/workspace/persistence/constants';
import { TaskEventEmitter } from '@/lib/client/visual/task/events';
import { useViewportState } from '../visual/hooks/useViewportState';
import { setSavedViewportState, forceApplySavedState } from '../visual/hooks/useZoom';
import { isStateBeingRestored, getRestorationPhase, beginStateRestoration } from '@/app/preload-state';

// Import the overlap detector and control visibility manager directly
import { overlapDetector } from '@/components/workspace/visual/utils/overlap-detector';
import { controlVisibilityManager } from '@/components/workspace/visual/controls/visibility-manager';

/**
 * Create custom events for state restoration process
 */
export const WORKSPACE_STATE_RESTORED_EVENT = 'workspace-state-restored';
export const WORKSPACE_STATE_VISUAL_READY_EVENT = 'workspace-state-visual-ready';

// Import TaskVisualState type
import { TaskVisualState } from '@/lib/workspace/state/types';

// Define interface for control visibility manager and overlap detector
interface ControlVisibilityManager {
  updateVisibility: () => void;
}

// Define a more generic interface for the overlapDetector
// without specifics since the actual implementation may vary
type OverlapDetectorType = Record<string, unknown>;

interface _TransformCoordinator {
  setRestorationTransform: (transform: { scale: number, translate: { x: number, y: number } }) => void;
  setInitialTransform: (transform: { scale: number, translate: { x: number, y: number } }, lock?: boolean, save?: boolean) => void;
}

// Define window extensions
declare global {
  interface Window {
    controlVisibilityManager?: ControlVisibilityManager;
    overlapDetector?: OverlapDetectorType;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    __transformCoordinator?: any; // Must use any to match existing declarations elsewhere
    saveWorkspaceState?: () => void;
  }
}

// Make utilities available on window for debugging
if (typeof window !== 'undefined') {
  // Use type assertions to ensure compatibility with the declared types
  window.controlVisibilityManager = controlVisibilityManager as ControlVisibilityManager;
  // Use a more general typing for overlapDetector to avoid type issues
  window.overlapDetector = overlapDetector as unknown as OverlapDetectorType;
}

interface UseWorkspacePersistenceOptions {
  autoSave?: boolean;
  restoreOnMount?: boolean;
}

export const useWorkspacePersistence = ({
  autoSave = true,
  restoreOnMount = true
}: UseWorkspacePersistenceOptions = {}) => {
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const initialLoadCompleteRef = useRef(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const { getCurrentViewportState } = useViewportState();
  
  // Reference to project list container
  const projectListRef = useRef<HTMLElement | null>(null);
  
  /**
   * Track save operations to prevent duplicates within a short timeframe
   */
  const lastSaveTimeRef = useRef<number>(0);
  const savePendingRef = useRef<boolean>(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedStateRef = useRef<{
    viewport: { scale: number, translate: { x: number, y: number } },
    selectedTaskId: string | null,
    taskVisualStatesCount: number,
    tasksCount?: number
  } | null>(null);

  /**
   * Get the current UI state (project list scroll position, etc.)
   */
  const getCurrentUIState = useCallback((): UIState => {
    let projectListScrollPosition = 0;
    
    // Try to find the project list element
    const projectList = document.querySelector('[data-project-list]') || projectListRef.current;
    if (projectList) {
      projectListScrollPosition = projectList.scrollTop;
      projectListRef.current = projectList as HTMLElement;
    }
    
    return {
      projectListScrollPosition
    };
  }, []);
  
  /**
   * Save current state with deduplication
   */
  const saveState = useCallback(async (forceSave = false) => {
    try {
      // Don't save while we're restoring state
      if (isStateBeingRestored()) {
        logger.debug('Skipping state save during restoration', {}, 'state persistence');
        return;
      }
      
      const currentState = workspaceStateManager.getState();
      if (!currentState.selectedProject) {
        logger.debug('No project selected, skipping state save', {}, 'state persistence');
        return;
      }
      
      const projectId = currentState.selectedProject._id.toString();
      const viewport = getCurrentViewportState();
      const uiState = getCurrentUIState();
      
      // Ensure viewport values are valid numbers before saving
      if (isNaN(viewport.scale) || isNaN(viewport.translate.x) || isNaN(viewport.translate.y)) {
        logger.warn('Invalid viewport values, fixing before save', {
          viewport,
          projectId
        }, 'state persistence viewport');
        
        // Apply fixes
        if (isNaN(viewport.scale)) viewport.scale = 1;
        if (isNaN(viewport.translate.x)) viewport.translate.x = 0;
        if (isNaN(viewport.translate.y)) viewport.translate.y = 0;
      }
      
      // Get updated task visual states count and task count
      const taskVisualStatesCount = currentState.taskVisualStates.size;
      const tasksCount = currentState.tasks.length;
      
      // Check if the state is different from the last saved state to avoid duplicates
      const newStateFingerprint = {
        viewport,
        selectedTaskId,
        taskVisualStatesCount,
        tasksCount
      };
      
      const now = Date.now();
      const timeSinceLastSave = now - lastSaveTimeRef.current;
      const minSaveInterval = 300; // ms between saves
      
      // Skip if we just saved very similar state recently (unless forced)
      if (!forceSave && 
          timeSinceLastSave < minSaveInterval && 
          lastSavedStateRef.current && 
          lastSavedStateRef.current.selectedTaskId === selectedTaskId &&
          lastSavedStateRef.current.taskVisualStatesCount === taskVisualStatesCount &&
          lastSavedStateRef.current.tasksCount === tasksCount &&
          Math.abs(lastSavedStateRef.current.viewport.scale - viewport.scale) < 0.001 &&
          Math.abs(lastSavedStateRef.current.viewport.translate.x - viewport.translate.x) < 1 &&
          Math.abs(lastSavedStateRef.current.viewport.translate.y - viewport.translate.y) < 1) {
        
        logger.debug('Skipping duplicate state save', {
          timeSinceLastSave,
          projectId
        }, 'state persistence optimization');
        return;
      }
      
      // If a save is already scheduled, clear it
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      
      // If we're saving too frequently, delay this save
      if (!forceSave && timeSinceLastSave < minSaveInterval) {
        if (!savePendingRef.current) {
          savePendingRef.current = true;
          saveTimeoutRef.current = setTimeout(() => {
            savePendingRef.current = false;
            saveTimeoutRef.current = null;
            saveState(true); // Force save when the timeout completes
          }, minSaveInterval - timeSinceLastSave + 50) as unknown as NodeJS.Timeout;
        }
        return;
      }
      
      // Update the last save time and state
      lastSaveTimeRef.current = now;
      lastSavedStateRef.current = newStateFingerprint;
      
      // Check for stale task visual states
      const taskIds = new Set(currentState.tasks.map(t => t._id?.toString()).filter(Boolean));
      const staleVisualStates = Array.from(currentState.taskVisualStates.keys())
        .filter(id => !taskIds.has(id) && id !== projectId)
        .length;
      
      // Log with distinctive styling for important operations
      logger.info('[SAVE STATE] 💾 Saving workspace state', { 
        projectId,
        selectedTaskId,
        viewport: {
          scale: viewport.scale,
          x: viewport.translate.x,
          y: viewport.translate.y
        },
        tasksCount,
        taskVisualStatesCount,
        staleVisualStates,
        timestamp: new Date().toISOString(),
        forceSave,
        _style: 'background-color: #4CAF50; color: white; padding: 2px 5px; border-radius: 3px;'
      }, 'state persistence save');
      
      // Actually save the state
      await workspacePersistenceManager.saveState(
        projectId,
        selectedTaskId,
        viewport,
        currentState.taskVisualStates,
        uiState
      );
      
      // Dispatch an event that state has been saved
      window.dispatchEvent(new CustomEvent('workspace-state-saved', {
        detail: {
          projectId,
          timestamp: now,
          tasksCount,
          taskVisualStatesCount
        }
      }));
    } catch (error) {
      logger.error('Failed to save workspace state', { error }, 'state persistence error');
    }
  }, [getCurrentViewportState, getCurrentUIState, selectedTaskId]);

  /**
   * Restore state from saved storage
   * @param specificProjectId Optional project ID to restore specific project state
   */  
  const restoreState = useCallback(async (specificProjectId?: string) => {
    try {
      // Check if we're already restoring state
      if (isStateBeingRestored()) {
        logger.debug('Already restoring state, skipping additional restoration', {}, 'state persistence');
        return false;
      }
      
      // Add immediate logging to track restoration process
      logger.info('[STATE PERSISTENCE] 🔄 Starting state restoration process', { 
        specificProjectId,
        currentTimestamp: new Date().toISOString(),
        caller: new Error().stack?.split('\n')[2]?.trim(),
        _style: 'background-color: #2196F3; color: white; padding: 2px 5px; border-radius: 3px;'
      }, 'state persistence restore');
      
      // Get current user ID for proper data isolation
      let userId: string | null = null;
      try {
        const { authStorage } = await import('@/lib/client/auth/storage');
        const session = await authStorage.getSession();
        userId = session?.user?._id || null;
        
        if (!userId) {
          logger.warn('No user ID available for state restoration, using global fallback', {}, 'state persistence auth');
        }
      } catch (authError) {
        logger.error('Error getting user session for state restoration', { 
          error: String(authError) 
        }, 'state persistence auth error');
      }
      
      // If specificProjectId is provided, we should ONLY use that project's state
      // and ignore any globally saved state
      let savedState = null;
      let stateSource = 'unknown';
      
      if (specificProjectId) {
        // Try to load the project-specific state first
        // We'll validate the project exists when we actually load it
        try {
          // Use user ID for proper isolation
          savedState = await workspacePersistenceManager.loadState(specificProjectId);
          stateSource = 'project-specific';
          
          if (!savedState) {
            logger.info('No saved state found for specific project', { 
              projectId: specificProjectId,
              userId
            }, 'state persistence project');
          } else {
            logger.info('Successfully loaded project-specific state', {
              projectId: specificProjectId,
              timestamp: savedState.timestamp ? new Date(savedState.timestamp).toISOString() : 'unknown'
            }, 'state persistence project');
          }
        } catch (loadError) {
          logger.error('Error loading project-specific state', { 
            projectId: specificProjectId,
            userId,
            error: String(loadError) 
          }, 'state persistence error');
        }
      } else {
        // No specific project requested, use the global state
        savedState = await workspacePersistenceManager.loadState();
        stateSource = 'global';
        
        if (savedState) {
          logger.info('Successfully loaded global state', {
            projectId: savedState.projectId,
            timestamp: savedState.timestamp ? new Date(savedState.timestamp).toISOString() : 'unknown'
          }, 'state persistence');
        }
      }
      
      // Check if we have a valid state to restore
      if (!savedState || !savedState.projectId) {
        logger.debug('No valid saved state to restore', { 
          specificProjectId,
          stateSource 
        }, 'state persistence');
        return false;
      }
      
      // Validate the saved viewport state to ensure it's good
      if (!savedState.viewport || typeof savedState.viewport.scale !== 'number') {
        logger.warn('Invalid viewport in saved state, using defaults', {
          viewport: savedState.viewport
        }, 'state persistence viewport');
        
        savedState.viewport = {
          scale: 1,
          translate: { x: 0, y: 0 }
        };
      }
      
      logger.info('Restoring workspace state', { 
        projectId: savedState.projectId,
        requestedProjectId: specificProjectId,
        stateSource,
        usingProjectSpecificState: specificProjectId ? specificProjectId === savedState.projectId : false,
        selectedTaskId: savedState.selectedTaskId,
        viewportScale: savedState.viewport.scale,
        viewportTranslateX: savedState.viewport.translate.x,
        viewportTranslateY: savedState.viewport.translate.y,
        projectListScrollPosition: savedState.uiState?.projectListScrollPosition,
        taskVisualStatesCount: Object.keys(savedState.taskVisualStates || {}).length
      }, 'state persistence restore');
      
      // Begin the full state restoration process
      // This ensures elements are hidden during the transition
      beginStateRestoration();
      
      // Explicitly store viewport state in module scope for access during initialization
      // Make sure we clear any cached state first to ensure the new state is applied
      setSavedViewportState(null);
      
      // Validate transform values before proceeding
      if (isNaN(savedState.viewport.scale) || 
          isNaN(savedState.viewport.translate.x) || 
          isNaN(savedState.viewport.translate.y)) {
        logger.warn('Invalid numeric values in viewport state, fixing', {
          original: savedState.viewport
        }, 'state persistence viewport');
        
        // Fix NaN values
        const fixedViewport = {
          scale: isNaN(savedState.viewport.scale) ? 1 : savedState.viewport.scale,
          translate: {
            x: isNaN(savedState.viewport.translate.x) ? 0 : savedState.viewport.translate.x,
            y: isNaN(savedState.viewport.translate.y) ? 0 : savedState.viewport.translate.y
          }
        };
        
        savedState.viewport = fixedViewport;
        logger.info('Fixed viewport values', { fixedViewport }, 'state persistence viewport');
      }
      
      logger.info('[STATE PERSISTENCE] 📊 Setting saved viewport state', { 
        scale: savedState.viewport.scale,
        x: savedState.viewport.translate.x,
        y: savedState.viewport.translate.y,
        timestamp: new Date().toISOString(),
        specificProjectId,
        _style: 'background-color: #9C27B0; color: white; padding: 2px 5px; border-radius: 3px;'
      }, 'state persistence viewport');
      
      // Also update transform coordinator directly for better coordination
      try {
        const coordinator = window.__transformCoordinator;
        if (coordinator && typeof coordinator.setRestorationTransform === 'function') {
          coordinator.setRestorationTransform(savedState.viewport);
          logger.info('Updated transform coordinator with restoration state from persistence', {
            scale: savedState.viewport.scale,
            x: savedState.viewport.translate.x,
            y: savedState.viewport.translate.y
          }, 'state persistence transform');
        }
      } catch (coordError) {
        logger.warn('Error updating transform coordinator', {
          error: String(coordError)
        }, 'state persistence transform error');
      }
      
      // Set the saved viewport state
      setSavedViewportState(savedState.viewport);
      
      // Apply immediately with highest priority
      try {
        forceApplySavedState(false, true); // Don't save current state, but mark as project switch
        
        logger.debug('Applied saved viewport state with force and project switch flag', {
          scale: savedState.viewport.scale,
          x: savedState.viewport.translate.x,
          y: savedState.viewport.translate.y
        }, 'state persistence viewport');
      } catch (applyError) {
        logger.warn('Error applying saved state immediately, will retry', {
          error: String(applyError)
        }, 'state persistence viewport error');
        
        // Retry after a small delay as fallback
        setTimeout(() => {
          try {
            forceApplySavedState(false, true);
            logger.debug('Applied saved viewport state on retry', {}, 'state persistence viewport');
          } catch (retryError) {
            logger.error('Failed to apply saved state on retry', {
              error: String(retryError)
            }, 'state persistence viewport error');
          }
        }, 50);
      }
      
      // Check if we need to select a project
      const currentProjectId = workspaceStateManager.getState().selectedProject?._id?.toString();
      
      if (specificProjectId && specificProjectId !== currentProjectId) {
        // We're switching to a specific project, so don't select the saved project
        logger.info('Skipping project selection - using specified project', {
          specifiedProjectId: specificProjectId,
          savedProjectId: savedState.projectId
        }, 'state persistence project');
        
        // Although we'll use the saved state for this project, we don't need to
        // select the project as the component calling this will handle that
      } else if (savedState.projectId !== currentProjectId) {
        // Normal initial state restoration - select the project from saved state
        logger.info('Selecting project from saved state', {
          projectId: savedState.projectId,
          currentProjectId
        }, 'state persistence project');
        
        // Select the project (the preload-state system will handle visibility)
        await workspaceStateManager.selectProject(savedState.projectId);
      }

      // Dispatch custom event for project restoration
      window.dispatchEvent(new CustomEvent(WORKSPACE_STATE_RESTORED_EVENT, {
        detail: {
          projectId: savedState.projectId,
          viewport: savedState.viewport,
          uiState: savedState.uiState,
          wasProjectSpecific: !!specificProjectId,
          selectedTaskId: savedState.selectedTaskId,
          timestamp: Date.now()
        }
      }));
      
      // Force apply the saved state - multiple attempts for reliability with distinct logging
      const attemptApply = (attempt: number) => {
        try {
          // Set the isProjectSwitch flag to true for more reliable application
          forceApplySavedState(false, true);
          
          logger.info('[STATE PERSISTENCE] 🔄 Forcing application of saved viewport state', { 
            attempt,
            scale: savedState.viewport.scale,
            x: savedState.viewport.translate.x,
            y: savedState.viewport.translate.y,
            timestamp: new Date().toISOString(),
            specificProjectId,
            _style: 'background-color: #FF9800; color: white; padding: 2px 5px; border-radius: 3px;'
          }, 'state persistence viewport');
          
        } catch (error) {
          logger.warn(`Error applying saved state (attempt ${attempt})`, {
            error: String(error)
          }, 'state persistence viewport error');
        }
      };
      
      // Multiple attempts at different times to ensure it applies
      // Use increasing delays to avoid conflicts
      setTimeout(() => attemptApply(1), 50);
      setTimeout(() => attemptApply(2), 200);
      setTimeout(() => attemptApply(3), 500);
      
      // One final attempt after everything else should be settled
      setTimeout(() => {
        try {
          // Check if transform is still needed
          const transformGroup = document.querySelector('.transform-group');
          if (transformGroup) {
            const currentTransform = transformGroup.getAttribute('transform');
            const expectedTransform = `translate(${savedState.viewport.translate.x},${savedState.viewport.translate.y}) scale(${savedState.viewport.scale})`;
            
            // Only apply if the transform is different
            if (currentTransform !== expectedTransform) {
              logger.info('[STATE PERSISTENCE] ⚠️ Final transform verification - mismatch detected', { 
                current: currentTransform,
                expected: expectedTransform,
                timestamp: new Date().toISOString(),
                _style: 'background-color: #F44336; color: white; padding: 2px 5px; border-radius: 3px;'
              }, 'state persistence transform');
              
              // Force final application with highest priority
              const svg = document.querySelector('svg');
              if (svg) {
                try {
                  // Apply with true for both saveCurrentFirst and isProjectSwitch
                  forceApplySavedState(true, true);
                  logger.info('Applied final forced transform correction', {}, 'state persistence transform');
                } catch (error) {
                  logger.error('Error applying final transform correction', {
                    error: String(error)
                  }, 'state persistence transform error');
                }
              }
            } else {
              logger.debug('Final transform verification - correct transform in place', {}, 'state persistence transform');
            }
          }
        } catch {
          // Deliberately ignoring errors in final verification
        }
      }, 1000);
      
      // Handle project list scroll position restoration
      const applyProjectListScroll = () => {
        // Try to find the project list element
        const projectList = document.querySelector('[data-project-list]');
        if (projectList && savedState.uiState?.projectListScrollPosition) {
          logger.debug('Restoring project list scroll position', {
            scrollTop: savedState.uiState.projectListScrollPosition
          }, 'state persistence ui');
          
          projectList.scrollTop = savedState.uiState.projectListScrollPosition;
          projectListRef.current = projectList as HTMLElement;
          return true;
        }
        return false;
      };
      
      // Try immediately and with delays
      if (!applyProjectListScroll()) {
        setTimeout(applyProjectListScroll, 500);
        setTimeout(applyProjectListScroll, 1500);
      }
      
      // Convert task visual states Record back to Map
      const taskVisualStates = new Map<string, TaskVisualState>();
      
      // Handle potentially missing taskVisualStates
      if (savedState.taskVisualStates) {
        // Log the number of states we're restoring
        logger.debug('Restoring task visual states', {
          count: Object.keys(savedState.taskVisualStates).length
        }, 'state persistence task');
        
        Object.entries(savedState.taskVisualStates).forEach(([key, value]) => {
          // Ensure the value is treated as a TaskVisualState
          taskVisualStates.set(key, value as unknown as TaskVisualState);
        });
      } else {
        logger.warn('No task visual states in saved state', {
          projectId: savedState.projectId
        }, 'state persistence task');
      }
      
      // Update task visual states
      const currentState = workspaceStateManager.getState();
      
      // Delay this slightly to ensure the project has loaded
      setTimeout(() => {
        try {
          workspaceStateManager.updateState({
            ...currentState,
            taskVisualStates
          }, 'visual');
          
          logger.debug('Updated task visual states in workspace state manager', {}, 'state persistence task');
        } catch (error) {
          logger.error('Failed to update task visual states', {
            error: String(error)
          }, 'state persistence task error');
        }
      }, 100);
      
      // Ensure viewport state is applied after restoration
      const handleRestorationPositioning = () => {
        forceApplySavedState();
        logger.debug('Applied saved state during positioning phase', {}, 'state persistence viewport');
      };
      
      // Add event listener for positioning phase
      const positioningListener = (_event: Event) => {
        if (getRestorationPhase() === 'positioning') {
          handleRestorationPositioning();
        }
      };
      window.addEventListener('restoration-phase-changed', positioningListener, { once: true });
      
      // Store selected task ID
      if (savedState.selectedTaskId) {
        setSelectedTaskId(savedState.selectedTaskId);
        
        // Add extra task ID recognition for split tasks
        // This helps with tracking task ID consistency for newly split tasks
        if (savedState.selectedTaskId.includes('child-') || 
            savedState.selectedTaskId.includes('split-') ||
            savedState.selectedTaskId.includes('subtask-')) {
          // Mark this as a split task for easier identification
          const taskIdAttr = `data-split-task-${savedState.selectedTaskId}`;
          document.body.setAttribute(taskIdAttr, 'true');
          
          // Clean up after delay
          setTimeout(() => {
            document.body.removeAttribute(taskIdAttr);
          }, 30000);
        }
        
        // Trigger selection once elements are revealed
        // Listen for state restoration completion event
        const handleRestorationComplete = () => {
          try {
            logger.info('State restoration complete, handling task selection', {
              taskId: savedState.selectedTaskId
            }, 'state persistence task');
            
            // Check if this was a recently split task
            const wasSplitTask = savedState.selectedTaskId!.includes('child-') || 
                                savedState.selectedTaskId!.includes('split-') ||
                                savedState.selectedTaskId!.includes('subtask-') ||
                                document.body.hasAttribute(`data-split-task-${savedState.selectedTaskId}`);
            
            if (wasSplitTask) {
              logger.info('Handling selection of a split task child', { 
                taskId: savedState.selectedTaskId
              }, 'state persistence task operations');
              
              // For split tasks, use direct event emission first
              TaskEventEmitter.getInstance().emit({
                taskId: savedState.selectedTaskId!,
                type: 'stateChange',
                data: { 
                  state: 'selected', 
                  wasSplitTask: true,
                  fromStateRestoration: true
                }
              });
              
              // Then find the task element for redundant selection
              setTimeout(() => {
                const taskElement = document.querySelector(`[data-task-id="${savedState.selectedTaskId}"]`);
                if (taskElement) {
                  logger.debug('Found split task element, triggering click', {
                    taskId: savedState.selectedTaskId
                  }, 'state persistence task ui');
                  
                  taskElement.dispatchEvent(new MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                    view: window
                  }));
                } else {
                  logger.warn('Split task element not found for selection', {
                    taskId: savedState.selectedTaskId
                  }, 'state persistence task ui');
                }
              }, 200);
            } else {
              // Find the task element
              const taskElement = document.querySelector(`[data-task-id="${savedState.selectedTaskId}"]`);
              
              if (taskElement) {
                logger.debug('Found task element, triggering click', {
                  taskId: savedState.selectedTaskId
                }, 'state persistence task ui');
                
                // Trigger click event
                taskElement.dispatchEvent(new MouseEvent('click', {
                  bubbles: true,
                  cancelable: true,
                  view: window
                }));
              } else {
                logger.warn('Task element not found, using direct event emission', {
                  taskId: savedState.selectedTaskId
                }, 'state persistence task ui');
                
                // Direct state change event
                TaskEventEmitter.getInstance().emit({
                  taskId: savedState.selectedTaskId!,
                  type: 'stateChange',
                  data: { 
                    state: 'selected',
                    fromStateRestoration: true
                  }
                });
              }
            }
            
            // Force visibility update after selection
            setTimeout(() => {
              if (typeof controlVisibilityManager?.updateVisibility === 'function') {
                logger.debug('Updating control visibility after task selection', {}, 'state persistence ui');
                controlVisibilityManager.updateVisibility();
              }
            }, 300);
          } catch (selectionError) {
            logger.error('Error handling task selection during restoration', {
              error: String(selectionError),
              taskId: savedState.selectedTaskId
            }, 'state persistence task error');
          }
          
          // Remove listener
          window.removeEventListener('workspace-state-restored', handleRestorationComplete);
        };
        
        // Add listener for restoration completion
        window.addEventListener('workspace-state-restored', handleRestorationComplete);
      }
      
      // Log completion
      logger.info('State restoration process completed', {
        projectId: savedState.projectId,
        hasSelectedTask: !!savedState.selectedTaskId
      }, 'state persistence restore');
      
      return true;
    } catch (error) {
      logger.error('Failed to restore workspace state', { 
        error: String(error),
        specificProjectId
      }, 'state persistence error');
      return false;
    }
  }, []);

  /**
   * Track task selection and task deletion for state persistence
   */
  useEffect(() => {
    const handleTaskEvent = (event: { 
      type: string; 
      taskId: string; 
      data?: { 
        state?: string; 
        parentId?: string; 
        isLastChildOfParent?: boolean; 
        isLastTaskInProject?: boolean 
      } 
    }) => {
      // Handle task selection
      if (event.type === 'stateChange' && event.data?.state === 'selected') {
        setSelectedTaskId(event.taskId);
        
        // Save state when task selection changes (but not during state restoration)
        if (autoSave && !isStateBeingRestored()) {
          // Delay to allow visual changes to apply
          setTimeout(() => {
            saveState();
          }, 100);
        }
      }
      
      // Handle task deletion completion
      if (event.type === 'deleteComplete') {
        logger.info('Task deletion complete, updating state', {
          taskId: event.taskId,
          parentId: event.data?.parentId,
          isLastChildOfParent: event.data?.isLastChildOfParent,
          isLastTaskInProject: event.data?.isLastTaskInProject
        }, 'state persistence task operations');
        
        // Clear selectedTaskId if the selected task was deleted
        if (event.taskId === selectedTaskId) {
          setSelectedTaskId(null);
        }
        
        // Update state manager about the deletion
        try {
          workspaceStateManager.handleTaskDeleted(
            event.taskId, 
            event.data?.parentId,
            event.data?.isLastChildOfParent
          );
        } catch (error) {
          logger.error('Error updating state manager after task deletion', {
            error: String(error)
          }, 'state persistence task operations error');
        }
        
        // Save state after task deletion
        if (autoSave && !isStateBeingRestored()) {
          // Use a shorter delay for deletion since it's important to save quickly
          setTimeout(() => {
            logger.info('Saving state after task deletion', {
              taskId: event.taskId,
              isLastChildOfParent: event.data?.isLastChildOfParent
            }, 'state persistence save');
            saveState(true); // Force save
          }, 50);
        }
      }
    };
    
    // Listen for task events
    const removeListener = TaskEventEmitter.getInstance().addListener(handleTaskEvent);
    
    // Also listen for task-deleted DOM event
    const handleTaskDeletedEvent = (e: CustomEvent) => {
      if (autoSave && !isStateBeingRestored()) {
        const { taskId, parentId, isLastChildOfParent, isLastTaskInProject } = e.detail;
        
        logger.info('Task deleted event received', { 
          taskId, 
          parentId,
          isLastChildOfParent,
          isLastTaskInProject
        }, 'state persistence task operations');
        
        // Save state after task deletion with a short delay
        setTimeout(() => {
          saveState(true); // Force save
        }, 100);
      }
    };
    
    window.addEventListener('task-deleted', handleTaskDeletedEvent as EventListener);
    
    return () => {
      removeListener();
      window.removeEventListener('task-deleted', handleTaskDeletedEvent as EventListener);
    };
  }, [autoSave, saveState, selectedTaskId]);
  
  /**
   * Find and observe the project list for scroll changes
   */
  useEffect(() => {
    // Find project list container
    const findProjectList = () => {
      const element = document.querySelector('[data-project-list]');
      if (element && element !== projectListRef.current) {
        projectListRef.current = element as HTMLElement;
        
        // Save state when scrolling (with debounce)
        let scrollTimeout: NodeJS.Timeout | null = null;
        const handleScroll = () => {
          if (isStateBeingRestored()) return;
          
          if (scrollTimeout) {
            clearTimeout(scrollTimeout);
          }
          
          scrollTimeout = setTimeout(() => {
            logger.debug('Saving state after project list scroll', {}, 'state persistence ui');
            saveState();
          }, 500);
        };
        
        element.addEventListener('scroll', handleScroll);
        
        // Return cleanup function
        return () => {
          element.removeEventListener('scroll', handleScroll);
          if (scrollTimeout) {
            clearTimeout(scrollTimeout);
          }
        };
      }
      return () => {};
    };
    
    // Try to find the project list
    const cleanup = findProjectList();
    
    // Try again after delay
    const timeout = setTimeout(findProjectList, 1000);
    
    return () => {
      cleanup();
      clearTimeout(timeout);
    };
  }, [saveState]);
  
  /**
   * Set up state saving events with intelligent triggers
   */
  useEffect(() => {
    if (!autoSave) return;

    // Track if zoom/pan is currently in progress
    let zoomPanInProgress = false;
    let lastZoomPanTime = 0;
    let stateChangeCount = 0;
    
    // Save after zoom/pan operations with debounce
    const handleZoomPan = () => {
      if (isStateBeingRestored()) return;
      
      // Mark zoom/pan as in progress
      zoomPanInProgress = true;
      lastZoomPanTime = Date.now();
      
      // Clear any existing timeout
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      
      // Set a new timeout to save state after zoom/pan is completed
      timerRef.current = setTimeout(() => {
        if (Date.now() - lastZoomPanTime >= 300) { // If no zoom/pan events for 300ms
          zoomPanInProgress = false;
          
          logger.info('Saving state after zoom/pan operation completed', {
            timeElapsed: Date.now() - lastZoomPanTime
          }, 'state persistence transform save');
          
          saveState(true);
        }
      }, 400) as unknown as NodeJS.Timeout; // Slightly longer timeout for better debounce
    };
    
    // Listen for transform changes with MutationObserver
    const setupTransformObserver = () => {
      const transformGroup = document.querySelector('.transform-group');
      if (!transformGroup) return null;
      
      // Listen for transition end events
      transformGroup.addEventListener('transitionend', () => {
        // Capture the current transform values
        const transform = transformGroup.getAttribute('transform');
        logger.info('Transform transition ended with transform', { transform }, 'state persistence transform');
        
        // Handle zoom/pan completion with final transform
        zoomPanInProgress = true;
        lastZoomPanTime = Date.now();
        
        // Clear any existing timeout
        if (timerRef.current) {
          clearTimeout(timerRef.current);
        }
        
        // Set a longer timeout for transition end to ensure transform is fully settled
        timerRef.current = setTimeout(() => {
          zoomPanInProgress = false;
          
          // Get the final transform after everything has settled
          const finalTransform = transformGroup.getAttribute('transform');
          
          logger.info('Saving state after transform transition complete', {
            timeElapsed: Date.now() - lastZoomPanTime,
            finalTransform
          }, 'state persistence transform save');
          
          // Force save with true parameter to skip deduplication
          saveState(true);
        }, 300) as unknown as NodeJS.Timeout;
      });
      
      // Use MutationObserver for transform attribute changes
      const observer = new MutationObserver((mutations) => {
        let hasTransformChange = false;
        
        mutations.forEach((mutation) => {
          if (mutation.type === 'attributes' && mutation.attributeName === 'transform') {
            hasTransformChange = true;
          }
        });
        
        if (hasTransformChange) {
          handleZoomPan();
        }
      });
      
      observer.observe(transformGroup, { 
        attributes: true,
        attributeFilter: ['transform']
      });
      
      return observer;
    };
    
    // Listen for state changes that should trigger saves
    const handleStateEvent = (event: Event) => {
      if (isStateBeingRestored()) return;
      
      // Don't save during zoom/pan operations to avoid excessive saves
      if (zoomPanInProgress && Date.now() - lastZoomPanTime < 300) {
        return;
      }
      
      const customEvent = event as CustomEvent;
      
      // Get event information for logging
      const eventType = event.type;
      const eventDetail = customEvent.detail || {};
      const taskId = eventDetail.taskId || 'unknown';
      
      logger.info(`Saving state after ${eventType} event`, { 
        eventType,
        taskId,
        stateChangeCount: ++stateChangeCount 
      }, 'state persistence event');
      
      // Save state with a small delay to ensure all state changes are applied
      setTimeout(saveState, 100);
    };
    
    // Listen for specific events that should trigger state saves
    const stateTriggerEvents = [
      'workspace-state-visual-ready',     // Visual elements ready
      'task-selected',                    // Task selection changed
      'project-selected',                 // Project selection changed
      'task-split-complete',              // Task splitting completed
      'task-regenerate-complete',         // Task regeneration completed
      'task-deleted',                     // Task deletion completed
      'project-state-updated',            // Project state was updated
      'viewport-state-applied',           // Viewport state was applied
      'centering-complete'                // Centering operation completed
    ];
    
    // Register all event listeners
    stateTriggerEvents.forEach(eventName => {
      window.addEventListener(eventName, handleStateEvent);
    });
    
    // Also listen for project list scroll changes
    const monitorProjectListScroll = () => {
      const projectList = document.querySelector('[data-project-list]');
      if (!projectList) return null;
      
      // Save state when scrolling stops (with debounce)
      let scrollTimeout: NodeJS.Timeout | null = null;
      const handleScroll = () => {
        if (isStateBeingRestored()) return;
        
        if (scrollTimeout) {
          clearTimeout(scrollTimeout);
        }
        
        scrollTimeout = setTimeout(() => {
          logger.debug('Saving state after project list scroll', {}, 'state persistence ui');
          saveState();
        }, 500);
      };
      
      projectList.addEventListener('scroll', handleScroll);
      
      return () => {
        projectList.removeEventListener('scroll', handleScroll);
        if (scrollTimeout) {
          clearTimeout(scrollTimeout);
        }
      };
    };
    
    // Initialize observers and listeners
    const observer = setupTransformObserver();
    const scrollCleanup = monitorProjectListScroll();
    
    // Save on page unload
    const handleUnload = () => {
      saveState();
    };
    
    window.addEventListener('beforeunload', handleUnload);
    
    // Emit a custom event so other components can request state saves
    window.saveWorkspaceState = () => {
      if (!isStateBeingRestored()) {
        logger.debug('Manual state save requested', {}, 'state persistence');
        saveState();
      }
    };
    
    // Fallback timer (save every 30 seconds as a backup)
    const fallbackTimer = setInterval(() => {
      if (!isStateBeingRestored() && !zoomPanInProgress) {
        logger.debug('Fallback state save triggered', {}, 'state persistence');
        saveState();
      }
    }, AUTO_SAVE_INTERVAL * 20); // Much longer interval than before
    
    // Cleanup function
    return () => {
      // Clean up all event listeners
      stateTriggerEvents.forEach(eventName => {
        window.removeEventListener(eventName, handleStateEvent);
      });
      
      // Clean up transform observer
      if (observer) {
        observer.disconnect();
      }
      
      // Clean up scroll listener
      if (scrollCleanup) {
        scrollCleanup();
      }
      
      // Clean up timers
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      
      clearInterval(fallbackTimer);
      
      // Remove unload listener
      window.removeEventListener('beforeunload', handleUnload);
      
      // Remove global save method
      delete window.saveWorkspaceState;
    };
  }, [autoSave, saveState]);
  
  /**
   * Handle initial state restoration on mount
   */
  useEffect(() => {
    // Only run once and if restoreOnMount is true
    if (restoreOnMount && !initialLoadCompleteRef.current) {
      initialLoadCompleteRef.current = true;
      
      logger.info('[STATE PERSISTENCE] 🚀 Initial state restoration check', { 
        restoreOnMount,
        timestamp: new Date().toISOString(),
        _style: 'background-color: #673AB7; color: white; padding: 2px 5px; border-radius: 3px;'
      }, 'state persistence initialization');
      
      // Check if we're creating a new project
      const creatingProjectTimestamp = sessionStorage.getItem('__creating_new_project');
      const isCreatingNewProject = !!creatingProjectTimestamp;
      
      if (isCreatingNewProject) {
        // Only skip restoration if creation is recent (within last 30 seconds)
        const timestamp = parseInt(creatingProjectTimestamp || '0');
        const now = Date.now();
        const isRecent = (now - timestamp) < 30000; // 30 seconds
        
        if (isRecent) {
          logger.info('[STATE PERSISTENCE] ℹ️ Creating new project, skipping state restoration', { 
            creationTimestamp: new Date(timestamp).toISOString(),
            ageInSeconds: (now - timestamp) / 1000,
            _style: 'background-color: #607D8B; color: white; padding: 2px 5px; border-radius: 3px;'
          }, 'state persistence project');
          
          logger.info('Creating new project, skipping state restoration', {
            creationTimestamp: timestamp,
            ageInSeconds: (now - timestamp) / 1000
          }, 'state persistence project');
          return;
        } else {
          // Clean up stale flag
          logger.info('Found stale project creation flag, removing it', {
            creationTimestamp: timestamp,
            ageInSeconds: (now - timestamp) / 1000
          }, 'state persistence project');
          sessionStorage.removeItem('__creating_new_project');
        }
      }
      
      // Ensure no other restoration is in progress
      if (isStateBeingRestored()) {
        logger.info('State restoration already in progress, skipping duplicate restoration', {}, 'state persistence');
        return;
      }
      
      // Wait for components to initialize, but don't wait too long
      // This is important to ensure we catch the earliest possible moment to restore state
      setTimeout(() => {
        logger.info('[STATE PERSISTENCE] 🔄 Initiating state restoration', { 
          timestamp: new Date().toISOString(),
          fromMount: true,
          _style: 'background-color: #4CAF50; color: white; padding: 2px 5px; border-radius: 3px;'
        }, 'state persistence initialization');
        
        restoreState();
      }, 100);
      
      // Set up event listeners for state restoration completion
      const completionListener = (event: Event) => {
        const customEvent = event as CustomEvent;
        const isProjectSpecific = customEvent.detail?.wasProjectSpecific;
        
        logger.info('[STATE PERSISTENCE] ✅ State restoration completed', { 
          timestamp: new Date().toISOString(),
          isProjectSpecific,
          viewport: customEvent.detail?.viewport,
          _style: 'background-color: #4CAF50; color: white; padding: 2px 5px; border-radius: 3px;'
        }, 'state persistence restore');
        
        // Skip this update if this was from a project-specific state restoration
        // (project selector will handle that separately)
        if (isProjectSpecific) {
          logger.info('Skipping control update as this was a project-specific restore', {}, 'state persistence ui');
          return;
        }
        
        // Force control visibility update after state restoration
        setTimeout(() => {
          if (typeof controlVisibilityManager?.updateVisibility === 'function') {
            logger.info('Forcing control visibility update after state restoration', {}, 'state persistence ui');
            controlVisibilityManager.updateVisibility();
          }
        }, 500);
        
        // Ensure the transform is correct after a delay
        setTimeout(() => {
          try {
            // Verify the transform one last time
            const transformGroup = document.querySelector('.transform-group');
            if (transformGroup && customEvent.detail?.viewport) {
              const viewport = customEvent.detail.viewport;
              const currentTransform = transformGroup.getAttribute('transform');
              const expectedTransform = `translate(${viewport.translate.x},${viewport.translate.y}) scale(${viewport.scale})`;
              
              // Only apply if the transform is different
              if (currentTransform !== expectedTransform) {
                logger.info('Final transform verification after completion - correcting mismatch', {
                  current: currentTransform,
                  expected: expectedTransform
                }, 'state persistence transform');
                
                // Apply correct transform
                transformGroup.setAttribute('transform', expectedTransform);
                
                // Also sync with zoom behavior
                const svg = document.querySelector('svg');
                if (svg) {
                  try {
                    // Use dynamic import instead of require
                    (async () => {
                      try {
                        const zoomModule = await import('@/components/workspace/visual/hooks/useZoom');
                        const { syncZoomWithTransform } = zoomModule;
                        if (typeof syncZoomWithTransform === 'function') {
                          syncZoomWithTransform(svg as SVGSVGElement);
                        }
                      } catch {
                        // Deliberately ignoring import errors
                      }
                    })();
                  } catch {
                    // Deliberately ignoring errors in synchronous code
                  }
                }
              }
            }
          } catch {
            // Deliberately ignoring errors in final verification
          }
        }, 300);
      };
      
      // Listen for restoration completion
      window.addEventListener(WORKSPACE_STATE_RESTORED_EVENT, completionListener, { once: true });
    }
  }, [restoreOnMount, restoreState]);
  
  // Handle when the workspace is ready to show (transform properly applied)
  const _handleWorkspaceReady = () => {
    logger.info('Workspace ready to display, transform properly applied', {}, 'state persistence ui');
    
    // Add class to body to show we're ready with transform
    document.body.classList.add('transform-ready');
    
    // Clear any lingering direct click flags that might have been left
    if (document.body.hasAttribute('data-direct-click-in-progress')) {
      document.body.removeAttribute('data-direct-click-in-progress');
    }
  };
  
  // Save state with correct positioning
  setTimeout(() => {
    if (typeof window.saveWorkspaceState === 'function') {
      logger.info('[STATE PERSISTENCE] 💾 Saving workspace state after transform application', { 
        timestamp: new Date().toISOString(),
        _style: 'background-color: #00BCD4; color: white; padding: 2px 5px; border-radius: 3px;'
      }, 'state persistence save');
      
      window.saveWorkspaceState();
    }
  }, 100);

  /* Return persistence functions and state */
  
  return {
    saveState,
    restoreState,
    clearState: workspacePersistenceManager.clearState,
    selectedTaskId
  };
};