/**
 * Layout management constants
 */

export const DEFAULT_LAYOUT_OPTIONS = {
  constraints: {
    equalDistanceToParent: true,
    equalDistanceBetweenSiblings: true,
    noIntersection: true,
    minDistance: 50
  },
  padding: 20,
  screenBounds: {
    width: 1200,
    height: 800
  }
};

export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 2;
export const ZOOM_STEP = 0.1;
