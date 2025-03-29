import { sessionReducer } from '../../../../lib/state/reducers';
import { SessionState } from '../../../../lib/state/types';

describe('Session Reducer', () => {
  const initialState: SessionState = {
    isAuthenticated: false,
    userId: null,
    nickname: null,
    lastLogin: null
  };

  it('handles login action', () => {
    const state = sessionReducer(initialState, {
      type: 'session/login',
      payload: { userId: '123', nickname: 'user' }
    });

    expect(state).toEqual({
      isAuthenticated: true,
      userId: '123',
      nickname: 'user',
      lastLogin: expect.any(Date)
    });
  });

  it('handles logout action', () => {
    const loggedInState: SessionState = {
      isAuthenticated: true,
      userId: '123',
      nickname: 'user',
      lastLogin: new Date()
    };

    const state = sessionReducer(loggedInState, { type: 'session/logout' });

    expect(state).toEqual({
      isAuthenticated: false,
      userId: null,
      nickname: null,
      lastLogin: expect.any(Date)
    });
  });
});
