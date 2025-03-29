'use client';

import { useCallback } from 'react';
import { useStateContext } from '../context';
import { ActionType } from '../types';
import { logger } from '@/lib/client/logger';

export function useAppState() {
  const [state, dispatch] = useStateContext();

  const dispatchWithLogging = useCallback((action: ActionType) => {
    logger.debug('Dispatching action', { type: action.type }, 'state-management dispatch');
    dispatch(action);
  }, [dispatch]);

  return {
    state,
    dispatch: dispatchWithLogging
  };
}
