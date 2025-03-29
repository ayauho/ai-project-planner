
// Session State
export interface SessionState {
  isAuthenticated: boolean;
  userId: string | null;
  nickname: string | null;
  lastLogin: Date | null;
}

// Project State
export interface ProjectState {
  currentProject: {
    id: string | null;
    name: string | null;
    description: string | null;
  };
  isLoading: boolean;
  error: string | null;
}

// Workspace State
export interface WorkspaceState {
  viewportScale: number;
  viewportPosition: { x: number; y: number };
  selectedTaskId: string | null;
  expandedTasks: string[];  // Changed from Set to array
}

// UI State
export interface UIState {
  sidebarCollapsed: boolean;
  activeDialog: string | null;
  notifications: Array<{
    id: string;
    type: 'info' | 'success' | 'warning' | 'error';
    message: string;
    timestamp: Date;
  }>;
}

// Combined App State
export interface AppState {
  session: SessionState;
  project: ProjectState;
  workspace: WorkspaceState;
  ui: UIState;
}

// Session Actions
export interface SessionLoginAction {
  type: 'session/login';
  payload: { userId: string; nickname: string };
}

export interface SessionLogoutAction {
  type: 'session/logout';
}

// Project Actions
export interface ProjectSelectAction {
  type: 'project/select';
  payload: { id: string; name: string; description: string };
}

export interface ProjectClearAction {
  type: 'project/clear';
}

// Workspace Actions
export interface WorkspaceUpdateViewportAction {
  type: 'workspace/updateViewport';
  payload: { scale: number; position: { x: number; y: number } };
}

export interface WorkspaceSelectTaskAction {
  type: 'workspace/selectTask';
  payload: string | null;
}

// UI Actions
export interface UIToggleSidebarAction {
  type: 'ui/toggleSidebar';
}

export interface UIShowDialogAction {
  type: 'ui/showDialog';
  payload: string;
}

export interface UIHideDialogAction {
  type: 'ui/hideDialog';
}

export interface UIAddNotificationAction {
  type: 'ui/addNotification';
  payload: { type: 'info' | 'success' | 'warning' | 'error'; message: string };
}

// Combined Action Types
export type SessionAction = SessionLoginAction | SessionLogoutAction;
export type ProjectAction = ProjectSelectAction | ProjectClearAction;
export type WorkspaceAction = WorkspaceUpdateViewportAction | WorkspaceSelectTaskAction;
export type UIAction = UIToggleSidebarAction | UIShowDialogAction | UIHideDialogAction | UIAddNotificationAction;

export type ActionType = SessionAction | ProjectAction | WorkspaceAction | UIAction;

// State Selector Type
export type StateSelector<T> = (state: AppState) => T;
