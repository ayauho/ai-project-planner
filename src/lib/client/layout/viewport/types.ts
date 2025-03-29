'use client';

import { Position, Dimensions } from '@/types/visual';

export interface ViewportState {
  position: Position;
  zoom: number;
  bounds: Dimensions;
}

export interface ViewportManager {
  getState(): ViewportState;
  pan(delta: Position): void;
  zoom(delta: number, center: Position): void;
  reset(): void;
  setBounds(bounds: Dimensions): void;
}
