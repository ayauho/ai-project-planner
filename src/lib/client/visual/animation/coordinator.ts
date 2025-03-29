'use client';

import { logger } from '@/lib/client/logger';
import { TaskEvent, TaskEventEmitter } from '@/lib/client/visual/task/events';
import { connectionDrawer } from '@/components/workspace/visual/services/connection-drawer';
import { TaskVisualState } from '@/lib/workspace/state/types';
import { Selection } from 'd3-selection';
import { select } from 'd3-selection';
import { easeCubicOut } from 'd3-ease';

export interface AnimationSequence {
  events: TaskEvent[];
  interval?: number;
}

export interface AnimationTimings {
  fadeIn: {
    duration: number;
    delay: number;
  };
  fadeOut: {
    duration: number;
    delay: number;
  };
  stateChange: {
    duration: number;
    delay: number;
  };
  connection: {
    duration: number;
    delay: number;
  };
}

// Standard timing constants for coordinated animations
export const DEFAULT_ANIMATION_TIMINGS: AnimationTimings = {
  fadeIn: {
    duration: 300,
    delay: 100
  },
  fadeOut: {
    duration: 250,
    delay: 50
  },
  stateChange: {
    duration: 300,
    delay: 0
  },
  connection: {
    duration: 400,
    delay: 200
  }
};

class AnimationCoordinator {
  private static instance: AnimationCoordinator;
  private taskEventEmitter: TaskEventEmitter;
  private timings: AnimationTimings;

  private constructor() {
    this.taskEventEmitter = TaskEventEmitter.getInstance();
    this.timings = DEFAULT_ANIMATION_TIMINGS;
  }

  public static getInstance(): AnimationCoordinator {
    if (!AnimationCoordinator.instance) {
      AnimationCoordinator.instance = new AnimationCoordinator();
    }
    return AnimationCoordinator.instance;
  }

  /**
   * Set custom animation timings
   */
  public setTimings(timings: Partial<AnimationTimings>): void {
    this.timings = {
      ...this.timings,
      ...timings
    };
  }

  /**
   * Emit a sequence of related events with proper timing
   */
  public emitSequence(sequence: AnimationSequence): void {
    if (!sequence.events || sequence.events.length === 0) {
      logger.warn('Empty event sequence provided', {}, 'animation-coordinator sequence warning');
      return;
    }
    
    const interval = sequence.interval || 50;
    
    logger.debug('Emitting animation sequence', { 
      eventCount: sequence.events.length,
      interval,
      firstEvent: {
        type: sequence.events[0].type,
        taskId: sequence.events[0].taskId
      }
    }, 'animation-coordinator sequence emission');
    
    // Emit first event immediately
    this.taskEventEmitter.emit(sequence.events[0]);
    
    // Schedule remaining events with progressive delays
    sequence.events.slice(1).forEach((event, index) => {
      setTimeout(() => {
        this.taskEventEmitter.emit(event);
      }, (index + 1) * interval);
    });
  }

  /**
   * Create and emit state change sequence
   */
  public emitStateChangeSequence(
    taskId: string, 
    oldState: TaskVisualState,
    newState: TaskVisualState
  ): void {
    const sequence: AnimationSequence = {
      events: [
        {
          taskId,
          type: 'stateChange',
          data: {
            previousState: oldState,
            newState,
            isStarting: true
          }
        },
        {
          taskId,
          type: 'stateChange',
          data: {
            previousState: oldState,
            newState
          }
        },
        {
          taskId,
          type: 'stateChange',
          data: {
            previousState: oldState,
            newState,
            isComplete: true
          }
        }
      ],
      interval: 150
    };
    
    this.emitSequence(sequence);
  }

  /**
   * Animate an SVG element with fade in effect
   */
  public fadeInElement(
    element: SVGElement | Selection<SVGElement, unknown, null, undefined> | null,
    options: { duration?: number; delay?: number } = {}
  ): Promise<void> {
    if (!element) return Promise.resolve();

    const selection = element instanceof SVGElement ? select(element) : element;
    const duration = options.duration || this.timings.fadeIn.duration;
    const delay = options.delay || this.timings.fadeIn.delay;

    return new Promise<void>((resolve) => {
      logger.debug('Starting fade in animation', { duration, delay }, 'animation-coordinator fade-animation');
      
      selection
        .style('opacity', 0)
        .transition()
        .duration(duration)
        .delay(delay)
        .ease(easeCubicOut)
        .style('opacity', 1)
        .on('end', () => {
          resolve();
        });
    });
  }

