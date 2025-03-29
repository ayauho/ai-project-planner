import { createReducer, ActionMap } from '../utils/createReducer';
import { UIState } from '../types';
import { logger } from '@/lib/client/logger';

type UIActionMap = {
  'ui/toggleSidebar': undefined;
  'ui/showDialog': string;
  'ui/hideDialog': undefined;
  'ui/addNotification': {
    type: 'info' | 'success' | 'warning' | 'error';
    message: string;
  };
  'ui/removeNotification': string;
};

const initialState: UIState = {
  sidebarCollapsed: false,
  activeDialog: null,
  notifications: []
};

export const uiReducer = createReducer<UIState, UIActionMap, ActionMap<UIActionMap>[keyof UIActionMap]>(
  initialState,
  {
    'ui/toggleSidebar': (state) => {
      state.sidebarCollapsed = !state.sidebarCollapsed;
      logger.debug('Sidebar toggled', { collapsed: state.sidebarCollapsed }, 'state-reducer ui');
    },
    'ui/showDialog': (state, action) => {
      state.activeDialog = action.payload;
      logger.debug('Dialog shown', { dialogId: action.payload }, 'state-reducer ui');
    },
    'ui/hideDialog': (state) => {
      state.activeDialog = null;
      logger.debug('Dialog hidden', {}, 'state-reducer ui');
    },
    'ui/addNotification': (state, action) => {
      const id = Date.now().toString();
      state.notifications.push({
        id,
        type: action.payload.type,
        message: action.payload.message,
        timestamp: new Date()
      });
      logger.debug('Notification added', { type: action.payload.type, message: action.payload.message }, 'state-reducer ui notification');
    },
    'ui/removeNotification': (state, action) => {
      state.notifications = state.notifications.filter(n => n.id !== action.payload);
      logger.debug('Notification removed', { notificationId: action.payload }, 'state-reducer ui notification');
    }
  }
);
