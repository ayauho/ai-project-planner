'use client';

import { logger } from '@/lib/client/logger';
import { localStorageManager } from '@/lib/client/storage/local-storage';
import { PersistentWorkspaceState, ViewportState, UIState, WorkspacePersistenceManager } from './types';
import { STORAGE_KEY, STORAGE_KEY_BASE, STATE_EXPIRY_DAYS, getProjectStorageKey, getUserStorageKey } from './constants';

class WorkspacePersistenceManagerImpl implements WorkspacePersistenceManager {
  private static instance: WorkspacePersistenceManagerImpl;
  private saveDebounceTimeout: NodeJS.Timeout | null = null;
  private lastSaveTime: number = 0;
  private pendingSave: PersistentWorkspaceState | null = null;

  private constructor() {}

  public static getInstance(): WorkspacePersistenceManagerImpl {
    if (!WorkspacePersistenceManagerImpl.instance) {
      WorkspacePersistenceManagerImpl.instance = new WorkspacePersistenceManagerImpl();
    }
    return WorkspacePersistenceManagerImpl.instance;
  }

  /**
   * Save workspace state to local storage with debouncing
   */
  async saveState(
    projectId: string | null, 
    selectedTaskId: string | null, 
    viewport: ViewportState,
    taskVisualStates: Map<string, string>,
    uiState: UIState
  ): Promise<void> {
    try {
      if (!projectId) {
        logger.debug('No project selected, skipping state save', {}, 'workspace-persistence');
        return;
      }
      
      // Check if we're creating a new project - don't save state in that case
      const isCreatingProject = sessionStorage.getItem('__creating_project') !== null;
      if (isCreatingProject) {
        logger.debug('Creating new project, skipping state save', {}, 'workspace-persistence');
        return;
      }
      
      // Get current user ID for proper data isolation
      let userId: string | undefined = undefined;
      try {
        const { authStorage } = await import('@/lib/client/auth/storage');
        const session = await authStorage.getSession();
        userId = session?.user?._id;
        
        if (!userId) {
          logger.warn('No user ID available for state save, using global fallback', {}, 'workspace-persistence warning');
        }
      } catch (authError) {
        logger.error('Error getting user session for state save', { 
          error: String(authError) 
        }, 'workspace-persistence error');
      }
      
      // Convert task visual states Map to Record for storage
      const taskVisualStatesObj: Record<string, string> = {};
      taskVisualStates.forEach((value, key) => {
        taskVisualStatesObj[key] = value;
      });

      // Create persistent state
      const persistentState: PersistentWorkspaceState = {
        projectId,
        selectedTaskId,
        viewport,
        taskVisualStates: taskVisualStatesObj,
        uiState,
        timestamp: Date.now(),
        userId // Store user ID with the state for validation
      };
      
      // Store pending save
      this.pendingSave = persistentState;

      // Debounce saves to prevent excessive storage operations
      const now = Date.now();
      const timeSinceLastSave = now - this.lastSaveTime;
      const minSaveInterval = 500; // ms
      
      // If we've recently saved, debounce
      if (timeSinceLastSave < minSaveInterval) {
        if (this.saveDebounceTimeout) {
          clearTimeout(this.saveDebounceTimeout);
        }
        
        this.saveDebounceTimeout = setTimeout(() => {
          this.executeSave(this.pendingSave!);
          this.saveDebounceTimeout = null;
        }, minSaveInterval - timeSinceLastSave + 50);
        
        return;
      }
      
      // Otherwise save immediately
      this.executeSave(persistentState);
    } catch (error) {
      logger.error('Failed to queue workspace state save', { error: String(error) }, 'workspace-persistence error');
    }
  }
  
