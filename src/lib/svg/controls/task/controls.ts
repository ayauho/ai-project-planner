'use client';

import { select, Selection } from 'd3-selection';
import { TaskControl, TaskControlConfig } from './types';
import { ControlEventHandler } from '../types';
import { logger } from '@/lib/client/logger';
import { TaskEventEmitter, TaskEventType } from '@/lib/client/visual/task/events';

const DEFAULT_CONFIG = {
  iconSize: 16,
  iconPadding: 4,
  placement: 'bottom' as const,
  styles: {
    normal: {
      fill: '#f3f4f6',
      stroke: '#9ca3af',
      opacity: 1
    },
    hover: {
      fill: '#e5e7eb',
      stroke: '#6b7280',
      opacity: 1
    }
  },
  countDisplay: {
    background: '#f1f5f9',
    textColor: '#64748b',
    fontSize: 12
  }
} as const;

export class TaskControls {
  private config: TaskControlConfig;
  private handlers: Record<string, ControlEventHandler>;
  private loadingControls: Set<string>;
  private eventEmitter: TaskEventEmitter;

  constructor(
    handlers: Record<string, ControlEventHandler>,
    config: Partial<TaskControlConfig>= {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.handlers = handlers;
    this.loadingControls = new Set();
    this.eventEmitter = TaskEventEmitter.getInstance();
  }

  private renderSplitIcon(group: Selection<SVGGElement, unknown, null, undefined>): void {
    const size = this.config.iconSize;
    const halfSize = size / 2;

    group.append('line')
      .attr('x1', -halfSize)
      .attr('y1', 0)
      .attr('x2', halfSize)
      .attr('y2', 0)
      .style('stroke', this.config.styles.normal.stroke)
      .style('stroke-width', 2);

    group.append('line')
      .attr('x1', 0)
      .attr('y1', -halfSize)
      .attr('x2', 0)
      .attr('y2', halfSize)
      .style('stroke', this.config.styles.normal.stroke)
      .style('stroke-width', 2);
  }

  private renderRegenerateIcon(group: Selection<SVGGElement, unknown, null, undefined>): void {
    const size = this.config.iconSize;
    const radius = size / 3;
    
    // Create a properly centered circular arrows icon for regenerate
    // Draw a full circular arrow with proper centering
    const _path = group.append('path')
      .attr('d', `M0,${-radius} A${radius},${radius} 0 1,1 ${-radius*0.7},${radius*0.7} M${-radius*0.7},${radius*0.7} L${-radius},${radius*0.5} L${-radius*0.5},${radius}`)
      .style('fill', 'none')
      .style('stroke', this.config.styles.normal.stroke)
      .style('stroke-width', 2)
      .style('stroke-linecap', 'round')
      .style('stroke-linejoin', 'round');
  }

  private renderDeleteIcon(group: Selection<SVGGElement, unknown, null, undefined>): void {
    const size = this.config.iconSize;
    const halfSize = size / 2;
    
    // Draw trash can icon
    group.append('rect')
      .attr('x', -halfSize * 0.6)
      .attr('y', -halfSize * 0.3)
      .attr('width', halfSize * 1.2)
      .attr('height', halfSize * 1.4)
      .attr('rx', 1)
      .style('fill', 'none')
      .style('stroke', this.config.styles.normal.stroke)
      .style('stroke-width', 2);
      
    // Draw trash can lid
    group.append('path')
      .attr('d', `M${-halfSize * 0.8},${-halfSize * 0.3} H${halfSize * 0.8}`)
      .style('fill', 'none')
      .style('stroke', this.config.styles.normal.stroke)
      .style('stroke-width', 2);
      
    // Draw trash can handle
    group.append('path')
      .attr('d', `M${-halfSize * 0.3},${-halfSize * 0.3} V${-halfSize * 0.6} H${halfSize * 0.3} V${-halfSize * 0.3}`)
      .style('fill', 'none')
      .style('stroke', this.config.styles.normal.stroke)
      .style('stroke-width', 2);
      
    // Draw lines inside trash can
    group.append('line')
      .attr('x1', 0)
      .attr('y1', -halfSize * 0.1)
      .attr('x2', 0)
      .attr('y2', halfSize * 0.8)
      .style('stroke', this.config.styles.normal.stroke)
      .style('stroke-width', 1.5);
  }

  private renderLoadingSpinner(group: Selection<SVGGElement, unknown, null, undefined>): void {
    logger.debug('Rendering loading spinner for control', {}, 'svg-controls rendering');
    const radius = this.config.iconSize / 2;
    
    group.append('circle')
      .attr('r', radius)
      .attr('cx', 0)
      .attr('cy', 0)
      .style('fill', 'none')
      .style('stroke', this.config.styles.normal.stroke)
      .style('stroke-width', 2)
      .style('stroke-dasharray', `${Math.PI * radius / 2} ${Math.PI * radius}`)
      .append('animateTransform')
        .attr('attributeName', 'transform')
        .attr('type', 'rotate')
        .attr('from', '0 0 0')
        .attr('to', '360 0 0')
        .attr('dur', '1s')
        .attr('repeatCount', 'indefinite');
  }

  private renderCountDisplay(
    group: Selection<SVGGElement, unknown, null, undefined>,
    childrenCount: number,
    descendantCount: number
  ): void {
    const text = childrenCount === descendantCount
      ? `${childrenCount}`
      : `${childrenCount}/${descendantCount}`;

    const padding = 8;
    const height = 24;
    const minWidth = 40;

    // Create temporary text to measure width
    const tempText = group.append('text')
      .style('font-size', '12px')
      .text(text);
    const textWidth = (tempText.node() as SVGTextElement).getComputedTextLength();
    tempText.remove();

    const width = Math.max(minWidth, textWidth + padding * 2);

    // Background pill
    group.append('rect')
      .attr('x', -width / 2)
      .attr('y', -height / 2)
      .attr('width', width)
      .attr('height', height)
      .attr('rx', height / 2)
      .attr('ry', height / 2)
      .style('fill', DEFAULT_CONFIG.countDisplay.background)
      .style('stroke', this.config.styles.normal.stroke)
      .style('stroke-width', 1);

    // Count text
    group.append('text')
      .attr('x', 0)
      .attr('y', 0)
      .attr('dy', '0.35em')
      .style('text-anchor', 'middle')
      .style('font-size', '12px')
      .style('fill', DEFAULT_CONFIG.countDisplay.textColor)
      .text(text);
  }

  render(container: SVGGElement, control: TaskControl): void {
    if (control.state === 'hidden') {
      logger.debug('Skipping render for hidden control', { 
        taskId: control.id,
        state: control.state 
      }, 'svg-controls rendering');
      return;
    }
    
    try {
      logger.debug('Starting SVG control render', { 
        taskId: control.id,
        state: control.state,
        type: control.type
      }, 'svg-controls rendering');

      const group = select(container);
      const buttonSize = this.config.iconSize + this.config.iconPadding * 2;
      
      // Apply initial opacity based on task state
      if (control.state === 'semi-transparent') {
        group.style('opacity', 0.25);
      }
        
      // Ensure control is visible
      group.style('visibility', 'visible');

      // Create button background
      const button = group.append('g')
        .attr('class', `${control.type}-button`)
        .style('cursor', 'pointer')
        .style('pointer-events', 'all');

      // Add split handler only if not a counter display
      const isCounterDisplay = control.childrenCount && control.childrenCount > 0;
      
      if (!isCounterDisplay) {
        button.on('click', async (event) => {
          // Only handle clicks on split buttons
          const target = event.target as SVGElement;
          const targetClassList = target.classList;
          
          // Skip if clicked element is part of counter display
          if (targetClassList.contains('task-counter-display') || 
              target.closest('.task-counter-display') ||
              target.closest('.project-counter') ||
              target.parentElement?.getAttribute('data-project-counter') === 'true') {
            logger.debug('Ignoring click on counter display', {
              controlId: control.id,
              targetClass: targetClassList.toString()
            }, 'svg-controls interaction');
            return;
          }

          event.stopPropagation();
          event.preventDefault();

          if (this.loadingControls.has(control.id)) {
            logger.debug('Ignoring click - control already in loading state', { 
              controlId: control.id 
            }, 'svg-controls interaction');
            return;
          }

          try {
            logger.debug(`Starting ${control.type} operation`, { 
              controlId: control.id,
              state: control.state
            }, 'svg-controls interaction');
            
            this.setLoading(control.id, true);
            
            // Emit event based on control type
            this.eventEmitter.emit({
              taskId: control.id,
              type: control.type,
              data: {
                state: control.state,
                position: control.position
              }
            });
            
            // Handle the action based on control type
            if (control.type === 'split' && this.handlers.split) {
              await this.handlers.split({
                type: 'split',
                elementId: control.id,
                position: control.position
              });
            } 
            else if (control.type === 'regenerate' && this.handlers.regenerate) {
              await this.handlers.regenerate({
                type: 'regenerate',
                elementId: control.id,
                position: control.position
              });
            }
            else if (control.type === 'delete' && this.handlers.delete) {
              await this.handlers.delete({
                type: 'delete',
                elementId: control.id,
                position: control.position
              });
            }
            
            // Emit completion event
            this.eventEmitter.emit({
              taskId: control.id,
              type: `${control.type}Complete` as TaskEventType, // Type assertion
              data: {
                state: control.state,
                position: control.position
              }
            });
            
          } catch (error) {
            logger.error(`${control.type} operation failed`, { taskId: control.id, error }, 'svg-controls error');
            
            // Emit error event
            this.eventEmitter.emit({
              taskId: control.id,
              type: 'error',
              data: { error: String(error) }
            });
            
          } finally {
            this.setLoading(control.id, false);
          }
        });
      }

      // Add invisible click target
      button.append('circle')
        .attr('r', buttonSize / 2)
        .style('fill', 'transparent')
        .style('pointer-events', 'all')
        .on('mouseover', () => {
          button.select('.button-bg').style('fill', this.config.styles.hover.fill);
        })
        .on('mouseout', () => {
          button.select('.button-bg').style('fill', this.config.styles.normal.fill);
        });

      // Add visible button background
      button.append('circle')
        .attr('class', 'button-bg')
        .attr('r', buttonSize / 2)
        .style('fill', this.config.styles.normal.fill)
        .style('stroke', this.config.styles.normal.stroke)
        .style('stroke-width', 1);

      // Render either counter display or control button
      if (control.childrenCount && control.childrenCount > 0) {
        // For tasks with children, render counter display only
        button.classed('task-counter-display', true)
             .style('pointer-events', 'none')
             .style('cursor', 'default');
        this.renderCountDisplay(button, control.childrenCount, control.descendantCount || 0);
      } else {
        // For tasks without children, render appropriate control
        if (this.loadingControls.has(control.id)) {
          this.renderLoadingSpinner(button);
        } else {
          // Render different icon based on control type
          switch (control.type) {
            case 'split':
              this.renderSplitIcon(button);
              break;
            case 'regenerate':
              this.renderRegenerateIcon(button);
              break;
            case 'delete':
              this.renderDeleteIcon(button);
              break;
            default:
              // Default to split icon
              this.renderSplitIcon(button);
          }
        }
      }

      logger.debug('SVG control render completed', { 
        taskId: control.id,
        state: control.state,
        type: control.type
      }, 'svg-controls rendering');
    } catch (error) {
      logger.error('Failed to render SVG control', { taskId: control.id, error }, 'svg-controls error');
    }
  }

  setLoading(controlId: string, isLoading: boolean): void {
    try {
      logger.debug('Setting control loading state', { 
        controlId, 
        isLoading,
        currentLoadingControls: Array.from(this.loadingControls)
      }, 'svg-controls state');
      
      if (isLoading) {
        this.loadingControls.add(controlId);
      } else {
        this.loadingControls.delete(controlId);
      }

      // Update control visual state
      const controlGroup = select(`.task-control-${controlId}`);
      if (!controlGroup.empty()) {
        const container = controlGroup.node();
        if (container) {
          // Clear existing content
          controlGroup.selectAll('*').remove();
          // Re-render with new state
          this.render(container as SVGGElement, {
            id: controlId,
            type: 'split',
            state: 'active',
            position: { x: 0, y: 0 }
          });
        }
      }
    } catch (error) {
      logger.error('Failed to update loading state', { controlId, error }, 'svg-controls error');
    }
  }

  dispose(): void {
    this.loadingControls.clear();
  }
}
