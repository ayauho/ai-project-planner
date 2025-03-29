// src/components/workspace/visual/hooks/useDimensions.ts
'use client';

import { useState, useEffect, useCallback, RefObject } from 'react';
import { logger } from '@/lib/client/logger';

export interface Dimensions {
  width: number;
  height: number;
}

interface UseDimensionsProps {
  containerRef: RefObject<HTMLDivElement | null>;  // Updated to handle null
  onDimensionsChange?: (dimensions: Dimensions) => void;
}

export function useDimensions({ containerRef, onDimensionsChange }: UseDimensionsProps): Dimensions {
  const [dimensions, setDimensions] = useState<Dimensions>({ width: 0, height: 0 });

  const updateDimensions = useCallback(() => {
    const container = containerRef.current;
    if (!container) {
      logger.debug('Container ref not ready', {}, 'hooks dimensions');
      return;
    }

    const { width, height } = container.getBoundingClientRect();
    const newDimensions = { width, height };
    setDimensions(newDimensions);
    onDimensionsChange?.(newDimensions);
    
    logger.debug('Dimensions updated', newDimensions, 'hooks dimensions');
  }, [onDimensionsChange]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      logger.debug('Container ref not available for ResizeObserver', {}, 'hooks dimensions');
      return;
    }

    const resizeObserver = new ResizeObserver(updateDimensions);
    resizeObserver.observe(container);
    updateDimensions();

    return () => {
      resizeObserver.disconnect();
    };
  }, [updateDimensions]);

  return dimensions;
}
