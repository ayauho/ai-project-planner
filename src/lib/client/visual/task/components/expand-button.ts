'use client';

import { Selection } from 'd3-selection';
import { ButtonConfig } from '../types';

export function createExpandButton(
  buttonGroup: Selection<SVGGElement, unknown, null, undefined>,
  buttonConfig: ButtonConfig,
  expanded: boolean,
  currentHeight: number,
  buttonSize: number,
  onClick: () => void
): void {
  const iconSize = buttonConfig.iconSize;
  const chevronX = buttonSize / 2 - iconSize / 2;
  const chevronY = buttonSize - iconSize - 2;  // 2px padding from bottom
  
  buttonGroup.append('path')
    .attr('transform', `translate(${chevronX},${chevronY})`)
    .attr('d', expanded 
      ? `M 0 ${iconSize*0.75} L ${iconSize/2} ${iconSize*0.25} L ${iconSize} ${iconSize*0.75}`  // Up arrow
      : `M 0 ${iconSize*0.25} L ${iconSize/2} ${iconSize*0.75} L ${iconSize} ${iconSize*0.25}`   // Down arrow
    )
    .attr('stroke', buttonConfig.iconColor)
    .attr('stroke-width', 2)
    .attr('fill', 'none')
    .style('cursor', 'pointer')
    .on('click', onClick);
}
