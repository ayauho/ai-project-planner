import { TaskVisualState } from '@/lib/workspace/state/types';

export interface Position {
  x: number;
  y: number;
}

export interface ControlConfig {
  iconSize: number;
  iconPadding: number;
  styles: {
    normal: {
      fill: string;
      stroke: string;
    };
    hover: {
      fill: string;
      stroke: string;
    };
  };
}

export interface BaseControl {
  id: string;
  type: 'expand' | 'regenerate' | 'delete' | 'split';
  position: Position;
  state?: TaskVisualState;
  config?: ControlConfig;
}

export interface ControlEvent {
  type: BaseControl['type'];
  elementId: string;
  position: Position;
}

export type ControlEventHandler = (event: ControlEvent) => Promise<void>;
