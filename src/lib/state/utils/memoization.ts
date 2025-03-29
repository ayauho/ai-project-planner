import { useMemo } from 'react';
import { AppState, StateSelector } from '../types';

export function createSelector<T>(
  selector: StateSelector<T>,
  deps: unknown[] = []
): StateSelector<T> {
  return (state: AppState) => {
    return useMemo(() => selector(state), [state, ...deps]);
  };
}

const cache = new WeakMap();

export function memoizeSelector<T>(
  selector: StateSelector<T>,
  state: AppState
): T {
  if (!cache.has(state)) {
    cache.set(state, selector(state));
  }
  return cache.get(state);
}
