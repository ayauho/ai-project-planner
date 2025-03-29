import { createReducer, ActionMap } from '../utils/createReducer';
import { ProjectState } from '../types';
import { logger } from '@/lib/client/logger';

// Action map defines all possible actions and their payloads
type ProjectActionMap = {
  'project/select': {
    id: string;
    name: string;
    description: string;
  };
  'project/clear': undefined;
};

const initialState: ProjectState = {
  currentProject: {
    id: null,
    name: null,
    description: null
  },
  isLoading: false,
  error: null
};

export const projectReducer = createReducer<ProjectState, ProjectActionMap, ActionMap<ProjectActionMap>[keyof ProjectActionMap]>(
  initialState,
  {
    'project/select': (state, action) => {
      state.currentProject = {
        id: action.payload.id,
        name: action.payload.name,
        description: action.payload.description
      };
      state.error = null;
      logger.info('Project selected', { projectId: action.payload.id }, 'state-reducer project');
    },
    'project/clear': (state) => {
      state.currentProject = {
        id: null,
        name: null,
        description: null
      };
      logger.info('Project cleared', {}, 'state-reducer project');
    }
  }
);
