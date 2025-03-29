'use client';

import { Selection } from 'd3-selection';
import { wrapText } from '../utils/text-wrapper';
import { TaskConfig } from '../types';
import { TaskRect } from '../rect-type';

export interface TaskTextMetrics {
  titleHasMore: boolean;
  descHasMore?: boolean;
  fullMetrics?: { lines: number };
}

export function renderTaskTexts(
  mainGroup: Selection<SVGGElement, unknown, null, undefined>,
  task: TaskRect,
  config: TaskConfig,
  isExpanded: boolean
): TaskTextMetrics {
  // Title text with clip path
  const titleGroup = mainGroup.append('g')
    .attr('transform', `translate(${config.padding.x},${config.padding.y})`);

  const titleText = titleGroup.append('text')
    .style('font-family', config.text.title.font)
    .style('font-size', `${config.text.title.size}px`)
    .style('font-weight', config.text.title.weight)
    .style('fill', config.text.title.color)
    .style('dominant-baseline', 'hanging');

  const { hasMore: titleHasMore } = wrapText(
    titleText,
    task.text.title,
    task.dimensions.width - (config.padding.x * 2),
    2
  );

  if (!task.text.description) {
    return { titleHasMore };
  }

  // Description text
  const descGroup = mainGroup.append('g')
    .attr('transform', `translate(${config.padding.x},${config.titleAreaHeight + config.titleMarginBottom})`);

  const descText = descGroup.append('text')
    .style('font-family', config.text.description.font)
    .style('font-size', `${config.text.description.size}px`)
    .style('font-weight', config.text.description.weight)
    .style('fill', config.text.description.color)
    .style('dominant-baseline', 'hanging');

  const textContent = task.text.description.trim();
  const maxLines = isExpanded ? undefined : 4;
  
  const testText = descText.clone(true);
  const fullMetrics = wrapText(
    testText,
    textContent,
    task.dimensions.width - (config.padding.x * 2)
  );
  testText.remove();

  const { hasMore: descHasMore } = wrapText(
    descText,
    textContent,
    task.dimensions.width - (config.padding.x * 2),
    maxLines
  );

  return { titleHasMore, descHasMore, fullMetrics };
}
