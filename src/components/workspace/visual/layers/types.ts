'use client';

import { Selection } from 'd3-selection';

export interface LayerGroup {
  id: string;
  element: SVGGElement;
  selection: Selection<SVGGElement, unknown, null, undefined>;
}

export interface VisualLayer {
  id: string;
  group: Selection<SVGGElement, unknown, null, undefined>;
  clear(): void;
  setTransform(transform: string): void;
  update(): void;
}

export interface Layers {
  base: Selection<SVGGElement, unknown, null, undefined>;
  connections: Selection<SVGGElement, unknown, null, undefined>;
  content: Selection<SVGGElement, unknown, null, undefined>;
  controls: VisualLayer; // Use the VisualLayer interface for controls
}
