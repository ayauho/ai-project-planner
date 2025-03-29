import { createReducer, ActionMap } from '../utils/createReducer';
import { SessionState } from '../types';
import { logger } from '@/lib/client/logger';

// Action map defines all possible actions and their payloads
type SessionActionMap = {
  'session/login': {
    userId: string;
    nickname: string;
  };
  'session/logout': undefined;
};

const initialState: SessionState = {
  isAuthenticated: false,
  userId: null,
  nickname: null,
  lastLogin: null
};

export const sessionReducer = createReducer<SessionState, SessionActionMap, ActionMap<SessionActionMap>[keyof SessionActionMap]>(
  initialState,
  {
    'session/login': (state, action) => {
      state.isAuthenticated = true;
      state.userId = action.payload.userId;
      state.nickname = action.payload.nickname;
      state.lastLogin = new Date();
      logger.info('User logged in', { userId: action.payload.userId }, 'state-reducer session authentication');
    },
    'session/logout': (state) => {
      state.isAuthenticated = false;
      state.userId = null;
      state.nickname = null;
      logger.info('User logged out', {}, 'state-reducer session authentication');
    }
  }
);
