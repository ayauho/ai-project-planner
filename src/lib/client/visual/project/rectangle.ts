'use client';

import { select, Selection } from 'd3-selection';
import { transition } from 'd3-transition';
import { logger } from '@/lib/client/logger';
import type { TaskConfig } from '../task/types';
import type { TaskRect } from '../task/rect-type';
import { createClipPaths } from '../task/components/clip-paths';
import { renderBackground } from '../task/components/background';
import { renderTaskTexts } from '../task/components/task-text';
import { PROJECT_TASK_CONFIG, PROJECT_COUNT_DISPLAY } from './constants';
import { svgOrderManager, HierarchyLevel } from '../utils/svg-order';
import { overlapDetector } from '@/components/workspace/visual/utils/overlap-detector';
import { animationManager } from '../utils/animation';
import { TaskEventEmitter } from '../task/events';
import { emitDirectSelectionEvent } from '../utils/centering';
import { TaskVisualState } from '@/lib/workspace/state/types';

export class ProjectRectangleRenderer {
  private config: TaskConfig;
  private eventEmitter: TaskEventEmitter;

  constructor(config: TaskConfig) {
    this.config = config;
    this.eventEmitter = TaskEventEmitter.getInstance();
  }

  render(
    container: SVGGElement | null, 
    project: TaskRect, 
    options: { animate?: boolean } = {}
  ): SVGGElement | null {
    if (!container) return null;

    const shouldAnimate = options.animate ?? false;

    try {
      logger.debug('Rendering project rectangle', {
        projectId: project.id,
        childrenCount: project.childrenCount,
        descendantCount: project.descendantCount,
        animate: shouldAnimate
      }, 'project-rectangle rendering');

      const selection = select(container);
      const group = selection.append('g')
        .attr('id', `project-${project.id}`)
        .attr('class', 'project-group')
        .attr('transform', `translate(${project.position.x},${project.position.y})`)
        .attr('data-level', HierarchyLevel.PROJECT.toString())
        .attr('data-state', project.state || 'active');

      // Apply initial opacity based on state and animation requirements
      if (shouldAnimate) {
        // For animation, start at opacity 0
        group.style('opacity', 0);
      } else {
        // For non-animated rendering, set opacity directly based on state
        if (project.state === 'semi-transparent') {
          group.style('opacity', 1);  // Adjusted from 0.5 to 1
        } else if (project.state === 'hidden') {
          group.style('opacity', 0).style('visibility', 'hidden');
        } else if (typeof project.state === 'string' && project.state.startsWith('opacity-')) {
          // Extract custom opacity value
          const opacityStr = project.state.replace('opacity-', '');
          const parsedOpacity = parseFloat(opacityStr);
          
          // Apply valid opacity or default to 1
          if (!isNaN(parsedOpacity) && parsedOpacity >= 0 && parsedOpacity <= 1) {
            group.style('opacity', parsedOpacity);
            // Store the specific opacity as a data attribute
            group.attr('data-opacity', parsedOpacity.toString());
          } else {
            group.style('opacity', 1);
          }
        } else {
          group.style('opacity', 1);
        }
      }

      // Register project with the lowest z-index level
      svgOrderManager.registerElement(`project-${project.id}`, group.node() as SVGElement, HierarchyLevel.PROJECT);
      
      // Register with overlap detector
      overlapDetector.registerRectangle(`project-${project.id}`, {
        x: project.position.x,
        y: project.position.y,
        width: project.dimensions.width,
        height: project.dimensions.height
      }, HierarchyLevel.PROJECT);

      const { clipId, titleClipId: _titleClipId } = createClipPaths(group, project, this.config);
      const mainGroup = group.append('g').attr('clip-path', `url(#${clipId})`);

      // Determine which style to use based on state
      let styleKey: 'active' | 'semi-transparent' | 'hidden' = 'active';
      
      if (project.state === 'semi-transparent') {
        styleKey = 'semi-transparent';
      } else if (project.state === 'hidden') {
        styleKey = 'hidden';
      } else if (typeof project.state === 'string' && project.state.startsWith('opacity-')) {
        // Use semi-transparent styles for custom opacity states
        styleKey = 'semi-transparent';
      }
      
      // Create a modified project with a standard state for rendering
      const renderProject = {
        ...project,
        state: styleKey
      };

      renderBackground(mainGroup, renderProject, this.config);
      renderTaskTexts(mainGroup, renderProject, this.config, false);

      // Add a transparent overlay for the entire project area to handle clicks
      mainGroup.append('rect')
        .attr('width', project.dimensions.width)
        .attr('height', project.dimensions.height)
        .attr('fill', 'transparent')
        .attr('class', 'clickable-overlay')
        .style('pointer-events', 'all')
        .style('cursor', 'pointer')
        .on('click', (event) =>{
          // Skip if clicked on a control
          if ((event.target as Element).closest('.project-control')) {
            return;
          }
          
          // Prevent event from bubbling to parent elements
          event.stopPropagation();
          event.preventDefault();
          
          // Set a flag on the document to indicate this is a direct user click
          // This helps prevent duplicate centering operations
          document.body.setAttribute('data-direct-click-in-progress', project.id);
          
          logger.info('[PROJECT RECT] Direct click on project rectangle', { 
            projectId: project.id,
            rect: {
              x: project.position.x,
              y: project.position.y,
              width: project.dimensions.width,
              height: project.dimensions.height
            },
            directClick: true,
            _style: 'background-color: #3F51B5; color: white; padding: 2px 5px; border-radius: 3px;'
          }, 'project-rectangle interaction user-click');
          
          // Handle the project selection directly without going through the event system
          // This prevents duplicate centering operations
          import('@/components/workspace/visual/task-hierarchy/state-coordinator')
            .then(({ taskStateCoordinator }) => {
              // Call state coordinator with directClick flag to ensure only one centering occurs
              taskStateCoordinator.handleProjectSelection(
                project.id, 
                {
                  x: project.position.x,
                  y: project.position.y,
                  width: project.dimensions.width,
                  height: project.dimensions.height
                } as DOMRect,
                { directClick: true }
              );
              
              // Clear the direct click flag after a short delay
              setTimeout(() => {
                document.body.removeAttribute('data-direct-click-in-progress');
              }, 50);
            })
            .catch(error => {
              logger.error('Failed to import state coordinator', { error }, 'project-rectangle interaction error');
              
              // Clear the direct click flag on error
              document.body.removeAttribute('data-direct-click-in-progress');
              
              // Fallback to event-based approach if import fails
              emitDirectSelectionEvent(project.id, true, {
                x: project.position.x,
                y: project.position.y,
                width: project.dimensions.width,
                height: project.dimensions.height
              });
            });
        });

      // CRITICAL NEW APPROACH: Add counter directly in the project group
      // This ensures it will always move with the project during any transform
      if (project.childrenCount && project.childrenCount > 0) {
        this.renderProjectCounter(group, project);
      }

      // Animation if needed
      if (shouldAnimate) {
        // Use animation manager to fade in the project
        animationManager.fadeIn(group.node() as SVGElement, { duration: 300 });
      }

      // Apply ordering to ensure correct stacking
      svgOrderManager.applyOrder();

      return group.node() as SVGGElement;
    } catch (error) {
      logger.error('Failed to render project rectangle', {
        projectId: project.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'project-rectangle rendering error');
      throw error;
    }
  }
  
  /**
     * Render counter directly in project group to ensure it always moves with project
     * 
     * IMPORTANT: Counter must be positioned at the BOTTOM CENTER of the project rectangle
     */
  private renderProjectCounter(group: Selection<SVGGElement, unknown, null, undefined>, project: TaskRect): void {
    try {
      // Skip if project has no children
      if (!project.childrenCount || project.childrenCount <= 0) {
        return;
      }
      
      // Set text content
      const text = project.childrenCount === project.descendantCount
        ? `${project.childrenCount}`
        : `${project.childrenCount}/${project.descendantCount}`;
      
      // Calculate dimensions
      const padding = PROJECT_COUNT_DISPLAY.padding;
      const height = PROJECT_COUNT_DISPLAY.height;
      const minWidth = PROJECT_COUNT_DISPLAY.minWidth;
      
      // Measure text width
      const tempText = group.append('text')
        .style('font-size', `${PROJECT_COUNT_DISPLAY.fontSize}px`)
        .text(text);
      const textWidth = (tempText.node() as SVGTextElement).getComputedTextLength();
      tempText.remove();
      
      const width = Math.max(minWidth, textWidth + padding * 2);
      
      // Get exact center coordinates - critical for proper positioning
      const centerX = project.dimensions.width / 2;
      const bottomY = project.dimensions.height;
      
      // Create counter group directly within main group - no intermediate container
      const counterGroup = group.append('g')
        .attr('class', `project-counter project-counter-${project.id} embedded-counter bottom-counter`)
        .attr('data-project-counter', 'true')
        .attr('data-id', `project-counter-${project.id}`)
        .attr('data-project-id', project.id)
        .attr('data-state', project.state || 'active') // Store state for styling
        // EXPLICIT exact positioning at bottom center
        .attr('transform', `translate(${centerX}, ${bottomY})`)
        .style('pointer-events', 'none');
      
      // Determine styling based on project state
      const borderColor = project.state === 'semi-transparent' ? 
                          '#94a3b8' : // Grey for semi-transparent
                          '#2563eb';  // Blue for active
                          
      const borderWidth = project.state === 'semi-transparent' ? 
                          1 : // Thinner for semi-transparent
                          2;  // Normal for active
                          
      // Add counter background - precisely centered at the anchor point
      counterGroup.append('rect')
        .attr('x', -width / 2)  // Center horizontally
        .attr('y', -height / 2) // Center vertically
        .attr('width', width)
        .attr('height', height)
        .attr('rx', PROJECT_COUNT_DISPLAY.borderRadius)
        .attr('ry', PROJECT_COUNT_DISPLAY.borderRadius)
        .attr('class', 'counter-background')
        .style('fill', PROJECT_COUNT_DISPLAY.background)
        .style('stroke', borderColor) // Dynamic based on state
        .style('stroke-width', borderWidth); // Dynamic based on state
      
      // Add counter text - precisely centered in the rect
      counterGroup.append('text')
        .attr('x', 0) // Exactly centered horizontally
        .attr('y', 0) // Base position at vertical center
        .attr('dy', '0.1em') // Fine-tune vertical positioning
        .attr('class', 'counter-text')
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .attr('alignment-baseline', 'middle')
        .style('font-size', `${PROJECT_COUNT_DISPLAY.fontSize}px`)
        .style('fill', PROJECT_COUNT_DISPLAY.textColor)
        .style('font-family', 'system-ui, sans-serif')
        .style('alignment-baseline', 'middle')
        .style('vertical-align', 'middle')
        .text(text);
      
      logger.info('Rendered project counter at precise bottom center', {
        projectId: project.id,
        position: { x: centerX, y: bottomY },
        state: project.state || 'active',
        styling: { borderColor, borderWidth },
        dimensions: { width, height },
        childrenCount: project.childrenCount,
        descendantCount: project.descendantCount
      }, 'project-rectangle counter-rendering');
    } catch (error) {
      logger.error('Failed to render project counter', {
        projectId: project.id,
        error: error instanceof Error ? error.message : String(error)
      }, 'project-rectangle counter-rendering error');
    }
  }

  updateState(container: SVGGElement | null, projectId: string, newState: TaskVisualState): void {
    if (!container) return;

    logger.debug('Updating project state', { projectId, newState }, 'project-rectangle state-update');
    try {
      const group = select(container).select(`#project-${projectId}`);
      
      if (group.empty()) {
        throw new Error('Project element not found');
      }

      // Store the previous state for transition
      const previousState = group.attr('data-state') || 'active';
      
      // Set new state attribute
      group.attr('data-state', newState);
      
      // Skip animation if going from hidden to hidden
      if (previousState === 'hidden' && newState === 'hidden') {
        return;
      }
      
      const rect = group.select('rect');
      if (!rect.empty()) {
        const duration = 300; // Consistent animation duration
        const t = transition().duration(duration);
        
        // Determine which style to use based on state
        let styleKey: 'active' | 'semi-transparent' | 'hidden' = 'active';
        
        if (newState === 'semi-transparent') {
          styleKey = 'semi-transparent';
        } else if (newState === 'hidden') {
          styleKey = 'hidden';
        } else if (typeof newState === 'string' && newState.startsWith('opacity-')) {
          // Use semi-transparent styles for custom opacity states
          styleKey = 'semi-transparent';
        }
        
        const styles = this.config.styles[styleKey];

        rect.transition(t)
          .style('fill', styles.fill)
          .style('stroke', styles.stroke)
          .style('stroke-width', styles.strokeWidth);
        
        // Calculate target opacity based on state
        let targetOpacity = 1.0; // Default full opacity
        
        if (newState === 'semi-transparent') {
          targetOpacity = 1.0; // Project uses 1.0 even for semi-transparent state
        } else if (newState === 'hidden') {
          targetOpacity = 0;
        } else if (typeof newState === 'string' && newState.startsWith('opacity-')) {
          // Extract custom opacity value from state name
          const opacityStr = newState.replace('opacity-', '');
          const parsedOpacity = parseFloat(opacityStr);
          
          // Validate opacity value
          if (!isNaN(parsedOpacity) && parsedOpacity >= 0 && parsedOpacity <= 1) {
            targetOpacity = parsedOpacity;
            
            // Store the specific opacity as a data attribute
            group.attr('data-opacity', targetOpacity.toString());
            
            logger.debug('Applied custom opacity to project', {
              projectId,
              opacity: targetOpacity,
              state: newState
            }, 'project-rectangle state-update');
          }
        }
        
        // Apply the opacity to the whole group for consistency
        group.transition(t)
          .style('opacity', targetOpacity)
          .on('end', () =>{
            // After transition completes, update visibility for hidden state
            if (newState === 'hidden') {
              group.style('visibility', 'hidden');
            } else {
              group.style('visibility', 'visible');
              
              // Make sure the embedded counter is visible
              const counter = group.select('.embedded-counter');
              if (!counter.empty()) {
                counter.style('visibility', 'visible');
                counter.style('opacity', '1');
              }
            }
          });
      }
      
      // Update embedded counter immediately for state changes
      const counter = group.select('.embedded-counter');
      if (!counter.empty()) {
        // Update counter state data attribute
        counter.attr('data-state', newState);
        
        // Update counter appearance based on state
        const counterRect = counter.select('rect');
        if (!counterRect.empty()) {
          let borderColor = '#2563eb'; // Default blue for active
          let borderWidth = 2; // Default width for active
          
          // Determine styling based on state
          if (newState === 'semi-transparent') {
            borderColor = '#94a3b8'; // Grey for semi-transparent
            borderWidth = 1; // Thinner for semi-transparent
          } else if (typeof newState === 'string' && newState.startsWith('opacity-')) {
            // For custom opacity states, use semi-transparent styling
            borderColor = '#94a3b8'; // Grey for semi-transparent states
            borderWidth = 1; // Thinner for semi-transparent states
          }
          
          // Animate the counter style changes
          counterRect.transition()
            .duration(300)
            .style('stroke', borderColor)
            .style('stroke-width', borderWidth);
        }
        
        // Always keep counter visible
        counter.style('visibility', 'visible');
        
        // For semi-transparent state, adjust opacity slightly
        if (newState === 'semi-transparent') {
          counter.style('opacity', '0.9');
        } else if (newState === 'active') {
          counter.style('opacity', '1');
        } else if (newState === 'hidden') {
          // Hide counter only when project is hidden
          counter.style('visibility', 'hidden');
          counter.style('opacity', '0');
        } else if (typeof newState === 'string' && newState.startsWith('opacity-')) {
          // For custom opacity states, extract the value
          const opacityStr = newState.replace('opacity-', '');
          const parsedOpacity = parseFloat(opacityStr);
          
          // Apply a percentage of the parsed opacity to keep counter more visible
          // Using 0.9 multiplier to ensure counter is slightly more visible than the project
          if (!isNaN(parsedOpacity) && parsedOpacity >= 0 && parsedOpacity <= 1) {
            const counterOpacity = Math.min(0.9, parsedOpacity * 1.2); // Slightly more visible
            counter.style('opacity', counterOpacity.toString());
            
            // Store the opacity value as a data attribute
            counter.attr('data-opacity', counterOpacity.toString());
          } else {
            // Fallback to semi-transparent
            counter.style('opacity', '0.9');
          }
        }
      }
    } catch (error) {
      logger.error('Failed to update project state', {
        projectId, 
        newState,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'project-rectangle state-update error');
    }
  }
}

// Export a singleton instance
export const projectRectangleRenderer = new ProjectRectangleRenderer(PROJECT_TASK_CONFIG);
