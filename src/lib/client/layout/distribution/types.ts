'use client';

import { LayoutElement, LayoutOptions } from '@/types/layout';

export interface CircularLayoutConfig extends LayoutOptions {
  radius?: number;
  startAngle?: number;
  endAngle?: number;
}

export interface CircularLayoutManager {
  distribute(elements: LayoutElement[], config: CircularLayoutConfig): Promise<LayoutElement[]>;
}
