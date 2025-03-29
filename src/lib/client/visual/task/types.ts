'use client';

import { ElementState } from '@/types/visual';

export interface TaskRectangle {
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
  state: ElementState;
  text: {
    title: string;
    description?: string;
  };
  isProject?: boolean;
}

export interface TextConfig {
  font: string;
  size: number;
  color: string;
  weight: number;
  background?: string;
  lineHeight?: number;
}

export interface ButtonConfig {
  size: number;
  background: string;
  hoverBackground: string;
  iconColor: string;
  iconSize: number;
}

export interface TaskConfig {
  styles: Record<ElementState, {
    fill: string;
    stroke: string;
    strokeWidth: number;
    opacity: number;
  }>;
  text: {
    title: TextConfig;
    description: TextConfig;
  };
  padding: {
    x: number;
    y: number;
  };
  maxWidth: number;
  cornerRadius: number;
  titleAreaHeight: number;
  titleMarginBottom: number;
  button: ButtonConfig;
  expandedHeight: number;  // Added this property
}
