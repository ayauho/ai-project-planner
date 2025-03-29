import { uiReducer } from '../../../../lib/state/reducers';
import { UIState } from '../../../../lib/state/types';

describe('UI Reducer', () => {
  const initialState: UIState = {
    sidebarCollapsed: false,
    activeDialog: null,
    notifications: []
  };

  it('handles sidebar toggle', () => {
    const state = uiReducer(initialState, { type: 'ui/toggleSidebar' });
    expect(state.sidebarCollapsed).toBe(true);

    const nextState = uiReducer(state, { type: 'ui/toggleSidebar' });
    expect(nextState.sidebarCollapsed).toBe(false);
  });

  it('handles dialog state', () => {
    const state = uiReducer(initialState, {
      type: 'ui/showDialog',
      payload: 'confirmDelete'
    });
    expect(state.activeDialog).toBe('confirmDelete');

    const nextState = uiReducer(state, { type: 'ui/hideDialog' });
    expect(nextState.activeDialog).toBe(null);
  });

  it('handles notifications', () => {
    const state = uiReducer(initialState, {
      type: 'ui/addNotification',
      payload: {
        type: 'success',
        message: 'Operation successful'
      }
    });

    expect(state.notifications).toHaveLength(1);
    expect(state.notifications[0]).toMatchObject({
      type: 'success',
      message: 'Operation successful'
    });

    const notificationId = state.notifications[0].id;
    const nextState = uiReducer(state, {
      type: 'ui/removeNotification',
      payload: notificationId
    });

    expect(nextState.notifications).toHaveLength(0);
  });
});
