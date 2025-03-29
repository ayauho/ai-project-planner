// src/components/workspace/visual/layers/base-layer.ts
'use client';

import { Selection } from 'd3-selection';
import { select } from 'd3-selection';
import { LayerGroup, VisualLayer } from './types';

export abstract class BaseLayer implements VisualLayer {
  protected groups: Map<string, LayerGroup>;

  constructor(
    public readonly id: string,
    public readonly group: Selection<SVGGElement, unknown, null, undefined>
  ) {
    this.groups = new Map();
    
    // Add class for layer identification
    group.attr('class', `layer-${id}`);
  }

  clear(): void {
    this.groups.clear();
    this.group.selectAll('*').remove();
  }

  setTransform(transform: string): void {
    this.group.attr('transform', transform);
  }

  protected addGroup(id: string, element: SVGGElement): LayerGroup {
    const selection = select(element);
    const group = { id, element, selection };
    this.groups.set(id, group);
    return group;
  }

  protected getGroup(id: string): LayerGroup | undefined {
    return this.groups.get(id);
  }

  protected removeGroup(id: string): void {
    const group = this.groups.get(id);
    if (group) {
      group.selection.remove();
      this.groups.delete(id);
    }
  }

  abstract update(): void;
}