  /**
   * Animate an SVG element with fade out effect
   */
  public fadeOutElement(
    element: SVGElement | Selection<SVGElement, unknown, null, undefined> | null,
    options: { duration?: number; delay?: number } = {}
  ): Promise<void> {
    if (!element) return Promise.resolve();

    const selection = element instanceof SVGElement ? select(element) : element;
    const duration = options.duration || this.timings.fadeOut.duration;
    const delay = options.delay || this.timings.fadeOut.delay;

    return new Promise<void>((resolve) => {
      logger.debug('Starting fade out animation', { duration, delay }, 'animation-coordinator fade-animation');
      
      selection
        .transition()
        .duration(duration)
        .delay(delay)
        .ease(easeCubicOut)
        .style('opacity', 0)
        .on('end', () => {
          // After fade out, hide element completely
          selection.style('visibility', 'hidden');
          resolve();
        });
    });
  }

  /**
   * Animate state change for an SVG element with proper opacity
   */
  public animateStateChange(
    element: SVGElement | Selection<SVGElement, unknown, null, undefined> | null | SVGGElement,
    newState: TaskVisualState,
    options: { duration?: number; delay?: number } = {}
  ): Promise<void> {
    if (!element) return Promise.resolve();

    let selection;
    if (element instanceof SVGElement) {
      selection = select(element);
    } else if ('transition' in element) {
      // It's already a d3 selection
      selection = element;
    } else {
      // Cast to SVGElement to ensure type safety
      selection = select(element as SVGElement);
    }

    const duration = options.duration || this.timings.stateChange.duration;
    const delay = options.delay || this.timings.stateChange.delay;

    return new Promise<void>((resolve) => {
      // Set target opacity based on state
      const targetOpacity = newState === 'semi-transparent' ? 0.5 : 
                           newState === 'hidden' ? 0 : 1;
      
      logger.debug('Animating state change', { 
        newState, 
        targetOpacity,
        duration, 
        delay 
      }, 'animation-coordinator state-change-animation');
      
      selection
        .transition()
        .duration(duration)
        .delay(delay)
        .ease(easeCubicOut)
        .style('opacity', targetOpacity)
        .on('end', () => {
          // After transition, update visibility for hidden state
          if (newState === 'hidden') {
            selection.style('visibility', 'hidden');
          } else {
            selection.style('visibility', 'visible');
          }
          resolve();
        });
    });
  }

  /**
   * Coordinate animations for a hierarchy change
   */
  public animateHierarchyChange(
    selectedId: string,
    activeIds: string[],
    semiTransparentIds: string[],
    hiddenIds: string[]
  ): void {
    logger.info('Coordinating hierarchy change animations', {
      selectedId,
      activeCount: activeIds.length,
      semiTransparentCount: semiTransparentIds.length,
      hiddenCount: hiddenIds.length
    }, 'animation-coordinator hierarchy-change');

    try {
      // 1. First animate fading out all hidden elements
      hiddenIds.forEach(id => {
        // Select task element
        const taskElement = select(`#task-${id}`);
        if (!taskElement.empty()) {
          // Cast the selection to the expected type
          this.animateStateChange(taskElement.node() as SVGElement, 'hidden', {
            duration: this.timings.fadeOut.duration,
            delay: this.timings.fadeOut.delay
          });
        }
      });

      // 2. After a delay, animate semi-transparent elements
      setTimeout(() => {
        semiTransparentIds.forEach(id => {
          const taskElement = select(`#task-${id}`);
          if (!taskElement.empty()) {
            // Cast the selection to the expected type
            this.animateStateChange(taskElement.node() as SVGElement, 'semi-transparent', {
              duration: this.timings.stateChange.duration,
              delay: 0 // No additional delay needed here
            });
          }
        });
      }, this.timings.fadeOut.duration + 50);

      // 3. Finally animate active elements and their connections
      setTimeout(() => {
        activeIds.forEach(id => {
          const taskElement = select(`#task-${id}`);
          if (!taskElement.empty()) {
            // Cast the selection to the expected type
            this.animateStateChange(taskElement.node() as SVGElement, 'active', {
              duration: this.timings.fadeIn.duration,
              delay: 0 // No additional delay needed here
            });
          }
        });

        // Animate connections for selected element
        const connectionsLayer = select('.layer-connections');
        if (!connectionsLayer.empty()) {
          // Use node method to get the actual DOM element and then cast it
          const connectionsNode = connectionsLayer.node();
          if (connectionsNode) {
            connectionDrawer.reanimateConnections(select(connectionsNode as SVGGElement), selectedId);
          }
        }
      }, this.timings.fadeOut.duration + this.timings.stateChange.duration + 100);
    } catch (error) {
      logger.error('Failed to coordinate hierarchy change animations', { error }, 'animation-coordinator hierarchy-change error');
    }
  }
}

export const animationCoordinator = AnimationCoordinator.getInstance();
