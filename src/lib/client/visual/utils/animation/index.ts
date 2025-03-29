'use client';

import { select, Selection } from 'd3-selection';
import { easeCubicOut, easeCubicInOut } from 'd3-ease';
import { logger } from '@/lib/client/logger';
import { Rectangle } from '@/components/workspace/visual/utils/geometry';

interface AnimationOptions {
  duration?: number;
  delay?: number;
  easing?: 'cubic' | 'cubic-in-out';
}

const DEFAULT_DURATION = 300;
const _DEFAULT_EASING = 'cubic'; // Prefixed with underscore to indicate intentionally unused

// Animation timing constants for coordinated animations
export const ANIMATION_TIMING = {
  FADE_IN: {
    DURATION: 300,
    DELAY: 100
  },
  FADE_OUT: {
    DURATION: 250,
    DELAY: 50
  },
  ARROW: {
    DURATION: 400,
    DELAY: 200
  },
  STATE_CHANGE: {
    DURATION: 300,
    DELAY: 0
  },
  SPLIT: {
    DURATION: 400,
    DELAY: 250
  }
};

export class AnimationManager {
  private static instance: AnimationManager;

  private constructor() {}

  public static getInstance(): AnimationManager {
    if (!AnimationManager.instance) {
      AnimationManager.instance = new AnimationManager();
    }
    return AnimationManager.instance;
  }

  /**
   * Get the appropriate easing function
   */
  private getEasingFunction(easingName?: string) {
    if (easingName === 'cubic-in-out') {
      return easeCubicInOut;
    }
    return easeCubicOut; // default
  }

  /**
   * Animate opacity of an element from 0 to 1
   */
  public fadeIn(
    element: Selection<SVGElement, unknown, null, undefined> | SVGElement | null,
    options: AnimationOptions = {}
  ): Promise<void> {
    if (!element) return Promise.resolve();

    const selection = element instanceof SVGElement ? select(element) : element;
    const duration = options.duration || DEFAULT_DURATION;
    const delay = options.delay || 0;
    const easingFn = this.getEasingFunction(options.easing);

    return new Promise<void>((resolve) => {
      logger.debug('Starting fade in animation', { duration, delay }, 'animation-manager fade-in');
      
      selection
        .style('opacity', 0)
        .transition()
        .duration(duration)
        .delay(delay)
        .ease(easingFn)
        .style('opacity', 1)
        .on('end', () => {
          resolve();
        });
    });
  }

  /**
   * Animate opacity of an element to a specific value
   */
  public fadeTo(
    element: Selection<SVGElement, unknown, null, undefined> | SVGElement | null,
    opacity: number,
    options: AnimationOptions = {}
  ): Promise<void> {
    if (!element) return Promise.resolve();

    const selection = element instanceof SVGElement ? select(element) : element;
    const duration = options.duration || DEFAULT_DURATION;
    const delay = options.delay || 0;
    const easingFn = this.getEasingFunction(options.easing);

    return new Promise<void>((resolve) => {
      logger.debug('Starting fade to animation', { opacity, duration, delay }, 'animation-manager fade-to');
      
      selection
        .transition()
        .duration(duration)
        .delay(delay)
        .ease(easingFn)
        .style('opacity', opacity)
        .on('end', () => {
          resolve();
        });
    });
  }

