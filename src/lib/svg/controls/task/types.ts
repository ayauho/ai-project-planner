'use client';

import { BaseControl, ControlConfig } from '../types';
import { TaskVisualState } from '@/lib/workspace/state/types';

export interface TaskControl extends BaseControl {
  childrenCount?: number;
  descendantCount?: number;
  state?: TaskVisualState;
}

export interface TaskControlConfig extends ControlConfig {
  placement: 'top' | 'bottom' | 'left' | 'right';
  styles: {
    normal: {
      fill: string;
      stroke: string;
      opacity: number;
    };
    hover: {
      fill: string;
      stroke: string;
      opacity: number;
    };
  };
  countDisplay: {
    background: string;
    textColor: string;
    fontSize: number;
  };
}

export interface TaskControlOptions {
  config?: Partial<TaskControlConfig>;
  onExpand?: (taskId: string) => void;
  onRegenerate?: (taskId: string) => void;
  onDelete?: (taskId: string) => void;
}
