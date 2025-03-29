'use client';

import type { LayoutOptions } from '@/types/layout';
import { logger } from '@/lib/client/logger';

export const DEFAULT_LAYOUT_OPTIONS: LayoutOptions = {
  constraints: {
    equalDistanceToParent: true,
    equalDistanceBetweenSiblings: true,
    noIntersection: true,
    minDistance: 100
  },
  padding: 40,
  screenBounds: {
    width: 1200,
    height: 800
  }
};

/**
 * Default zoom scale used throughout the application
 * This is the single source of truth for the default zoom level
 */
export const DEFAULT_ZOOM_SCALE = 0.7;
export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 2;
export const ZOOM_STEP = 0.1;/**
 * Calculate the transform parameters for centering a project
 * This calculation provides precise centering of a project in the SVG viewport
 * 
 * @param svgWidth Width of the SVG viewport
 * @param svgHeight Height of the SVG viewport
 * @param projectWidth Width of the project rectangle
 * @param projectHeight Height of the project rectangle
 * @param customScale Optional custom scale, uses DEFAULT_ZOOM_SCALE if not provided
 * @returns Object with scale and translate parameters
 */
export const calculateProjectCenter = (
  svgWidth: number, 
  svgHeight: number, 
  projectWidth: number, 
  projectHeight: number,
  customScale?: number
) => {
  // Use the defined zoom scale for consistency, or custom scale if provided
  const scale = customScale !== undefined ? customScale : DEFAULT_ZOOM_SCALE;
  
  // Calculate the center point of the element
  // In SVG coordinates, (x,y) represents the top-left corner of the element
  // For new projects, we assume the project is initially positioned at (0,0)
  const elementX = 0; 
  const elementY = 0;
  const centerX = elementX + projectWidth / 2;
  const centerY = elementY + projectHeight / 2;
  
  // Calculate the translation needed to center the element in the viewport
  // This formula ensures the element's center point is exactly in the middle of the viewport
  const translateX = (svgWidth / 2 - centerX * scale);
  const translateY = (svgHeight / 2 - centerY * scale);
  
  // Log the calculation details for transparency
  logger.info('[CENTER CALCULATION] Project centering values', {
    svgDimensions: { width: svgWidth, height: svgHeight },
    projectDimensions: { width: projectWidth, height: projectHeight },
    centerPoint: { x: centerX, y: centerY },
    translation: { x: translateX, y: translateY },
    scale,
    _style: 'background-color: #3F51B5; color: white; padding: 2px 5px; border-radius: 3px;'
  }, 'layout-calculation project-centering');
  
  // Validate values to prevent NaN
  return {
    scale: isNaN(scale) ? DEFAULT_ZOOM_SCALE : scale,
    x: isNaN(translateX) ? 0 : translateX,
    y: isNaN(translateY) ? 0 : translateY,
    translate: { 
      x: isNaN(translateX) ? 0 : translateX,
      y: isNaN(translateY) ? 0 : translateY
    }
  };
};
