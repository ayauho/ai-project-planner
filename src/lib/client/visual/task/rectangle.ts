'use client';

import { select } from 'd3-selection';
import { transition } from 'd3-transition';
import { logger } from '@/lib/client/logger';
import type { TaskConfig } from './types';
import type { TaskRect } from './rect-type';
import { DEFAULT_TASK_CONFIG } from './constants';
import { createClipPaths } from './components/clip-paths';
import { renderBackground } from './components/background';
import { renderTaskTexts } from './components/task-text';
import { createExpandButton } from './components/expand-button';
import { TaskEventEmitter } from './events';
import { svgOrderManager } from '../utils/svg-order';
import { overlapDetector } from '@/components/workspace/visual/utils/overlap-detector';
import { animationManager } from '../utils/animation';

interface TaskMetrics {
  titleHasMore: boolean;
  descHasMore?: boolean;
  fullMetrics?: {
    lines: number;
  };
}

/**
 * Interface for task text metrics returned by getTaskTextMetrics
 */
interface TaskTextMetrics {
  titleHasMore: boolean;
  descHasMore?: boolean;
  fullMetrics?: {
    lines: number;
  };
}

export class TaskRectangleRenderer {
  private config: TaskConfig;
  private expandedStates: Map<string, boolean>;
  private originalDimensions: Map<string, { width: number; height: number }>;
  private eventEmitter: TaskEventEmitter;

  constructor(config: Partial<TaskConfig>= {}) {
    this.config = {
      ...DEFAULT_TASK_CONFIG,
      ...config
    };
    this.expandedStates = new Map();
    this.originalDimensions = new Map();
    this.eventEmitter = TaskEventEmitter.getInstance();
  }

