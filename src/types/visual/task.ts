import { ElementState, Position, Dimensions } from './index';

export interface TaskRectangle {
  id: string;
  type: 'task';
  position: Position;
  dimensions: Dimensions;
  state: ElementState;
  text: {
    title: string;
    description?: string;
  };
  isProject?: boolean;
  childrenCount: number;
  descendantCount: number;
}
