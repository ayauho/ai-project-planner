'use client';

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
  parentId?: string; // Add this property to support hierarchy
  isPartOfChain?: boolean;
}
