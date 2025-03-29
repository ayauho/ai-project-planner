'use client';

import { Selection } from 'd3-selection';
import { TaskRect } from '../rect-type';
import { TaskConfig } from '../types';

export function createClipPaths(
  group: Selection<SVGGElement, unknown, null, undefined>,
  task: TaskRect,
  config: TaskConfig
): { clipId: string; titleClipId: string } {
  const clipId = `clip-${task.id}`;
  const titleClipId = `title-clip-${task.id}`;
  const defs = group.append('defs');

  // Create clip path for title with fixed height
  defs.append('clipPath')
    .attr('id', titleClipId)
    .append('rect')
    .attr('width', task.dimensions.width - (config.padding.x * 2))
    .attr('height', config.titleAreaHeight);

  // Create main clip path with a height that can accommodate expansion
  // Use an extremely generous height to ensure expanded content is never cut off
  const clipPathHeight = Math.max(
    task.dimensions.height + 100, // Add 100px extra padding
    config.expandedHeight + 100,  // Add 100px to expanded height
    task.dimensions.height * 3    // Or triple the height, whichever is larger
  );
  
  defs.append('clipPath')
    .attr('id', clipId)
    .append('rect')
    .attr('width', task.dimensions.width)
    .attr('height', clipPathHeight)
    .attr('rx', config.cornerRadius)
    .attr('ry', config.cornerRadius)
    .attr('class', 'main-clip-rect'); // Add class for easier selection

  return { clipId, titleClipId };
}
