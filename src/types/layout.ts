export interface LayoutElement {
  id: string;
  position?: {
    x: number;
    y: number;
  };
  dimensions: {
    width: number;
    height: number;
  };
  parentId?: string;
}

export interface LayoutOptions {
  constraints: {
    equalDistanceToParent: boolean;
    equalDistanceBetweenSiblings: boolean;
    noIntersection: boolean;
    minDistance: number;
  };
  padding: number;
  screenBounds: {
    width: number;
    height: number;
  };
}

export interface CircularLayoutConfig extends LayoutOptions {
  radius?: number;
  startAngle?: number;
  endAngle?: number;
}
