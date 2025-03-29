'use client';

import { Selection } from 'd3-selection';

export interface WrapTextResult {
  lines: number;
  hasMore: boolean;
}

export function wrapText(
  containerText: Selection<SVGTextElement, unknown, null, undefined>,
  text: string,
  width: number,
  maxLines?: number
): WrapTextResult {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine: string[] = [];
  let hasMore = false;

  const testSpan = containerText
    .append('tspan')
    .style('visibility', 'hidden');

  for (let i = 0; i < words.length; i++) {
    currentLine.push(words[i]);
    testSpan.text(currentLine.join(' '));
    
    if ((testSpan.node()?.getComputedTextLength() ?? 0) > width) {
      currentLine.pop();
      
      if (maxLines && lines.length >= maxLines - 1) {
        let lastLine = currentLine.join(' ');
        testSpan.text(lastLine + '...');
        
        while (lastLine && (testSpan.node()?.getComputedTextLength() ?? 0) > width) {
          currentLine.pop();
          lastLine = currentLine.join(' ');
          testSpan.text(lastLine + '...');
        }
        
        if (currentLine.length > 0) {
          lines.push(lastLine + '...');
        }
        hasMore = i < words.length - 1;
        break;
      }
      
      if (currentLine.length > 0) {
        lines.push(currentLine.join(' '));
      }
      currentLine = [words[i]];
    }
  }

  if (currentLine.length > 0 && (!maxLines || lines.length < maxLines)) {
    lines.push(currentLine.join(' '));
  }

  testSpan.remove();
  containerText.selectAll('tspan').remove();

  lines.forEach((line, i) => {
    containerText
      .append('tspan')
      .attr('x', 0)
      .attr('dy', i === 0 ? '0em' : '1.2em')
      .text(line);
  });

  return { lines: lines.length, hasMore };
}
