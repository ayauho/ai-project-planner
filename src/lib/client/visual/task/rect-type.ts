'use client';

import { TaskVisualState } from '@/lib/workspace/state/types';

// Create a subset of TaskVisualState that only includes the basic states
// This helps with initial rendering while still allowing opacity states elsewhere
export type TaskRectState = 'active' | 'semi-transparent' | 'hidden';

export interface TaskRect {
  id: string;
  type: 'task';
  position: {
    x: number;
    y: number;
  };
  dimensions: {
    width: number;
    height: number;
  };
  state: 'active' | 'semi-transparent' | 'hidden';
  text: {
    title: string;
    description: string;
  };
  isProject?: boolean;
  childrenCount?: number;
  descendantCount?: number;
  parentId?: string;
  isPartOfChain?: boolean;
  contentHeight?: number;
  // Add property for exact opacity value to support graduated opacity
  exactOpacity?: number;
}