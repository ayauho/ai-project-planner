'use client';

import { createContext, useContext, useReducer, useMemo } from 'react';
import { AppState, ActionType } from './types';
import { sessionReducer, projectReducer, workspaceReducer, uiReducer } from './reducers';
import { logger } from '@/lib/client/logger';
import {
  isSessionAction,
  isProjectAction,
  isWorkspaceAction,
  isUIAction
} from './utils/actionGuards';

// Specific action types for each reducer
type SessionActionType = Parameters<typeof sessionReducer>[1];
type ProjectActionType = Parameters<typeof projectReducer>[1];
type WorkspaceActionType = Parameters<typeof workspaceReducer>[1];
type UIActionType = Parameters<typeof uiReducer>[1];

type Dispatch = (action: ActionType) => void;

const initialState: AppState = {
  session: {
    isAuthenticated: false,
    userId: null,
    nickname: null,
    lastLogin: null
  },
  project: {
    currentProject: {
      id: null,
      name: null,
      description: null
    },
    isLoading: false,
    error: null
  },
  workspace: {
    viewportScale: 1,
    viewportPosition: { x: 0, y: 0 },
    selectedTaskId: null,
    expandedTasks: []  // Changed to array
  },
  ui: {
    sidebarCollapsed: false,
    activeDialog: null,
    notifications: []
  }
};

const StateContext = createContext<[AppState, Dispatch] | undefined>(undefined);

function distributeAction(state: AppState, action: ActionType): AppState {
  try {
    const newState = { ...state };

    if (isSessionAction(action)) {
      newState.session = sessionReducer(state.session, action as SessionActionType);
    }
    if (isProjectAction(action)) {
      newState.project = projectReducer(state.project, action as ProjectActionType);
    }
    if (isWorkspaceAction(action)) {
      newState.workspace = workspaceReducer(state.workspace, action as WorkspaceActionType);
    }
    if (isUIAction(action)) {
      newState.ui = uiReducer(state.ui, action as UIActionType);
    }

    return newState;
  } catch (error) {
    logger.error('Error in action distribution', {
      error,
      actionType: action.type,
      state
    }, 'state-management error');
    return state;
  }
}

export function StateProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(distributeAction, initialState);
  const value = useMemo(() => [state, dispatch] as [AppState, Dispatch], [state]);

  return (
    <StateContext.Provider value={value}>
      {children}
    </StateContext.Provider>
  );
}

export function useStateContext() {
  const context = useContext(StateContext);
  if (!context) {
    throw new Error('useStateContext must be used within a StateProvider');
  }
  return context;
}