  /**
   * Execute the actual save operation
   */
  private async executeSave(state: PersistentWorkspaceState): Promise<void>{
    try {
      const projectId = state.projectId;
      const userId = state.userId;
      
      if (!projectId) {
        logger.warn('No project ID in state to save', {}, 'workspace-persistence warning');
        return;
      }
      
      // Validate viewport values before saving
      if (!state.viewport || 
          isNaN(state.viewport.scale) || 
          isNaN(state.viewport.translate.x) || 
          isNaN(state.viewport.translate.y)) {
        
        logger.warn('Invalid viewport values detected before save, fixing', {
          viewport: state.viewport,
          projectId
        }, 'workspace-persistence warning');
        
        // Fix the values
        if (!state.viewport) {
          state.viewport = {
            scale: 1,
            translate: { x: 0, y: 0 }
          };
        } else {
          state.viewport = {
            scale: isNaN(state.viewport.scale) ? 1 : state.viewport.scale,
            translate: {
              x: isNaN(state.viewport.translate.x) ? 0 : state.viewport.translate.x,
              y: isNaN(state.viewport.translate.y) ? 0 : state.viewport.translate.y
            }
          };
        }
      }
      
      // Ensure task visual states exist
      if (!state.taskVisualStates) {
        state.taskVisualStates = {};
        logger.debug('Added empty task visual states object to state', {}, 'workspace-persistence');
      }
      
      // Ensure UI state exists
      if (!state.uiState) {
        state.uiState = {
          projectListScrollPosition: 0
        };
        logger.debug('Added default UI state object to state', {}, 'workspace-persistence');
      }
      
      // Apply timestamp if not present
      if (!state.timestamp) {
        state.timestamp = Date.now();
        logger.debug('Added timestamp to state', {}, 'workspace-persistence');
      }
      
      // Get project-specific storage key with user isolation
      const projectStorageKey = getProjectStorageKey(projectId, userId);
      
      // Get user-specific main storage key
      const userStorageKey = getUserStorageKey(userId);
      
      logger.info('Saving workspace state for project', { 
        projectId,
        userId,
        selectedTaskId: state.selectedTaskId,
        taskStatesCount: Object.keys(state.taskVisualStates).length,
        viewportScale: state.viewport.scale,
        viewportTranslateX: state.viewport.translate.x,
        viewportTranslateY: state.viewport.translate.y,
        projectListScrollPosition: state.uiState.projectListScrollPosition,
        timestamp: new Date(state.timestamp).toISOString(),
        projectStorageKey,
        userStorageKey
      }, 'workspace-persistence save');

      // Update last save time
      this.lastSaveTime = Date.now();
      
      try {
        // Save to project-specific key first - this is the primary storage
        await localStorageManager.setItem(projectStorageKey, state);
        
        // Also save to user-specific global key for page refresh
        await localStorageManager.setItem(userStorageKey, state);
        
        // Verify storage is working by immediately reading back the state
        const verifyState = await localStorageManager.getItem<PersistentWorkspaceState>(projectStorageKey);
        if (!verifyState) {
          logger.warn('Failed to verify state after saving', { 
            projectId, 
            userId,
            storageKey: projectStorageKey 
          }, 'workspace-persistence warning');
          
          // Try the direct method
          this.saveWithDirectAccess(projectStorageKey, userStorageKey, state);
        } else {
          logger.debug('Verified state save was successful', { 
            projectId, 
            userId,
            matchesSelectedTask: verifyState.selectedTaskId === state.selectedTaskId,
            viewportMatch: 
              verifyState.viewport && 
              verifyState.viewport.scale === state.viewport.scale &&
              verifyState.viewport.translate.x === state.viewport.translate.x &&
              verifyState.viewport.translate.y === state.viewport.translate.y
          }, 'workspace-persistence save');
          
          // Dispatch successful save event
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('workspace-state-saved-success', {
              detail: {
                projectId,
                timestamp: Date.now()
              }
            }));
          }
        }
      } catch (storageError) {
        // Attempt alternative storage method if the primary fails
        logger.warn('Error saving to local storage, trying alternative method', { 
          error: String(storageError), 
          projectId,
          userId
        }, 'workspace-persistence warning');
        
        this.saveWithDirectAccess(projectStorageKey, userStorageKey, state);
      }
    } catch (error) {
      logger.error('Failed to save workspace state', { error: String(error) }, 'workspace-persistence error');
    }
  }
  
  /**
   * Save state using direct localStorage access as a fallback
   */
  private saveWithDirectAccess(
    projectStorageKey: string, 
    userStorageKey: string, 
    state: PersistentWorkspaceState
  ): void {
    try {
      // Direct localStorage access as fallback
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(projectStorageKey, JSON.stringify(state));
        localStorage.setItem(userStorageKey, JSON.stringify(state));
        
        logger.info('Saved state using direct localStorage access', { 
          projectId: state.projectId,
          userId: state.userId 
        }, 'workspace-persistence save');
        
        // Try to verify
        try {
          const verifyJson = localStorage.getItem(projectStorageKey);
          if (verifyJson) {
            const verifyState = JSON.parse(verifyJson);
            if (verifyState && verifyState.projectId === state.projectId) {
              logger.debug('Verified direct localStorage save was successful', {}, 'workspace-persistence save');
              
              // Dispatch successful save event
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('workspace-state-saved-success', {
                  detail: {
                    projectId: state.projectId,
                    timestamp: Date.now()
                  }
                }));
              }
            }
          }
        // eslint-disable-next-line unused-imports/no-unused-vars
        } catch (_error) {
          // Ignore verify errors
        }
      }
    } catch (fallbackError) {
      logger.error('All storage methods failed', { 
        error: String(fallbackError)
      }, 'workspace-persistence error');
    }
  }

  /**
   * Load workspace state from local storage
   * @param projectId Optional project ID to load state for specific project
   */
  async loadState(projectId?: string): Promise<PersistentWorkspaceState | null>{
    try {
      // Add distinctive console logging for easier debugging
      logger.info('Loading workspace state', { 
        projectId: projectId || 'global',
        timestamp: new Date().toISOString()
      }, 'workspace-persistence load');
      
      // Check if we're creating a new project - don't load state in that case
      const isCreatingProject = sessionStorage.getItem('__creating_project') !== null;
      if (isCreatingProject) {
        logger.info('Creating new project, skipping state loading', {}, 'workspace-persistence load');
        return null;
      }

      // Get current user ID for proper data isolation
      let userId: string | undefined = undefined;
      try {
        const { authStorage } = await import('@/lib/client/auth/storage');
        const session = await authStorage.getSession();
        userId = session?.user?._id;
        
        if (!userId) {
          logger.warn('No user ID available for state load, using global fallback', {}, 'workspace-persistence warning');
        } else {
          logger.debug('Using user ID for state isolation', { userId }, 'workspace-persistence load');
        }
      } catch (authError) {
        logger.error('Error getting user session for state load', { 
          error: String(authError) 
        }, 'workspace-persistence error');
      }

      // If projectId is provided, we MUST try to load project-specific state
      let state: PersistentWorkspaceState | null = null;
      let stateSource = 'none';
      
      if (projectId) {
        // Try user-specific project state first
        const userProjectStorageKey = getProjectStorageKey(projectId, userId);
        
        try {
          // First try using the storage manager with user-specific key
          state = await localStorageManager.getItem<PersistentWorkspaceState>(userProjectStorageKey);
          
          // If state exists, record source
          if (state) {
            stateSource = 'user-project';
          }
          
          logger.debug('Attempted to load user-specific project state', { 
            projectId,
            userId,
            storageKey: userProjectStorageKey,
            stateFound: !!state,
            stateSource
          }, 'workspace-persistence load');
        } catch (loadError) {
          logger.warn('Error loading user-specific project state', { 
            error: String(loadError), 
            projectId,
            userId
          }, 'workspace-persistence warning');
          
          // Try direct localStorage access as fallback
          if (typeof localStorage !== 'undefined') {
            try {
              const rawState = localStorage.getItem(userProjectStorageKey);
              if (rawState) {
                state = JSON.parse(rawState);
                stateSource = 'user-project-direct';
                
                logger.debug('Loaded project state using direct localStorage access', {
                  projectId,
                  userId
                }, 'workspace-persistence load');
              }
            } catch (directError) {
              logger.error('Error loading project state with direct access', {
                error: String(directError),
                projectId
              }, 'workspace-persistence error');
            }
          }
        }
      } else {
        // No specific project requested, try user-specific global state first
        if (userId) {
          const userStorageKey = getUserStorageKey(userId);
          
          try {
            state = await localStorageManager.getItem<PersistentWorkspaceState>(userStorageKey);
            
            // If state exists, record source
            if (state) {
              stateSource = 'user-global';
            }
            
            logger.debug('Attempted to load user-specific global state', {
              userId,
              stateFound: !!state,
              stateSource
            }, 'workspace-persistence load');
          } catch (userGlobalError) {
            logger.warn('Error loading user-specific global state', { 
              error: String(userGlobalError),
              userId
            }, 'workspace-persistence warning');
            
            // Try direct localStorage access as fallback
            if (typeof localStorage !== 'undefined') {
              try {
                const rawState = localStorage.getItem(userStorageKey);
                if (rawState) {
                  state = JSON.parse(rawState);
                  stateSource = 'user-global-direct';
                  
                  logger.debug('Loaded user global state using direct localStorage access', {
                    userId
                  }, 'workspace-persistence load');
                }
              } catch (directError) {
                logger.error('Error loading user global state with direct access', {
                  error: String(directError),
                  userId
                }, 'workspace-persistence error');
              }
            }
          }
        }
        
        // If no user-specific state found, try legacy global state
        if (!state) {
          try {
            state = await localStorageManager.getItem<PersistentWorkspaceState>(STORAGE_KEY);
            
            // If state exists, record source
            if (state) {
              stateSource = 'legacy-global';
            }
            
            logger.debug('Attempted to load legacy global state', {
              stateFound: !!state,
              stateSource
            }, 'workspace-persistence load');
          } catch (globalLoadError) {
            logger.warn('Error loading legacy global state', { 
              error: String(globalLoadError) 
            }, 'workspace-persistence warning');
            
            // Try direct localStorage access as fallback
            if (typeof localStorage !== 'undefined') {
              try {
                const rawState = localStorage.getItem(STORAGE_KEY);
                if (rawState) {
                  state = JSON.parse(rawState);
                  stateSource = 'legacy-global-direct';
                  
                  logger.debug('Loaded legacy global state using direct localStorage access', {}, 'workspace-persistence load');
                }
              } catch (directError) {
                logger.error('Error loading legacy global state with direct access', {
                  error: String(directError)
                }, 'workspace-persistence error');
              }
            }
          }
        }
      }
      
      // If we still have no state, give up
      if (!state) {
        logger.debug('No state found after all attempts', { 
          projectId,
          userId,
          stateSource
        }, 'workspace-persistence load');
        return null;
      }
      
      // Validate that the state is for the requested project if specified
      if (projectId && state.projectId !== projectId) {
        logger.warn('Loaded state is for a different project than requested', {
          requestedProjectId: projectId,
          loadedProjectId: state.projectId,
          stateSource
        }, 'workspace-persistence warning');
        
        // In this case, we should return null since the state doesn't match the requested project
        return null;
      }
      
      // Check if state is too old
      const now = Date.now();
      const expiryTime = STATE_EXPIRY_DAYS * 24 * 60 * 60 * 1000; // days in ms
      
      if (state.timestamp && now - state.timestamp > expiryTime) {
        logger.info('Saved workspace state is expired, clearing', {
          projectId: state.projectId,
          userId: state.userId || userId,
          savedAt: new Date(state.timestamp).toISOString(),
          expiryDays: STATE_EXPIRY_DAYS,
          stateSource
        }, 'workspace-persistence expiry');
        
        if (projectId) {
          // Only clear the specific project state if projectId was provided
          await localStorageManager.removeItem(getProjectStorageKey(projectId, userId));
        } else {
          if (userId) {
            await this.clearState(userId);
          } else {
            await this.clearState();
          }
        }
        return null;
      }
      
      // Handle backward compatibility with older saved states
      if (!state.uiState) {
        logger.debug('Adding missing UI state to loaded state', {}, 'workspace-persistence load');
        state.uiState = {
          projectListScrollPosition: 0
        };
      }
      
      // Fix any missing or invalid properties
      if (!state.taskVisualStates) {
        logger.debug('Adding missing task visual states to loaded state', {}, 'workspace-persistence load');
        state.taskVisualStates = {};
      }
      
      // Validate viewport
      if (!state.viewport || 
          typeof state.viewport.scale !== 'number' ||
          isNaN(state.viewport.scale) ||
          isNaN(state.viewport.translate.x) ||
          isNaN(state.viewport.translate.y)) {
        
        logger.warn('Invalid viewport in loaded state, fixing', {
          viewport: state.viewport,
          projectId: state.projectId
        }, 'workspace-persistence warning');
        
        state.viewport = {
          scale: 1,
          translate: { x: 0, y: 0 }
        };
      }
      
      // Ensure state has user ID (backward compatibility)
      if (!state.userId && userId) {
        logger.debug('Adding missing user ID to loaded state', {}, 'workspace-persistence load');
        state.userId = userId;
      }
      
      // Add timestamp if missing (should never happen, but just in case)
      if (!state.timestamp) {
        logger.warn('Missing timestamp in state, adding current time', {}, 'workspace-persistence warning');
        state.timestamp = Date.now();
      }
      
      logger.info('Successfully loaded workspace state', { 
        projectId: state.projectId,
        userId: state.userId,
        selectedTaskId: state.selectedTaskId,
        taskStatesCount: Object.keys(state.taskVisualStates).length,
        viewportScale: state.viewport.scale,
        viewportTranslateX: state.viewport.translate.x,
        viewportTranslateY: state.viewport.translate.y,
        projectListScrollPosition: state.uiState?.projectListScrollPosition || 0,
        savedAt: new Date(state.timestamp).toISOString(),
        stateSource,
        loadedAt: new Date().toISOString()
      }, 'workspace-persistence load');
      
      // Dispatch an event that state has been loaded
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('workspace-state-loaded', {
          detail: {
            projectId: state.projectId,
            stateSource,
            timestamp: Date.now()
          }
        }));
      }
      
      return state;
    } catch (error) {
      logger.error('Failed to load workspace state', { error: String(error) }, 'workspace-persistence error');
      return null;
    }
  }

  /**
   * Clear saved workspace state
   * @param userIdOrProjectId Either a userId or projectId
   * @param projectId Optional project ID if first param is userId
   */
  async clearState(userIdOrProjectId?: string, projectId?: string): Promise<void> {
    try {
      // Determine if first parameter is userId or projectId
      let userId: string | undefined = undefined;
      let projectToDelete: string | undefined = undefined;
      
      // If two parameters, first is userId, second is projectId
      if (projectId) {
        userId = userIdOrProjectId;
        projectToDelete = projectId;
      }
      // If one parameter and no second parameter, it's a projectId
      else if (userIdOrProjectId && !projectId) {
        projectToDelete = userIdOrProjectId;
        
        // Try to get current user ID
        userId = await this.getCurrentUserId();
      }
      // If no parameters, it's a global clear, still try to get userId
      else {
        userId = await this.getCurrentUserId();
      }
      
      // If we have a specific project to delete
      if (projectToDelete) {
        logger.info('Clearing state for project', { 
          projectId: projectToDelete,
          userId
        }, 'workspace-persistence clear');
        
        // Clear user-specific project state if we have userId
        if (userId) {
          const userProjectStorageKey = getProjectStorageKey(projectToDelete, userId);
          await localStorageManager.removeItem(userProjectStorageKey);
          
          // Check if this project is in the user-specific main state
          try {
            const userStorageKey = getUserStorageKey(userId);
            const userMainState = await localStorageManager.getItem<PersistentWorkspaceState>(userStorageKey);
            if (userMainState && userMainState.projectId === projectToDelete) {
              logger.info('Clearing user-specific main state as it references deleted project', { 
                projectId: projectToDelete,
                userId
              }, 'workspace-persistence clear');
              await localStorageManager.removeItem(userStorageKey);
            }
          } catch (userStateError) {
            logger.warn('Error checking user-specific main state', { 
              error: String(userStateError),
              userId
            }, 'workspace-persistence warning');
          }
        }
        
        logger.info('Project-specific workspace state cleared', { 
          projectId: projectToDelete,
          userId 
        }, 'workspace-persistence clear');
      } else {
        // Clear all state (with user isolation if possible)
        if (typeof localStorage !== 'undefined') {
          const keysToRemove: string[] = [];
          // Find all keys related to our app
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key) {
              // If we have userId, only remove keys for this user
              if (userId) {
                const userKeyPattern = `${STORAGE_KEY_BASE}-user-${userId}`;
                if (key.startsWith(userKeyPattern)) {
                  keysToRemove.push(key);
                }
              } 
              // Otherwise, remove all workspace state keys
              else if (key.startsWith(STORAGE_KEY_BASE)) {
                keysToRemove.push(key);
              }
            }
          }
          
          // Remove all found keys
          for (const key of keysToRemove) {
            await localStorageManager.removeItem(key);
          }
          
          logger.info('Workspace states cleared', { 
            count: keysToRemove.length,
            userId: userId || 'all'
          }, 'workspace-persistence clear');
        } else {
          // Fallback to just removing main keys
          if (userId) {
            await localStorageManager.removeItem(getUserStorageKey(userId));
            logger.info('User-specific main workspace state cleared', { userId }, 'workspace-persistence clear');
          } else {
            await localStorageManager.removeItem(STORAGE_KEY);
            logger.info('Legacy main workspace state cleared', {}, 'workspace-persistence clear');
          }
        }
      }
    } catch (error) {
      // Use local variables for error logging to avoid scope issues
      const localUserId = typeof userIdOrProjectId !== 'undefined' && projectId ? userIdOrProjectId : undefined;
      const localProjectId = projectId || (typeof userIdOrProjectId !== 'undefined' && !projectId ? userIdOrProjectId : undefined);
      
      logger.error('Failed to clear workspace state', { 
        error: String(error),
        userId: localUserId || 'none',
        projectId: localProjectId || 'all'
      }, 'workspace-persistence error');
    }
  }

  /**
   * Check if there is a saved state available
   * @param projectId Optional project ID to check for specific project state
   */
  async hasSavedState(projectId?: string): Promise<boolean> {
    try {
      const state = await this.loadState(projectId);
      return !!state;
    } catch (error) {
      logger.error('Failed to check for saved workspace state', { 
        error: String(error),
        projectId: projectId || 'general'
      }, 'workspace-persistence error');
      return false;
    }
  }
  
  /**
   * Helper method to get current user ID
   * This avoids duplicating this code across methods
   */
  private async getCurrentUserId(): Promise<string | undefined> {
    try {
      const { authStorage } = await import('@/lib/client/auth/storage');
      const session = await authStorage.getSession();
      return session?.user?._id;
    } catch (error) {
      logger.error('Error getting current user ID', { error: String(error) }, 'workspace-persistence error');
      return undefined;
    }
  }
}

export const workspacePersistenceManager = WorkspacePersistenceManagerImpl.getInstance();
