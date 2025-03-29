/**
 * Type definitions for workspace state persistence
 */

export interface ViewportState {
  scale: number;
  translate: {
    x: number;
    y: number;
  };
}

export interface UIState {
  projectListScrollPosition: number;
}

export interface PersistentWorkspaceState {
  projectId: string | null;
  selectedTaskId: string | null;
  viewport: ViewportState;
  taskVisualStates: Record<string, string>;
  uiState: UIState;
  timestamp: number;
  userId?: string | null; // Add user ID for data isolation
}

export interface WorkspacePersistenceManager {
  saveState(
    projectId: string | null, 
    selectedTaskId: string | null, 
    viewport: ViewportState, 
    taskVisualStates: Map<string, string>,
    uiState: UIState
  ): Promise<void>;
  loadState(projectId?: string): Promise<PersistentWorkspaceState | null>;
  clearState(projectId?: string): Promise<void>;
  hasSavedState(projectId?: string): Promise<boolean>;
}