  render(
    container: SVGGElement | null, 
    task: TaskRect, 
    options: { animate?: boolean } = {}
  ): SVGGElement | null {
    if (!container) return null;

    const isExpanded = this.expandedStates.get(task.id) || false;
    const shouldAnimate = options.animate ?? false;
    
    try {
      const selection = select(container);
      const group = selection.append('g')
        .attr('id', `task-${task.id}`)
        .attr('class', 'task-group')
        .attr('transform', `translate(${task.position.x},${task.position.y})`)
        .attr('data-state', task.state || 'active');

      // Apply initial opacity based on state and animation requirements
      if (shouldAnimate) {
        // For animation, start at opacity 0
        group.style('opacity', 0);
      } else {
        // For non-animated rendering, set opacity directly based on state
        if (task.state === 'semi-transparent') {
          group.style('opacity', 0.5);
        } else if (task.state === 'hidden') {
          group.style('opacity', 0).style('visibility', 'hidden');
        } else {
          group.style('opacity', 1);
        }
      }
        
      // Calculate the hierarchy level based on task parentage
      const level = svgOrderManager.calculateTaskLevel(task.parentId);
      
      // Add data-level attribute
      group.attr('data-level', level.toString());
      
      // Register with order manager for proper stacking
      svgOrderManager.registerElement(`task-${task.id}`, group.node() as SVGElement, level);
      
      // Register with overlap detector for control visibility checking
      overlapDetector.registerRectangle(`task-${task.id}`, {
        x: task.position.x,
        y: task.position.y,
        width: task.dimensions.width,
        height: task.dimensions.height
      }, level);

      // Use destructuring with rename for the unused variable
      const { clipId, titleClipId: _titleClipId } = createClipPaths(group, task, this.config);
      const mainGroup = group.append('g').attr('clip-path', `url(#${clipId})`);

      renderBackground(mainGroup, task, this.config);
      const metrics = renderTaskTexts(mainGroup, task, this.config, isExpanded) as TaskMetrics;

      // Calculate lines with safe defaults
      const lines = metrics?.fullMetrics?.lines ?? 0;

      // Calculate height based on content
      const contentHeight = isExpanded ? 
        this.config.titleAreaHeight + 
        this.config.titleMarginBottom + 
        (this.config.text.description.size * (this.config.text.description.lineHeight || 1.2) * lines) +
        (this.config.padding.y * 3) :
        task.dimensions.height;

      // Update heights
      mainGroup.select('rect').attr('height', contentHeight);
      group.select(`#${clipId} rect`).attr('height', contentHeight);

      // Create a transparent overlay for the entire task that handles clicks
      mainGroup.append('rect')
        .attr('width', task.dimensions.width)
        .attr('height', contentHeight)
        .attr('fill', 'transparent')
        .attr('class', 'clickable-overlay')
        .style('pointer-events', 'all')
        .style('cursor', 'pointer')
        .on('click', (event) => {
          // Prevent click from reaching "show more" button or other controls
          if ((event.target as Element).closest('.expand-button, .split-button')) {
            return;
          }
          
          // Stop propagation and prevent default
          event.stopPropagation();
          event.preventDefault();
          
          // Set a flag on the document to indicate this is a direct user click
          // This helps prevent duplicate centering operations
          document.body.setAttribute('data-direct-click-in-progress', task.id);
          
          logger.info('[TASK RECT] Direct click on task rectangle', { 
            taskId: task.id,
            rect: {
              x: task.position.x,
              y: task.position.y,
              width: task.dimensions.width,
              height: contentHeight
            },
            directClick: true,
            _style: 'background-color: #00BCD4; color: white; padding: 2px 5px; border-radius: 3px;'
          }, 'task-rectangle interaction user-click');
          
          // Handle the task selection directly without going through the event system
          // This prevents duplicate centering operations
          import('@/components/workspace/visual/task-hierarchy/state-coordinator')
            .then(({ taskStateCoordinator }) => {
              // Call state coordinator with directClick flag to ensure only one centering occurs
              taskStateCoordinator.handleTaskSelection(
                task.id, 
                {
                  x: task.position.x,
                  y: task.position.y,
                  width: task.dimensions.width,
                  height: contentHeight
                } as DOMRect,
                { directClick: true }
              );
              
              // Clear the direct click flag after a short delay
              setTimeout(() => {
                document.body.removeAttribute('data-direct-click-in-progress');
              }, 50);
            })
            .catch(error => {
              logger.error('Failed to import state coordinator', { error }, 'task-rectangle interaction error');
              
              // Clear the direct click flag on error
              document.body.removeAttribute('data-direct-click-in-progress');
              
              // Fallback to event-based approach if import fails
              this.eventEmitter.emit({
                taskId: task.id,
                type: 'stateChange',
                data: {
                  state: 'selected',
                  rect: {
                    x: task.position.x,
                    y: task.position.y,
                    width: task.dimensions.width,
                    height: contentHeight
                  },
                  directClick: true
                }
              });
            });
          // Also emit event to animate connections to this task's children
          setTimeout(() => {
            this.eventEmitter.emit({
              taskId: task.id,
              type: 'reanimateConnection'
            });
          }, 300); // Give the state change time to propagate
        });

      if (task.text.description && lines > 4) {
        const margin = 5;
        const buttonSize = this.config.button.size;

        // Position button at bottom right
        const buttonX = task.dimensions.width - buttonSize - margin;
        const buttonY = contentHeight - buttonSize - margin;

        const buttonGroup = mainGroup.append('g')
          .attr('class', 'expand-button')
          .attr('transform', `translate(${buttonX},${buttonY})`);

        // Create transparent clickable area
        buttonGroup.append('rect')
          .attr('width', buttonSize)
          .attr('height', buttonSize)
          .attr('fill', 'transparent')
          .style('pointer-events', 'all')
          .on('click', (event) => {
            event.stopPropagation();
            this.toggleExpand(container, task);
          });

        createExpandButton(
          buttonGroup,
          this.config.button,
          isExpanded,
          contentHeight,
          buttonSize,
          () => this.toggleExpand(container, task)
        );
      }

      // Store content height for future reference
      group.attr('data-content-height', contentHeight);

      // Emit height change event
      this.eventEmitter.emit({
        taskId: task.id,
        type: isExpanded ? 'expand' : 'collapse',
        height: contentHeight,
        data: {
          rect: {
            x: task.position.x,
            y: task.position.y,
            width: task.dimensions.width,
            height: contentHeight
          }
        }
      });

      // Animation if needed
      if (shouldAnimate) {
        // Use animation manager to fade in the task with appropriate delay based on state
        let duration = 300;
        let delay = 200; // Default delay for normal animations
        
        // For state-specific animations, adjust delay to create sequence
        if (task.state === 'active') {
          // Active tasks appear first
          delay = 200;
        } else if (task.state === 'semi-transparent') {
          // Semi-transparent tasks appear a bit later
          delay = 300;
        }
        
        // Ancestor tasks (parent chain) should have slightly longer animation
        if (task.isPartOfChain) {
          duration = 400;
        }
        
        animationManager.fadeIn(group.node() as SVGElement, { 
          duration: duration,
          delay: delay
        }).then(() => {
          // After fade in, ensure visibility is set correctly for hidden tasks
          if (task.state === 'hidden') {
            group.style('visibility', 'hidden');
          }
          
          // Emit event to coordinate arrow animations if this is an active task
          if (task.state === 'active' && !task.isPartOfChain) {
            this.eventEmitter.emit({
              taskId: task.id,
              type: 'animateConnection',
              data: {
                state: task.state,
                rect: {
                  x: task.position.x,
                  y: task.position.y,
                  width: task.dimensions.width,
                  height: task.dimensions.height
                }
              }
            });
          }
        });
      }

      return group.node() as SVGGElement;
    } catch (error) {
      logger.error('Failed to render task rectangle', {
        taskId: task.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'task-rectangle rendering error');
      throw error;
    }
  }

  // Keep this method for internal use by toggleExpand, but without the click handler referencing it
  private bringToFront(container: SVGGElement | null, taskId: string): void {
    if (!container) return;
    
    try {
      const group = select(container).select(`#task-${taskId}`);
      if (!group.empty()) {
        // Move to end of parent to bring to front in SVG
        const node = group.node();
        if (node instanceof SVGElement && node.parentNode) {
          node.parentNode.appendChild(node);
          logger.debug('Task brought to front', { taskId }, 'task-rectangle ordering');
          // Update overlap detection
          svgOrderManager.applyOrder();
        }
      }
    } catch (error) {
      logger.error('Failed to bring task to front', { taskId, error }, 'task-rectangle ordering error');
    }
  }

  private toggleExpand(container: SVGGElement | null, task: TaskRect): void {
    if (!container) return;

    try {
      const existingGroup = select(container).select(`#task-${task.id}`);
      const existingTransform = existingGroup.attr('transform');
      
      // Get current expansion state
      const wasExpanded = this.expandedStates.get(task.id) || false;
      
      // Store original dimensions when first expanding
      if (!wasExpanded && !this.originalDimensions.has(task.id)) {
        this.originalDimensions.set(task.id, {
          width: task.dimensions.width,
          height: task.dimensions.height
        });
        
        logger.debug('Storing original dimensions for task', {
          taskId: task.id,
          width: task.dimensions.width,
          height: task.dimensions.height
        }, 'task-rectangle expansion');
      }
      
      // Log expansion action for debugging
      logger.debug('Toggling task expansion', {
        taskId: task.id,
        wasExpanded,
        willBeExpanded: !wasExpanded
      }, 'task-rectangle expansion');
      
      // Remove existing group
      existingGroup.remove();
      
      // Toggle expansion state
      this.expandedStates.set(task.id, !wasExpanded);
      
      let newTask: TaskRect;
      
      if (wasExpanded) {
        // COLLAPSING: Restore original dimensions exactly
        const originalDims = this.originalDimensions.get(task.id);
        
        if (originalDims) {
          // Use the exact original dimensions for collapsing
          newTask = {
            ...task,
            dimensions: {
              width: originalDims.width,
              height: originalDims.height
            }
          };
          
          logger.debug('Collapsing task with original dimensions', {
            taskId: task.id,
            originalWidth: originalDims.width,
            originalHeight: originalDims.height
          }, 'task-rectangle expansion collapse');
        } else {
          // Fallback if original dimensions not found
          newTask = task;
        }
      } else {
        // EXPANDING: Calculate expanded height with extra padding
        // Get metrics for text content
        const metrics = this.getTaskTextMetrics(task, true);
        const lines = metrics?.fullMetrics?.lines ?? 10; // Default to 10 lines if calculation fails
        
        // Calculate a generous expanded height
        // Adding extra bottom padding (20px) to ensure all content is visible
        const expandedHeight = Math.max(
          this.config.expandedHeight,
          this.config.titleAreaHeight + 
          this.config.titleMarginBottom + 
          (this.config.text.description.size * (this.config.text.description.lineHeight || 1.2) * lines) +
          (this.config.padding.y * 4) + 40
        );
        
        newTask = {
          ...task,
          dimensions: {
            ...task.dimensions,
            height: expandedHeight
          }
        };
        
        logger.debug('Expanding task with calculated dimensions', {
          taskId: task.id,
          originalHeight: task.dimensions.height,
          calculatedExpandedHeight: expandedHeight,
          textLines: lines
        }, 'task-rectangle expansion expand');
      }
      
      // Render with the updated dimensions
      const newGroup = this.render(container, newTask);
      
      if (newGroup) {
        // Apply the original transform to keep the task in the same position
        select(newGroup).attr('transform', existingTransform);
        
        // Update clip path height explicitly
        const clipId = `clip-${task.id}`;
        const clipRect = select(newGroup).select(`defs #${clipId} rect`);
        
        if (!clipRect.empty()) {
          // Add extra clip path height (50px) to ensure no content is cut off
          const clipHeight = wasExpanded
            ? newTask.dimensions.height // Original height for collapsed state
            : newTask.dimensions.height + 50; // Extra padding for expanded state
          
          clipRect.attr('height', clipHeight);
          
          logger.debug('Updated clip path height for task', {
            taskId: task.id, 
            newClipHeight: clipHeight,
            isExpanded: !wasExpanded
          }, 'task-rectangle expansion clip-path');
        }
        
        // Bring to front when expanding
        if (!wasExpanded) {
          this.bringToFront(container, task.id);
        }
        
        // Update overlap detector with new dimensions
        overlapDetector.updateRectangleBounds(`task-${task.id}`, {
          x: task.position.x,
          y: task.position.y,
          width: newTask.dimensions.width,
          height: newTask.dimensions.height
        });
        
        // For collapsed state, explicitly set the height attribute on the rectangle
        if (wasExpanded) {
          const rect = select(newGroup).select('rect');
          if (!rect.empty()) {
            rect.attr('height', newTask.dimensions.height);
          }
        }
      }
    } catch (error) {
      logger.error('Failed to toggle expansion', {
        taskId: task.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'task-rectangle expansion error');
      throw error;
    }
  }

  /**
   * Helper method to get text metrics without rendering
   * This allows us to calculate expanded height before rendering
   */
  private getTaskTextMetrics(task: TaskRect, isExpanded: boolean): TaskTextMetrics {
    try {
      // We need at least task description to calculate metrics
      if (!task.text.description) return { titleHasMore: false };
      
      // Create a temporary SVG to calculate text metrics
      const tempSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      tempSvg.style.position = "absolute";
      tempSvg.style.visibility = "hidden";
      tempSvg.style.pointerEvents = "none";
      document.body.appendChild(tempSvg);
      
      const selection = select(tempSvg);
      const tempText = selection.append('text')
        .style('font-family', this.config.text.description.font)
        .style('font-size', `${this.config.text.description.size}px`)
        .style('font-weight', this.config.text.description.weight);
      
      // Calculate how many lines the text would take
      let lines = 0;
      const words = task.text.description.trim().split(/\s+/);
      let line = [];
      let lineWidth = 0;
      const maxWidth = task.dimensions.width - (this.config.padding.x * 2);
      
      // Simple line break calculation
      for (const word of words) {
        tempText.text(word);
        const wordWidth = (tempText.node() as SVGTextElement).getComputedTextLength();
        
        if (lineWidth + wordWidth > maxWidth) {
          lines++;
          line = [word];
          lineWidth = wordWidth;
        } else {
          line.push(word);
          lineWidth += wordWidth + 4; // Add space between words
        }
      }
      
      // Add the last line
      if (line.length > 0) {
        lines++;
      }
      
      // Add extra lines to account for word wrapping uncertainties
      lines += 2;
      
      // Clean up
      document.body.removeChild(tempSvg);
      
      return {
        titleHasMore: false,
        descHasMore: isExpanded ? false : lines > 4,
        fullMetrics: { lines }
      };
    } catch (error) {
      logger.error('Failed to calculate task text metrics', {
        taskId: task.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'task-rectangle text-metrics error');
      return { titleHasMore: false, fullMetrics: { lines: 15 } }; // Default to more lines
    }
  }
  
  /**
   * Clear all expansion states
   * This is useful when creating new projects to ensure clean state
   */
  public clearExpansionStates(): void {
    this.expandedStates.clear();
    this.originalDimensions.clear();
    logger.debug('Cleared all task expansion states', {}, 'task-rectangle expansion-reset');
  }

  updateState(container: SVGGElement | null, taskId: string, newState: 'active' | 'semi-transparent' | 'hidden'): void {
    if (!container) return;

    logger.debug('Updating task state', { taskId, newState }, 'task-rectangle state-update');
    try {
      const group = select(container).select(`#task-${taskId}`);
      
      if (group.empty()) {
        throw new Error('Task element not found');
      }

      const rect = group.select('rect');
      
      // Store the previous state for transition
      const previousState = group.attr('data-state') || 'active';
      
      // Emit event that state change is starting
      this.eventEmitter.emit({
        taskId,
        type: 'stateChange',
        data: {
          previousState,
          newState,
          isStarting: true
        }
      });
      
      // Set new state attribute
      group.attr('data-state', newState);
      
      // Skip animation if going from hidden to hidden
      if (previousState === 'hidden' && newState === 'hidden') {
        return;
      }
      
      // Apply appropriate animation duration - faster for tasks appearing/disappearing
      const duration = newState === 'hidden' || previousState === 'hidden' ? 200 : 300;
      
      if (!rect.empty()) {
        const t = transition().duration(duration);
        const styles = this.config.styles[newState];

        rect.transition(t)
          .style('fill', styles.fill)
          .style('stroke', styles.stroke)
          .style('stroke-width', styles.strokeWidth);
        
        // Transition to new opacity
        const targetOpacity = newState === 'semi-transparent' ? 0.5 : newState === 'hidden' ? 0 : 1;
        
        group.transition(t)
          .style('opacity', targetOpacity)
          .on('end', () => {
            // After transition completes, update visibility for hidden state
            if (newState === 'hidden') {
              group.style('visibility', 'hidden');
            } else {
              group.style('visibility', 'visible');
            }
            
            // Emit event that state change is complete
            this.eventEmitter.emit({
              taskId,
              type: 'stateChange',
              data: {
                previousState,
                newState,
                isComplete: true
              }
            });
            
            // If transitioning to active state, also trigger animation of connections
            if (newState === 'active' && previousState !== 'active') {
              setTimeout(() => {
                this.eventEmitter.emit({
                  taskId,
                  type: 'reanimateConnection'
                });
              }, 100);
            }
          });
      }
    } catch (error) {
      logger.error('Failed to update task state', {
        taskId, 
        newState,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'task-rectangle state-update error');
      throw error;
    }
  }
}
