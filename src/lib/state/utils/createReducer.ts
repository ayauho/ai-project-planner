import { produce } from 'immer';
import { logger } from '@/lib/client/logger';

export type ActionMap<M extends { [index: string]: unknown }> = {
  [Key in keyof M]: M[Key] extends undefined
    ? { type: Key }
    : { type: Key; payload: M[Key] }
}

export type ActionUnion<M extends { [index: string]: unknown }> = ActionMap<M>[keyof M];

export function createReducer<
  S,
  M extends { [index: string]: unknown },
  A extends ActionUnion<M>
>(
  initialState: S,
  handlers: {
    [K in keyof M]: (
      state: S,
      action: A & { type: K; payload?: M[K] }
    ) => void;
  }
) {
  return function reducer(state: S = initialState, action: A): S {
    try {
      const handler = handlers[action.type as keyof M];
      if (!handler) {
        logger.warn('No handler found for action type', { actionType: action.type }, 'state-reducer warning');
        return state;
      }

      return produce(state, draft => {
        handler(draft as S, action);
      });
    } catch (error) {
      logger.error('Error in reducer', { 
        error,
        actionType: action.type,
        state 
      }, 'state-reducer error');
      return state;
    }
  };
}
