'use client';

import { Selection } from 'd3-selection';
import { TaskRect } from '../rect-type';
import { TaskConfig } from '../types';

export function renderBackground(
  mainGroup: Selection<SVGGElement, unknown, null, undefined>,
  task: TaskRect,
  config: TaskConfig
): void {
  // Main background
  mainGroup.append('rect')
    .attr('width', task.dimensions.width)
    .attr('height', task.dimensions.height)
    .attr('rx', config.cornerRadius)
    .attr('ry', config.cornerRadius)
    .attr('class', 'task-background-rect')
    .style('fill', config.styles[task.state].fill)
    .style('stroke', config.styles[task.state].stroke)
    .style('stroke-width', config.styles[task.state].strokeWidth) // Use consistent stroke width for all rectangles
    .style('opacity', config.styles[task.state].opacity)
    .style('cursor', 'pointer'); // Add pointer cursor to background rect

  // Title background
  mainGroup.append('rect')
    .attr('x', 3)
    .attr('y', 3)
    .attr('width', task.dimensions.width - 6)
    .attr('height', config.titleAreaHeight - 1)
    .attr('rx', config.cornerRadius - 1)
    .attr('class', 'task-title-rect')
    .attr('fill', config.text.title.background || '#f8fafc')
    .style('cursor', 'pointer'); // Add pointer cursor to title rect
}
