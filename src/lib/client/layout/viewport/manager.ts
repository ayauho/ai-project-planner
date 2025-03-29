'use client';

import { Position, Dimensions } from '@/types/visual';
import { ViewportState, ViewportManager } from './types';
import { MIN_ZOOM, MAX_ZOOM, ZOOM_STEP } from '../constants';
import { logger } from '@/lib/client/logger';

export class ViewportManagerImpl implements ViewportManager {
  private state: ViewportState;

  constructor(bounds: Dimensions) {
    this.state = {
      position: { x: 0, y: 0 },
      zoom: 1,
      bounds
    };
  }

  getState(): ViewportState {
    return { ...this.state };
  }

  pan(delta: Position): void {
    logger.debug('Panning viewport', { delta }, 'viewport-manager panning');

    const newPosition = {
      x: this.state.position.x + delta.x,
      y: this.state.position.y + delta.y
    };

    // Enforce bounds
    newPosition.x = Math.max(Math.min(newPosition.x, this.state.bounds.width), -this.state.bounds.width);
    newPosition.y = Math.max(Math.min(newPosition.y, this.state.bounds.height), -this.state.bounds.height);

    this.state.position = newPosition;
  }

  zoom(delta: number, center: Position): void {
    logger.debug('Zooming viewport', { delta, center }, 'viewport-manager zooming');

    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.state.zoom + delta * ZOOM_STEP));
    
    if (newZoom !== this.state.zoom) {
      // Adjust position to keep the center point stable
      const scale = newZoom / this.state.zoom;
      this.state.position = {
        x: center.x - (center.x - this.state.position.x) * scale,
        y: center.y - (center.y - this.state.position.y) * scale
      };
      this.state.zoom = newZoom;
    }
  }

  reset(): void {
    logger.debug('Resetting viewport', {}, 'viewport-manager reset');
    
    this.state = {
      position: { x: 0, y: 0 },
      zoom: 1,
      bounds: this.state.bounds
    };
  }

  setBounds(bounds: Dimensions): void {
    if (bounds.width <= 0 || bounds.height <= 0) {
      logger.error('Invalid viewport bounds', { bounds }, 'viewport-manager error');
      throw new Error('Invalid viewport bounds');
    }
    this.state.bounds = { ...bounds };
  }
}

export const createViewportManager = (bounds: Dimensions): ViewportManager => {
  return new ViewportManagerImpl(bounds);
};
