'use client';

import { ViewportManagerImpl } from './manager';
export type { ViewportManager, ViewportState } from './types';

export const createViewportManager = (bounds: { width: number; height: number }) => new ViewportManagerImpl(bounds);
