'use client';

import { select } from 'd3-selection';

export interface SplitButtonConfig {
  iconSize: number;
  iconColor: string;
  background: string;
  hoverBackground: string;
  strokeColor: string;
  strokeWidth: number;
}

const DEFAULT_CONFIG: SplitButtonConfig = {
  iconSize: 16,
  iconColor: '#6b7280',
  background: '#f3f4f6',
  hoverBackground: '#e5e7eb',
  strokeColor: '#9ca3af',
  strokeWidth: 1.5
};

export class SplitButton {
  private config: SplitButtonConfig;
  
  constructor(config: Partial<SplitButtonConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  render(
    container: SVGGElement,
    position: { x: number; y: number },
    onClick: () => void
  ): void {
    const buttonGroup = select(container)
      .append('g')
      .attr('class', 'split-button')
      .attr('transform', `translate(${position.x}, ${position.y})`);

    // Add invisible touch target for better interaction
    buttonGroup.append('circle')
      .attr('class', 'split-button-target')
      .attr('r', this.config.iconSize)
      .attr('cx', 0)
      .attr('cy', 0)
      .style('fill', 'transparent')
      .style('cursor', 'pointer')
      .on('click', (event) => {
        event.stopPropagation();
        onClick();
      });

    // Add visible button
    const button = buttonGroup.append('g')
      .attr('class', 'split-button-visible')
      .style('cursor', 'pointer');

    // Button background
    button.append('circle')
      .attr('class', 'split-button-bg')
      .attr('r', this.config.iconSize / 2)
      .attr('cx', 0)
      .attr('cy', 0)
      .style('fill', this.config.background)
      .style('stroke', this.config.strokeColor)
      .style('stroke-width', this.config.strokeWidth);

    // Plus icon
    const iconSize = this.config.iconSize / 3;
    button.append('g')
      .attr('class', 'plus-icon')
      .style('stroke', this.config.iconColor)
      .style('stroke-width', this.config.strokeWidth)
      .call(g => {
        g.append('line')
          .attr('x1', -iconSize)
          .attr('y1', 0)
          .attr('x2', iconSize)
          .attr('y2', 0);
        
        g.append('line')
          .attr('x1', 0)
          .attr('y1', -iconSize)
          .attr('x2', 0)
          .attr('y2', iconSize);
      });

    // Add hover effects
    buttonGroup.on('mouseover', () => {
      button.select('.split-button-bg')
        .style('fill', this.config.hoverBackground)
        .style('stroke', this.config.strokeColor);
    })
    .on('mouseout', () => {
      button.select('.split-button-bg')
        .style('fill', this.config.background)
        .style('stroke', this.config.strokeColor);
    });
  }

  renderLoading(container: SVGGElement, position: { x: number; y: number }): void {
    const loadingGroup = select(container)
      .append('g')
      .attr('class', 'split-button-loading')
      .attr('transform', `translate(${position.x}, ${position.y})`);

    // Background circle
    loadingGroup.append('circle')
      .attr('r', this.config.iconSize / 2)
      .attr('cx', 0)
      .attr('cy', 0)
      .style('fill', this.config.background)
      .style('stroke', this.config.strokeColor)
      .style('stroke-width', this.config.strokeWidth);

    // Loading spinner
    const spinnerRadius = this.config.iconSize / 3;
    const spinner = loadingGroup.append('circle')
      .attr('class', 'loading-spinner')
      .attr('r', spinnerRadius)
      .attr('cx', 0)
      .attr('cy', 0)
      .style('fill', 'none')
      .style('stroke', this.config.iconColor)
      .style('stroke-width', this.config.strokeWidth)
      .style('stroke-dasharray', `${Math.PI * 2 * spinnerRadius / 4} ${Math.PI * 2 * spinnerRadius / 4}`);

    // Add rotation animation
    spinner.append('animateTransform')
      .attr('attributeName', 'transform')
      .attr('type', 'rotate')
      .attr('from', '0 0 0')
      .attr('to', '360 0 0')
      .attr('dur', '1s')
      .attr('repeatCount', 'indefinite');
  }

  renderCountDisplay(
    container: SVGGElement,
    position: { x: number; y: number },
    counts: { children: number; descendants: number }
  ): void {
    const displayGroup = select(container)
      .append('g')
      .attr('class', 'split-button-count')
      .attr('transform', `translate(${position.x}, ${position.y})`);

    const text = counts.children === counts.descendants
      ? `${counts.children}`
      : `${counts.children}/${counts.descendants}`;

    const padding = 8;
    const height = 24;
    const minWidth = 40;

    // Measure text width
    const tempText = displayGroup.append('text')
      .style('font-size', '12px')
      .style('font-family', 'system-ui, sans-serif')
      .text(text);
    const textWidth = tempText.node()?.getComputedTextLength() ?? 0;
    tempText.remove();

    const width = Math.max(minWidth, textWidth + padding * 2);

    // Background pill
    displayGroup.append('rect')
      .attr('x', -width / 2)
      .attr('y', -height / 2)
      .attr('width', width)
      .attr('height', height)
      .attr('rx', height / 2)
      .attr('ry', height / 2)
      .style('fill', this.config.background)
      .style('stroke', this.config.strokeColor)
      .style('stroke-width', 1);

    // Count text
    displayGroup.append('text')
      .attr('x', 0)
      .attr('y', 0)
      .attr('dy', '0.35em')
      .style('text-anchor', 'middle')
      .style('font-size', '12px')
      .style('font-family', 'system-ui, sans-serif')
      .style('fill', this.config.iconColor)
      .text(text);
  }
}

export const createSplitButton = (config?: Partial<SplitButtonConfig>) => {
  return new SplitButton(config);
};