  /**
   * Animate arrow path with both opacity and length growth
   */
  public animateArrow(
    arrowPath: Selection<SVGPathElement, unknown, null, undefined> | SVGPathElement | null,
    startPoint: { x: number; y: number },
    endPoint: { x: number; y: number },
    options: AnimationOptions = {}
  ): Promise<void> {
    if (!arrowPath) return Promise.resolve();

    const selection = arrowPath instanceof SVGPathElement ? select(arrowPath) : arrowPath;
    const duration = options.duration || ANIMATION_TIMING.ARROW.DURATION;
    const delay = options.delay || ANIMATION_TIMING.ARROW.DELAY;
    const easingFn = this.getEasingFunction(options.easing);

    return new Promise<void>((resolve) => {
      logger.debug('Starting arrow animation', { 
        from: startPoint, 
        to: endPoint,
        duration,
        delay
      }, 'animation-manager arrow');

      // Set initial state
      selection
        .style('opacity', 0)
        .attr('d', `M ${startPoint.x} ${startPoint.y} L ${startPoint.x} ${startPoint.y}`);

      // First fade in with zero length
      selection
        .transition()
        .duration(Math.floor(duration * 0.4)) // 40% of time for opacity
        .delay(delay)
        .ease(easingFn)
        .style('opacity', 1)
        .on('end', () => {
          // Then animate the path growing from start to end
          selection
            .transition()
            .duration(Math.floor(duration * 0.6)) // 60% of time for growth
            .ease(easingFn)
            .attr('d', `M ${startPoint.x} ${startPoint.y} L ${endPoint.x} ${endPoint.y}`)
            .on('end', () => {
              resolve();
            });
        });
    });
  }

  /**
   * Animate a sequence of tasks appearing with staggered timing
   */
  public animateTaskSequence(
    elements: (SVGElement | null)[],
    options: AnimationOptions = {}
  ): Promise<void[]> {
    const validElements = elements.filter(el => el !== null) as SVGElement[];
    const _baseDuration = options.duration || ANIMATION_TIMING.FADE_IN.DURATION; // Prefixed with underscore to indicate intentionally unused
    const baseDelay = options.delay || ANIMATION_TIMING.FADE_IN.DELAY;

    // Create staggered animation promises
    const promises = validElements.map((element, index) => {
      const staggerDelay = baseDelay + (index * 50); // 50ms stagger between items
      return this.fadeIn(element, {
        ...options,
        delay: staggerDelay
      });
    });

    return Promise.all(promises);
  }

  /**
   * Animate centering of viewport on a specific element
   */
  public centerViewportOn(
    svgElement: SVGSVGElement | null,
    rect: Rectangle,
    options: AnimationOptions = {}
  ): Promise<void> {
    if (!svgElement) return Promise.resolve();

    const duration = options.duration || 500; // Longer duration for smoother zoom
    const delay = options.delay || 0;
    const easingFn = this.getEasingFunction(options.easing || 'cubic-in-out');

    return new Promise<void>((resolve) => {
      try {
        const svg = select(svgElement);
        const svgWidth = svgElement.clientWidth || 800; // Fallback if dimensions aren't available
        const svgHeight = svgElement.clientHeight || 600;
        
        // Calculate center of rectangle
        const centerX = rect.x + rect.width / 2;
        const centerY = rect.y + rect.height / 2;
        
        // Calculate translation needed to center on this point
        const translateX = svgWidth / 2 - centerX;
        const translateY = svgHeight / 2 - centerY;
        
        logger.debug('Centering viewport on element', {
          element: rect,
          svgDimensions: { width: svgWidth, height: svgHeight },
          center: { x: centerX, y: centerY },
          translation: { x: translateX, y: translateY }
        }, 'animation-manager viewport-centering');

        // Get the transform group
        const transformGroup = svg.select('.transform-group');
        
        if (transformGroup.empty()) {
          logger.warn('Transform group not found, cannot center viewport', {}, 'animation-manager viewport-centering warning');
          resolve();
          return;
        }
        
        // Get current transform
        const currentTransform = transformGroup.attr('transform') || '';
        logger.debug('Current transform before centering', { transform: currentTransform }, 'animation-manager viewport-centering');
        
        // Animate the transform
        transformGroup
          .transition()
          .duration(duration)
          .delay(delay)
          .ease(easingFn)
          .attr('transform', `translate(${translateX}, ${translateY})`)
          .on('end', () => {
            logger.debug('Viewport centering animation completed', {
              finalTransform: transformGroup.attr('transform')
            }, 'animation-manager viewport-centering');
            resolve();
          });
      } catch (error) {
        logger.error('Failed to center viewport', { error }, 'animation-manager viewport-centering error');
        resolve(); // Still resolve to not block the chain
      }
    });
  }
}

export const animationManager = AnimationManager.getInstance();
