export interface Position {
  x: number;
  y: number;
}

export interface Dimensions {
  width: number;
  height: number;
}

export interface LayoutElement {
  id: string;
  position: Position;
  dimensions: Dimensions;
  parentId?: string;
}
