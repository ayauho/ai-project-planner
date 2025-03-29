import { Position, Dimensions } from '../visual';

export interface LayoutElement {
  id: string;
  position: Position;
  dimensions: Dimensions;
  parentId?: string;
}

export interface LayoutConstraints {
  equalDistanceToParent: boolean;
  equalDistanceBetweenSiblings: boolean;
  noIntersection: boolean;
  minDistance?: number;
}

export interface LayoutOptions {
  constraints: LayoutConstraints;
  padding: number;
  screenBounds: Dimensions;
}
