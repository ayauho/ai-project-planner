import { projectReducer } from '../../../../lib/state/reducers';
import { ProjectState } from '../../../../lib/state/types';

describe('Project Reducer', () => {
  const initialState: ProjectState = {
    currentProject: {
      id: null,
      name: null,
      description: null
    },
    isLoading: false,
    error: null
  };

  it('handles project selection', () => {
    const state = projectReducer(initialState, {
      type: 'project/select',
      payload: {
        id: '123',
        name: 'Test Project',
        description: 'Test Description'
      }
    });

    expect(state).toEqual({
      currentProject: {
        id: '123',
        name: 'Test Project',
        description: 'Test Description'
      },
      isLoading: false,
      error: null
    });
  });

  it('handles project clearing', () => {
    const activeProjectState: ProjectState = {
      currentProject: {
        id: '123',
        name: 'Test Project',
        description: 'Test Description'
      },
      isLoading: false,
      error: null
    };

    const state = projectReducer(activeProjectState, { type: 'project/clear' });

    expect(state).toEqual({
      currentProject: {
        id: null,
        name: null,
        description: null
      },
      isLoading: false,
      error: null
    });
  });
});
