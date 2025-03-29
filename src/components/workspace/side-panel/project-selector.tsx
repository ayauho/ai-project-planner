'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { logger } from '@/lib/client/logger';
import { Types } from 'mongoose';
import ProjectList from './project-list';
import { projectListManager } from '@/lib/project/selection/list-manager';
import { ProjectDisplay, SortOption } from '@/lib/project/selection/types';
import { workspaceStateManager } from '@/lib/workspace/state/manager';
import { workspacePersistenceManager } from '@/lib/workspace/persistence/manager';
import { forceApplySavedState, syncZoomWithTransform } from '@/components/workspace/visual/hooks/useZoom';
import { TaskVisualState } from '@/lib/workspace/state/types';

// Define a constant for the workspace state restored event
export const WORKSPACE_STATE_RESTORED_EVENT = 'workspace-state-restored';

// Add TypeScript declarations for our window additions
declare global {
  interface Window {
    __pendingTaskVisualStates?: Map<string, TaskVisualState>;
    __pendingSelectedTaskId?: string;
    saveWorkspaceState?: () => void;
  }
}

interface ProjectSelectorProps {
  className?: string;
  onProjectSelect: (id: string) => void;
  userId: string;
  sortBy?: SortOption;
}

const ProjectSelector = ({ className = '', onProjectSelect, userId, sortBy = 'last-modified' }: ProjectSelectorProps) => {
  // Separate loading states for list loading and project selection
  const [isListLoading, setIsListLoading] = useState(false);
  const [isProjectSelecting, setIsProjectSelecting] = useState(false);
  
  const [projects, setProjects] = useState<ProjectDisplay[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  
  // Reference to the project list container for scrolling
  const listRef = useRef<HTMLDivElement>(null);
  
  // References for project selection state
  const projectSelectionInProgressRef = useRef(false);
  const lastSelectedProjectIdRef = useRef<string | null>(null);

  const loadProjects = useCallback(async () => {
    if (!userId) {
      logger.warn('Attempting to load projects without userId', {}, 'project selector validation');
      return;
    }
    
    try {
      setIsListLoading(true);
      
      const userObjectId = new Types.ObjectId(userId);
      const projectList = await projectListManager.getProjects({ 
        userId: userObjectId, 
        sortBy 
      });

      setProjects(projectList);
    } catch (error) {
      logger.error('Failed to load projects', { error: String(error) }, 'project selector api error');
    } finally {
      setIsListLoading(false);
    }
  }, [userId, sortBy]);

  // Track if initial project loading has been done
  const initialProjectLoadRef = useRef(false);
  
  useEffect(() => {
    if (!initialProjectLoadRef.current && userId) {
      logger.info('ProjectSelector initial mount - loading projects', { userId }, 'project selector initialization');
      loadProjects();
      initialProjectLoadRef.current = true;
    }
  }, [loadProjects, userId]);
  
  // Listen for project creation interface showing
  useEffect(() => {
    const handleStateChange = (state: { showProjectCreation: boolean }) => {
      if (state.showProjectCreation && selectedId) {
        logger.info('Project creation shown, resetting selected project UI state', { 
          previousSelectedId: selectedId 
        }, 'project selector ui');
        setSelectedId(undefined);
      }
    };
    
    // Subscribe to workspace state changes
    const unsubscribe = workspaceStateManager.subscribe(handleStateChange);
    
    return () => {
      unsubscribe();
    };
  }, [selectedId]);

  // Handle state restoration event
  useEffect(() => {
    const handleStateRestored = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent.detail && customEvent.detail.projectId) {
        const restoredProjectId = customEvent.detail.projectId;
        const uiState = customEvent.detail.uiState;
        
        logger.info('Workspace state restored event received', { 
          projectId: restoredProjectId,
          scrollPosition: uiState?.projectListScrollPosition
        }, 'project selector state restore');
        
        // Make sure the project is selected in the UI
        setSelectedId(restoredProjectId);
        
        // Restore scroll position
        if (uiState && typeof uiState.projectListScrollPosition === 'number') {
          setTimeout(() => {
            try {
              if (listRef.current) {
                listRef.current.scrollTop = uiState.projectListScrollPosition;
                logger.debug('Restored project list scroll position', {
                  scrollTop: uiState.projectListScrollPosition
                }, 'project selector ui state');
              }
            } catch (_) {  
              void _; // Explicitly mark as used
              logger.error('Error restoring scroll position', {}, 'project selector ui error');
            }
          }, 300);
        }
      }
    };
    
    window.addEventListener(WORKSPACE_STATE_RESTORED_EVENT, handleStateRestored);
    
    return () => {
      window.removeEventListener(WORKSPACE_STATE_RESTORED_EVENT, handleStateRestored);
    };
  }, []);

  // Track project list update requests to prevent duplicates
  const projectListUpdateInProgressRef = useRef(false);
  
  useEffect(() => {
    const handleStateChange = async (state: { 
      projectListUpdated?: boolean;
      newlyCreatedProjectId?: string; 
    }) => {
      logger.debug('Workspace state changed', { 
        projectListUpdated: state.projectListUpdated,
        newlyCreatedProjectId: state.newlyCreatedProjectId,
        updateInProgress: projectListUpdateInProgressRef.current
      }, 'project selector state');

      if (state.projectListUpdated && !projectListUpdateInProgressRef.current) {
        try {
          projectListUpdateInProgressRef.current = true;
          await loadProjects();
          
          if (state.newlyCreatedProjectId) {
            logger.info('Selecting newly created project', { 
              projectId: state.newlyCreatedProjectId 
            }, 'project selector selection');
            setSelectedId(state.newlyCreatedProjectId);
            onProjectSelect(state.newlyCreatedProjectId);
          }
        } finally {
          // Reset flag after a short delay to ensure we don't miss closely-timed updates
          setTimeout(() => {
            projectListUpdateInProgressRef.current = false;
          }, 300);
        }
      }
    };
    
    // Handle task deletion events to refresh project list
    const handleTasksChanged = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent.detail && customEvent.detail.operation === 'delete') {
        logger.info('Task deletion detected, refreshing project list', {
          projectId: customEvent.detail.projectId,
          taskId: customEvent.detail.taskId
        }, 'project selector task event');
        
        loadProjects();
      }
    };
    
    // Handle project deletion events
    const handleProjectDeleted = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent.detail && customEvent.detail.projectId) {
        const deletedProjectId = customEvent.detail.projectId;
        
        logger.info('Project deletion event received', { deletedProjectId }, 'project selector deletion');
        
        // If this was the selected project, clear selection
        if (selectedId === deletedProjectId) {
          setSelectedId(undefined);
        }
        
        // Clear this project from persistence state to prevent restoration errors
        const clearProjectState = async () => {
          try {
            await workspacePersistenceManager.clearState(deletedProjectId);
            logger.info('Cleared persistence state for deleted project', { deletedProjectId }, 'project selector state');
          } catch (error) {
            logger.error('Error clearing persistence state', { 
              deletedProjectId, 
              error: String(error) 
            }, 'project selector state error');
          }
        };
        
        clearProjectState();
        
        // Refresh the project list
        loadProjects();
      }
    };
    
    // Subscribe to workspace state changes
    const unsubscribe = workspaceStateManager.subscribe(handleStateChange);
    
    // Listen for the custom task deletion event
    window.addEventListener('project-tasks-changed', handleTasksChanged);
    
    // Listen for project deletion events
    window.addEventListener('project-deleted', handleProjectDeleted);
    
    return () => {
      unsubscribe();
      window.removeEventListener('project-tasks-changed', handleTasksChanged);
      window.removeEventListener('project-deleted', handleProjectDeleted);
    };
  }, [loadProjects, onProjectSelect, selectedId]);

  const handleProjectSelect = async (id: string) => {
    // Get current workspace state to check if we're in project creation mode
    const currentWorkspaceState = workspaceStateManager.getState();
    const isInProjectCreation = currentWorkspaceState.showProjectCreation;
    
    // Only skip if same project already selected, selection in progress, AND not in project creation
    if (isProjectSelecting || (id === selectedId && !isInProjectCreation)) {
      return;
    }

    try {
      // Mark as selecting to prevent concurrent selections
      setIsProjectSelecting(true);
      projectSelectionInProgressRef.current = true;
      lastSelectedProjectIdRef.current = id;
      
      // Set a flag to indicate a project switch is in progress
      document.body.classList.add('project-switching');
      sessionStorage.setItem('__project_switch_in_progress', 'true');
      
      logger.info('[PROJECT SELECT] 🔄 Project selection requested', { 
        id, 
        previousId: selectedId, 
        _style: 'background-color: #2196F3; color: white; padding: 2px 5px; border-radius: 3px;',
        _path: true
      }, 'project selector selection');
      
      // First update the selected ID for immediate visual feedback
      setSelectedId(id);
      
      // Save current project state before switching
      // This ensures we don't lose any changes when switching projects
      const currentState = workspaceStateManager.getState();
      
      if (currentState.selectedProject && typeof window.saveWorkspaceState === 'function') {
        const currentProjectId = currentState.selectedProject._id.toString();
        
        logger.info('Saving current project state before switching', {
          fromProjectId: currentProjectId,
          toProjectId: id,
          timestamp: new Date().toISOString()
        }, 'project selector state save');
        
        try {
          // Force a save with high priority
          if (window.saveWorkspaceState) {
            window.saveWorkspaceState();
            
            // Wait a moment to ensure the save completes
            await new Promise(resolve => setTimeout(resolve, 100));
            
            logger.debug('Completed save of current project state before switching', {}, 'project selector state save');
          }
        } catch (saveError) {
          logger.warn('Error saving current project state', {
            error: String(saveError),
            projectId: currentProjectId
          }, 'project selector state error');
        }
      }
      
      // Check if there's a saved state for this project
      const hasSavedState = await workspacePersistenceManager.hasSavedState(id);
      
      logger.info('Checking for project-specific saved state', { 
        projectId: id,
        hasSavedState,
        timestamp: new Date().toISOString()
      }, 'project selector state restore');
      
      // Pre-load the project state if available
      let savedState = null;
      if (hasSavedState) {
        try {
          savedState = await workspacePersistenceManager.loadState(id);
          
          // Additional validation for saved state
          if (savedState && savedState.projectId === id) {
            logger.info('Successfully pre-loaded project state', { 
              projectId: id, 
              hasState: true,
              selectedTaskId: savedState.selectedTaskId,
              viewportScale: savedState.viewport?.scale,
              viewportTranslateX: savedState.viewport?.translate?.x,
              viewportTranslateY: savedState.viewport?.translate?.y,
              timestamp: savedState.timestamp ? new Date(savedState.timestamp).toISOString() : 'unknown',
              taskStatesCount: Object.keys(savedState.taskVisualStates || {}).length
            }, 'project selector state restore');
          } else {
            logger.warn('Loaded state projectId does not match requested projectId', {
              requestedId: id,
              loadedId: savedState?.projectId
            }, 'project selector state error');
            
            if (savedState && savedState.projectId !== id) {
              // This is an error condition - we loaded the wrong project state
              // Treat as if no state was found
              savedState = null;
              logger.error('Project ID mismatch in loaded state, treating as no saved state', {}, 'project selector state error');
            }
          }
        } catch (loadError) {
          logger.error('Error pre-loading project state', {
            projectId: id,
            error: String(loadError)
          }, 'project selector state error');
          
          // Continue without saved state
          savedState = null;
        }
      } else {
        logger.info('No saved state found for project', { projectId: id }, 'project selector state restore');
      }
      
      // Start the restoration process BEFORE loading project
      // This follows the page refresh approach
      if (hasSavedState && savedState) {
        try {
          // 1. LOADING PHASE - Hide all elements
          logger.info('Starting project state restoration process', { 
            projectId: id,
            timestamp: new Date().toISOString()
          }, 'project selector state restore');
          
          // Force all elements to be hidden during loading
          document.body.classList.add('sr-loading');
          
          // Make all task and connection elements pending (hidden)
          document.querySelectorAll('.task-rect, .project-rect, .counter-display, .connection-line, .transform-group').forEach(el => {
            el.classList.add('sr-pending');
            (el as HTMLElement).style.opacity = '0';
            (el as HTMLElement).style.visibility = 'hidden';
          });
          
          // Import required functions
          const { setSavedViewportState } = await import('@/components/workspace/visual/hooks/useZoom');
          
          // First validate viewport state
          if (!savedState.viewport || isNaN(savedState.viewport.scale) || 
              isNaN(savedState.viewport.translate.x) || isNaN(savedState.viewport.translate.y)) {
            logger.warn('Invalid viewport values in saved state, fixing', {
              viewport: savedState.viewport
            }, 'project selector state viewport');
            
            // Apply default values
            savedState.viewport = {
              scale: 1,
              translate: { x: 0, y: 0 }
            };
          }
          
          // Set the viewport state for later application
          if (savedState.viewport) {
            setSavedViewportState(savedState.viewport);
            logger.debug('Set saved viewport state for later application', {
              scale: savedState.viewport.scale,
              x: savedState.viewport.translate.x,
              y: savedState.viewport.translate.y
            }, 'project selector state viewport');
          }
          
          // Apply the task visual states to state manager
          if (savedState.taskVisualStates) {
            const taskVisualStates = new Map<string, TaskVisualState>();
            Object.entries(savedState.taskVisualStates).forEach(([key, value]) => {
              taskVisualStates.set(key, value as TaskVisualState);
            });
            
            // Store for later application
            window.__pendingTaskVisualStates = taskVisualStates;
            
            logger.debug('Stored task visual states for later application', {
              count: taskVisualStates.size
            }, 'project selector state task');
          }
          
          // Store the selected task ID for restoration after loading
          if (savedState.selectedTaskId) {
            window.__pendingSelectedTaskId = savedState.selectedTaskId;
            logger.debug('Stored selected task ID for later application', {
              taskId: savedState.selectedTaskId
            }, 'project selector state task');
          }
          
          // 2. Wait a bit to ensure everything is hidden
          await new Promise(resolve => setTimeout(resolve, 50));
        } catch (error) {
          logger.error('Error during state preparation phase', {
            error: String(error),
            projectId: id
          }, 'project selector state error');
        }
      }
      
      // 3. Load the project while elements are hidden
      try {
        logger.info('Loading project data', { projectId: id }, 'project selector api');
        await onProjectSelect(id);
        logger.debug('Project loading completed', { projectId: id }, 'project selector api');
      } catch (loadError) {
        logger.error('Error loading project data', {
          projectId: id,
          error: String(loadError)
        }, 'project selector api error');
        throw loadError; // Rethrow to handle in catch block
      }
      
      // 4. Complete restoration if we have saved state
      if (hasSavedState && savedState) {
        try {
          // Import required utilities
          const { TaskEventEmitter } = await import('@/lib/client/visual/task/events');
          const { controlVisibilityManager } = await import('@/components/workspace/visual/controls/visibility-manager');
          
          // 5. POSITIONING PHASE - Apply transforms while elements are still hidden
          document.body.classList.remove('sr-loading');
          document.body.classList.add('sr-positioning');
          
          logger.debug('Entered positioning phase', { projectId: id }, 'project selector state restore');
          
          // Apply the saved viewport transform
          if (savedState.viewport) {
            logger.info('[PROJECT SELECTOR] 📊 Applying saved viewport transform', { 
              scale: savedState.viewport.scale,
              x: savedState.viewport.translate.x,
              y: savedState.viewport.translate.y,
              projectId: id,
              timestamp: new Date().toISOString(),
              _style: 'background-color: #FF9800; color: white; padding: 2px 5px; border-radius: 3px;'
            }, 'project selector state transform');
            
            logger.info('Applying saved viewport transform', {
              scale: savedState.viewport.scale,
              translateX: savedState.viewport.translate.x,
              translateY: savedState.viewport.translate.y,
              source: 'project-selector.handleProjectSelect',
              isProjectSwitch: true
            }, 'project selector state transform');
            
            // First, update transform coordinator - this is critical for proper sequence
            try {
              const coordinator = (window as { __transformCoordinator?: { 
                setRestorationTransform: (viewport: { scale: number; translate: { x: number; y: number } }) => void 
              } }).__transformCoordinator;
              if (coordinator && typeof coordinator.setRestorationTransform === 'function') {
                // Store the transform as a restoration transform with highest priority
                coordinator.setRestorationTransform(savedState.viewport);
                
                logger.info('Updated transform coordinator restoration transform before applying saved state', {
                  scale: savedState.viewport.scale,
                  x: savedState.viewport.translate.x,
                  y: savedState.viewport.translate.y
                }, 'project selector state transform');
              }
            } catch (coordError) {
              logger.warn('Error updating transform coordinator restoration transform', {
                error: String(coordError)
              }, 'project selector state transform error');
            }
            
            // Now apply via force with project switch flag
            // Use saveCurrentFirst=false because we already saved the previous project's state
            // Pass isProjectSwitch=true to signal this is a project switch
            forceApplySavedState(false, true);
            
            // Double-check the application
            setTimeout(() => {
              const transformGroup = document.querySelector('.transform-group');
              if (transformGroup) {
                const currentTransform = transformGroup.getAttribute('transform');
                const expectedTransform = `translate(${savedState.viewport.translate.x}, ${savedState.viewport.translate.y}) scale(${savedState.viewport.scale})`;
                
                logger.debug('Verified transform after applying saved state', {
                  currentTransform,
                  expected: expectedTransform
                }, 'project selector state transform');
                
                // If transform doesn't match expected, try to reapply
                if (currentTransform !== expectedTransform) {
                  logger.warn('[PROJECT SELECTOR] ⚠️ Transform doesn\'t match expected, reapplying', { 
                    current: currentTransform,
                    expected: expectedTransform,
                    projectId: id,
                    timestamp: new Date().toISOString(),
                    _style: 'background-color: #F44336; color: white; padding: 2px 5px; border-radius: 3px;'
                  }, 'project selector state transform error');                  
                  
                  // Try to force apply again with project switch flag
                  try {
                    // Apply direct transform to DOM first for immediate visual effect
                    transformGroup.setAttribute('transform', expectedTransform);
                    
                    // Then try to apply through the API for proper synchronization
                    forceApplySavedState(false, true);
                    
                    // Also update the transform coordinator to use this state
                    try {
                      const coordinator = (window as { __transformCoordinator?: { 
                        setInitialTransform: (viewport: { scale: number; translate: { x: number; y: number } }, force?: boolean, isProjectSwitch?: boolean) => void 
                      } }).__transformCoordinator;
                      if (coordinator && typeof coordinator.setInitialTransform === 'function') {
                        coordinator.setInitialTransform(savedState.viewport, true, true);
                        logger.info('Updated transform coordinator with saved state values', {}, 'project selector state transform');
                      }
                    } catch (coordError) {
                      logger.warn('Error updating transform coordinator', {
                        error: String(coordError)
                      }, 'project selector state transform error');
                    }
                  } catch (transformError) {
                    logger.error('Error reapplying transform', {
                      error: String(transformError)
                    }, 'project selector state transform error');
                  }
                }
              }
            }, 100);
          }
          
          // Apply the task visual states if we have them
          if (window.__pendingTaskVisualStates) {
            try {
              const currentState = workspaceStateManager.getState();
              
              logger.debug('Applying pending task visual states', {
                count: window.__pendingTaskVisualStates.size
              }, 'project selector state task');
              
              workspaceStateManager.updateState({
                ...currentState,
                taskVisualStates: window.__pendingTaskVisualStates
              }, 'visual');
              
              // Clear the pending state
              delete window.__pendingTaskVisualStates;
            } catch (visualStateError) {
              logger.error('Error applying task visual states', {
                error: String(visualStateError)
              }, 'project selector state task error');
            }
          }
          
          // Wait for positioning to be applied - use a longer delay for reliability
          await new Promise(resolve => setTimeout(resolve, 150));
          
          // 6. REVEALING PHASE - Show elements with transitions
          document.body.classList.remove('sr-positioning');
          document.body.classList.add('sr-revealing');
          
          logger.debug('Entered revealing phase', { projectId: id }, 'project selector state restore');
          
          // Make elements visible with transitions
          document.querySelectorAll('.sr-pending').forEach(el => {
            el.classList.remove('sr-pending');
            el.classList.add('sr-ready');
          });
          
          // Wait for reveal transitions to start
          await new Promise(resolve => setTimeout(resolve, 50));
          
          // 7. Restore selected task
          if (window.__pendingSelectedTaskId) {
            const taskId = window.__pendingSelectedTaskId;
            
            logger.info('Restoring selected task', { taskId }, 'project selector state task');
            
            // Check if this was a split task
            const wasSplitTask = taskId.includes('child-') || 
                               taskId.includes('split-') ||
                               taskId.includes('subtask-') ||
                               document.body.hasAttribute(`data-split-task-${taskId}`);
            
            try {
              // Emit selection event
              TaskEventEmitter.getInstance().emit({
                taskId,
                type: 'stateChange',
                data: { 
                  state: 'selected', 
                  wasSplitTask,
                  fromStateRestoration: true
                }
              });
              
              logger.debug('Emitted task selection event', { taskId, wasSplitTask }, 'project selector state task');
              
              // Try DOM approach as well for redundancy
              const taskElement = document.querySelector(`[data-task-id="${taskId}"]`);
              if (taskElement) {
                setTimeout(() => {
                  try {
                    logger.info('[PROJECT SELECTOR] 🔍 Found split task element, triggering click', { 
                      taskId: savedState.selectedTaskId,
                      timestamp: new Date().toISOString(),
                      _style: 'background-color: #9C27B0; color: white; padding: 2px 5px; border-radius: 3px;'
                    }, 'project selector state task');
                    
                    // Small delay to ensure transform is settled
                    setTimeout(() => {
                      taskElement.dispatchEvent(new MouseEvent('click', {
                        bubbles: true,
                        cancelable: true,
                        view: window
                      }));
                    }, 50);
                  } catch (clickError) {
                    logger.error('Error triggering task element click', { 
                      taskId,
                      error: String(clickError)
                    }, 'project selector state task error');
                  }
                }, 100);
              } else {
                logger.warn('Task element not found for click dispatch', { taskId }, 'project selector state task error');
              }
            } catch (selectionError) {
              logger.error('Error handling task selection', {
                taskId,
                error: String(selectionError)
              }, 'project selector state task error');
            }
            
            // Clear the pending task ID
            delete window.__pendingSelectedTaskId;
          }
          
          // 8. COMPLETION PHASE
          setTimeout(() => {
            try {
              // Complete restoration
              document.body.classList.remove('sr-revealing');
              
              // Ensure all elements are visible
              document.querySelectorAll('.task-rect, .project-rect, .counter-display, .connection-line').forEach(el => {
                (el as HTMLElement).style.opacity = '';
                (el as HTMLElement).style.visibility = '';
              });
              
              // Force control visibility update
              if (typeof controlVisibilityManager?.updateVisibility === 'function') {
                controlVisibilityManager.updateVisibility();
                logger.debug('Updated control visibility after restoration', {}, 'project selector ui');
              }
              
              // Ensure counters are non-interactive
              try {
                // Use dynamic import instead of require
                import('@/lib/client/visual/utils/counter-handler')
                  .then(({ counterHandler }) => {
                    if (typeof counterHandler?.disableAllCounters === 'function') {
                      counterHandler.disableAllCounters();
                      logger.debug('Disabled counters after state restoration', {}, 'project selector ui');
                    }
                  })
                  .catch(_ => {  
                    void _; // Explicitly mark as used
                    // Ignore errors loading counter handler
                  });
              } catch (_) {  
                void _; // Explicitly mark as used
                // Ignore errors loading counter handler
              }
              
              // One final check on transform - use requestAnimationFrame for proper timing
              requestAnimationFrame(() => {
                try {
                  const transformGroup = document.querySelector('.transform-group');
                  if (transformGroup && savedState.viewport) {
                    const currentTransform = transformGroup.getAttribute('transform');
                    const expectedTransform = `translate(${savedState.viewport.translate.x}, ${savedState.viewport.translate.y}) scale(${savedState.viewport.scale})`;
                    
                    if (currentTransform !== expectedTransform) {
                      logger.info('[PROJECT SELECTOR] 🔄 Final transform verification - applying correction', { 
                        current: currentTransform,
                        expected: expectedTransform,
                        timestamp: new Date().toISOString(),
                        _style: 'background-color: #E91E63; color: white; padding: 2px 5px; border-radius: 3px;'
                      }, 'project selector state transform');
                      
                      // Apply direct correction
                      transformGroup.setAttribute('transform', expectedTransform);
                      
                      // Also sync with zoom behavior
                      const svg = document.querySelector('svg');
                      if (svg) {
                        syncZoomWithTransform(svg as SVGSVGElement);
                      }
                    }
                  }
                } catch (_) { // eslint-disable-line unused-imports/no-unused-vars
                  // Ignore errors in final verification
                }
              });
              
              // Dispatch completion event
              window.dispatchEvent(new CustomEvent(WORKSPACE_STATE_RESTORED_EVENT, {
                detail: {
                  projectId: savedState.projectId,
                  viewport: savedState.viewport,
                  uiState: savedState.uiState,
                  wasProjectSpecific: true,
                  timestamp: Date.now()
                }
              }));
              
              logger.info('Project state restoration complete', { 
                projectId: id,
                timestamp: new Date().toISOString()
              }, 'project selector state restore');
            } catch (completionError) {
              logger.error('Error during completion phase', {
                error: String(completionError)
              }, 'project selector state error');
            }
          }, 300);
        } catch (error) {
          logger.error('Error during project state restoration', { 
            error: String(error),
            projectId: id 
          }, 'project selector state error');
          
          // Clean up on error
          document.body.classList.remove('sr-loading', 'sr-positioning', 'sr-revealing');
          document.querySelectorAll('.sr-pending').forEach(el => {
            el.classList.remove('sr-pending');
            (el as HTMLElement).style.opacity = '';
            (el as HTMLElement).style.visibility = '';
          });
        }
      } else {
        // If no saved state, make sure we don't have any leftover classes
        document.body.classList.remove('sr-loading', 'sr-positioning', 'sr-revealing');
        
        // Make sure elements are visible without state restoration
        document.querySelectorAll('.task-rect, .project-rect, .counter-display, .connection-line').forEach(el => {
          el.classList.remove('sr-pending');
          (el as HTMLElement).style.opacity = '';
          (el as HTMLElement).style.visibility = '';
        });
        
        logger.info('Project loaded without saved state restoration', { projectId: id }, 'project selector api');
      }
    } catch (err) {
      logger.error('Failed to select project', { error: String(err) }, 'project selector selection error');
      
      // Clean up on error
      document.body.classList.remove('sr-loading', 'sr-positioning', 'sr-revealing');
      document.querySelectorAll('.sr-pending').forEach(el => {
        el.classList.remove('sr-pending');
        (el as HTMLElement).style.opacity = '';
        (el as HTMLElement).style.visibility = '';
      });
      
      setIsProjectSelecting(false);
      projectSelectionInProgressRef.current = false;
    } finally {
      setIsProjectSelecting(false);
      projectSelectionInProgressRef.current = false;
      
      // Clean up project switching flag
      document.body.classList.remove('project-switching');
      sessionStorage.removeItem('__project_switch_in_progress');
      
      // Clear the project ID in the lastSelectedProjectId since we're done with selection
      if (lastSelectedProjectIdRef.current === id) {
        lastSelectedProjectIdRef.current = null;
      }
    }
  };

  const handleProjectDeleted = useCallback(async () => {
    logger.info('Project deleted, reloading list', {}, 'project selector deletion');
    if (selectedId) {
      setSelectedId(undefined);
    }
    
    // Only reload if no update is already in progress
    if (!projectListUpdateInProgressRef.current) {
      try {
        projectListUpdateInProgressRef.current = true;
        await loadProjects();
      } finally {
        setTimeout(() => {
          projectListUpdateInProgressRef.current = false;
        }, 300);
      }
    } else {
      logger.debug('Skipping project list reload after deletion - update already in progress', {}, 'project selector optimization');
    }
  }, [loadProjects, selectedId]);

  return (
    <div className={`h-full flex flex-col ${className}`}>
      <div className="flex-shrink-0">
        {/* Project list is now just a scrollable container with no duplicate header */}
        {isListLoading ? (
          <div className="flex justify-center p-4">
            <span className="text-sm text-gray-500">Loading projects...</span>
          </div>
        ) : (
          <div 
            ref={listRef} 
            data-project-list="true" 
            className="flex-grow overflow-y-auto h-full" 
          >
            <ProjectList
              projects={projects}
              onSelect={handleProjectSelect}
              selectedId={selectedId}
              onProjectDeleted={handleProjectDeleted}
              isSelecting={isProjectSelecting}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default ProjectSelector;