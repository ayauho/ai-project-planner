export interface Position {
  x: number;
  y: number;
}

export interface Dimensions {
  width: number;
  height: number;
}

export type ElementState = 'active' | 'semi-transparent' | 'hidden';

export interface StyleConfig {
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity: number;
}

export interface ElementConfig {
  styles: Record<ElementState, StyleConfig>;
}

export * from './task';
