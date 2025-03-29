import { createReducer, ActionMap } from '../utils/createReducer';
import { WorkspaceState } from '../types';
import { logger } from '@/lib/client/logger';

type WorkspaceActionMap = {
  'workspace/updateViewport': {
    scale: number;
    position: { x: number; y: number };
  };
  'workspace/selectTask': string | null;
  'workspace/toggleTaskExpand': string;
};

const initialState: WorkspaceState = {
  viewportScale: 1,
  viewportPosition: { x: 0, y: 0 },
  selectedTaskId: null,
  expandedTasks: []
};

export const workspaceReducer = createReducer<WorkspaceState, WorkspaceActionMap, ActionMap<WorkspaceActionMap>[keyof WorkspaceActionMap]>(
  initialState,
  {
    'workspace/updateViewport': (state, action) => {
      state.viewportScale = action.payload.scale;
      state.viewportPosition = action.payload.position;
      logger.debug('Viewport updated', { scale: action.payload.scale, position: action.payload.position }, 'state-reducer workspace viewport');
    },
    'workspace/selectTask': (state, action) => {
      state.selectedTaskId = action.payload;
      logger.debug('Task selected', { taskId: action.payload }, 'state-reducer workspace task');
    },
    'workspace/toggleTaskExpand': (state, action) => {
      const taskId = action.payload;
      const taskIndex = state.expandedTasks.indexOf(taskId);
      
      if (taskIndex === -1) {
        state.expandedTasks.push(taskId);
        logger.debug('Task expanded', { taskId }, 'state-reducer workspace task');
      } else {
        state.expandedTasks.splice(taskIndex, 1);
        logger.debug('Task collapsed', { taskId }, 'state-reducer workspace task');
      }
    }
  }
);
