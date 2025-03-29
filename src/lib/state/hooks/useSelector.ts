'use client';

import { useCallback, useMemo } from 'react';
import { useAppState } from './useAppState';
import { AppState, StateSelector } from '../types';
import { memoizeSelector } from '../utils/memoization';

export function useSelector<T>(selector: StateSelector<T>): T {
  const { state } = useAppState();
  
  const memoizedSelector = useCallback(
    (state: AppState) => memoizeSelector(selector, state),
    [selector]
  );

  return useMemo(() => memoizedSelector(state), [memoizedSelector, state]);
}
