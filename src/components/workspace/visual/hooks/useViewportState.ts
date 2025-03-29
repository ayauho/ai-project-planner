'use client';

import { useCallback } from 'react';
import { select } from 'd3-selection';
import { logger } from '@/lib/client/logger';
import { ViewportState } from '@/lib/workspace/persistence/types';
import { applyTransform } from './useZoom';
import { zoomIdentity, ZoomBehavior } from 'd3-zoom';

// Import globalZoomBehavior dynamically to avoid circular dependencies
let globalZoomBehavior: ZoomBehavior<SVGSVGElement, unknown> | null = null;
// Initialize on client side only
if (typeof window !== 'undefined') {
  import('./useZoom').then(module => {
    globalZoomBehavior = module.globalZoomBehavior;
  });
}

/**
 * Hook for getting and setting the current viewport state
 */
export const useViewportState = () => {
  /**
   * Parse transform string into scale and translation components
   */
  const parseTransform = useCallback((transform: string): { scale: number; translate: { x: number; y: number } } => {
    const result = {
      scale: 1,
      translate: { x: 0, y: 0 }
    };
    
    try {
      // Extract scale
      const scaleMatch = transform.match(/scale\(([^)]+)\)/);
      if (scaleMatch && scaleMatch[1]) {
        result.scale = parseFloat(scaleMatch[1]) || 1;
      }
      
      // Extract translation
      const translateMatch = transform.match(/translate\(([^,]+),\s*([^)]+)\)/);
      if (translateMatch && translateMatch[1] && translateMatch[2]) {
        result.translate.x = parseFloat(translateMatch[1]) || 0;
        result.translate.y = parseFloat(translateMatch[2]) || 0;
      }
    } catch (error) {
      logger.error('Failed to parse transform', { transform, error }, 'hooks viewport error');
    }
    
    return result;
  }, []);

  /**
   * Get current viewport state from SVG transform
   */
  const getCurrentViewportState = useCallback((): ViewportState => {
    try {
      const transformGroup = select('.transform-group');
      if (transformGroup.empty()) {
        logger.debug('Transform group not found, returning default viewport state', {}, 'hooks viewport');
        return { scale: 1, translate: { x: 0, y: 0 } };
      }
      
      const transformStr = transformGroup.attr('transform') || '';
      const state = parseTransform(transformStr);
      
      logger.debug('Retrieved current viewport state', { 
        scale: state.scale, 
        x: state.translate.x, 
        y: state.translate.y 
      }, 'hooks viewport');
      
      return state;
    } catch (error) {
      logger.error('Failed to get current viewport state', { error }, 'hooks viewport error');
      return { scale: 1, translate: { x: 0, y: 0 } };
    }
  }, [parseTransform]);

  /**
   * Apply a viewport state to the SVG transform
   */
  const applyViewportState = useCallback((state: ViewportState): void => {
    try {
      const transformGroup = select('.transform-group');
      if (transformGroup.empty()) {
        logger.warn('Transform group not found, cannot apply viewport state', {}, 'hooks viewport warning');
        return;
      }
      
      const transform = `translate(${state.translate.x}, ${state.translate.y}) scale(${state.scale})`;
      
      // First apply to zoom behavior - this is crucial to do first to maintain synchronization
      const svg = document.querySelector('svg');
      if (svg && globalZoomBehavior) {
        const zoomTransform = zoomIdentity
          .translate(state.translate.x, state.translate.y)
          .scale(state.scale);
          
        // Apply to zoom behavior first to prevent unwanted events
        logger.debug('Applying transform to zoom behavior first', {
          transform: zoomTransform.toString()
        }, 'hooks viewport');
        applyTransform(svg as SVGSVGElement, zoomTransform);
      } else {
        // No zoom behavior yet, just set the transform directly
        transformGroup.attr('transform', transform);
      }
      
      logger.debug('Applied viewport state', { 
        scale: state.scale, 
        x: state.translate.x, 
        y: state.translate.y 
      }, 'hooks viewport');
    } catch (error) {
      logger.error('Failed to apply viewport state', { error }, 'hooks viewport error');
    }
  }, []);

  return {
    getCurrentViewportState,
    applyViewportState
  };
};
