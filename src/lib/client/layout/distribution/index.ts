'use client';

import { CircularLayoutManagerImpl } from './circular';
export type { CircularLayoutManager, CircularLayoutConfig } from './types';

export const createCircularLayoutManager = () => new CircularLayoutManagerImpl();
