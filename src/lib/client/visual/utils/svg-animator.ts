'use client';

import { logger } from '@/lib/client/logger';
import { select } from 'd3-selection';
import { easeCubicInOut } from 'd3-ease';

/**
 * Specialized animator for SVG elements with precise control
 * Handles SVG-specific animation challenges
 */
export class SvgAnimator {
  private static instance: SvgAnimator;
  private debugEnabled: boolean = false;

  private constructor() {}

  public static getInstance(): SvgAnimator {
    if (!SvgAnimator.instance) {
      SvgAnimator.instance = new SvgAnimator();
    }
    return SvgAnimator.instance;
  }

  /**
   * Enable or disable debug mode
   */
  setDebug(enabled: boolean): void {
    this.debugEnabled = enabled;
    
    if (enabled) {
      logger.debug('SvgAnimator: Debug mode enabled', {}, 'svg-animator configuration');
    }
  }

  /**
   * Animate an element to opacity 0
   */
  fadeOut(element: Element, duration: number = 800, delay: number = 0): Promise<void> {
    return new Promise<void>((resolve) => {
      try {
        if (!element || !element.parentNode) {
          this.debugLog('Skipping fadeOut - element not found or no parent', { 
            id: element?.id, 
            tagName: element?.tagName 
          });
          resolve();
          return;
        }

        // Add a data attribute to mark this element as animating
        element.setAttribute('data-animating', 'true');
        
        const elementId = element.id || 'unknown';
        const elementType = element.tagName || 'unknown';
        const elementClass = Array.from(element.classList).join(' ') || 'none';
        
        this.debugLog('Starting fadeOut animation', {
          id: elementId,
          type: elementType,
          class: elementClass,
          duration,
          delay
        });

        // Use d3 for the animation
        select(element)
          .transition()
          .duration(duration)
          .delay(delay)
          .ease(easeCubicInOut)
          .style('opacity', 0)
          .style('pointer-events', 'none')
          .on('end', () => {
            this.debugLog('FadeOut animation completed', {
              id: elementId,
              type: elementType
            });
            element.removeAttribute('data-animating');
            resolve();
          })
          .on('interrupt', () => {
            this.debugLog('FadeOut animation interrupted', {
              id: elementId,
              type: elementType
            });
            element.removeAttribute('data-animating');
            resolve();
          });
      } catch (error) {
        logger.error('SvgAnimator: Error in fadeOut', {
          id: element?.id,
          error: error instanceof Error ? error.message : String(error)
        }, 'svg-animator fade-animation error');
        resolve();
      }
    });
  }

  /**
   * Remove an element from the DOM after fadeOut
   */
  async fadeOutAndRemove(
    element: Element, 
    duration: number = 800, 
    delay: number = 0
  ): Promise<void> {
    if (!element || !element.parentNode) {
      this.debugLog('Skipping fadeOutAndRemove - element not found or no parent', {
        id: element?.id,
        tagName: element?.tagName
      });
      return;
    }

    try {
      // First animate the opacity
      await this.fadeOut(element, duration, delay);
      
      // Then remove from DOM
      if (element.parentNode) {
        this.debugLog('Removing element from DOM', {
          id: element.id || 'unknown',
          type: element.tagName || 'unknown'
        });
        element.parentNode.removeChild(element);
      }
    } catch (error) {
      logger.error('SvgAnimator: Error in fadeOutAndRemove', {
        id: element?.id,
        error: error instanceof Error ? error.message : String(error)
      }, 'svg-animator element-removal error');
    }
  }

  /**
   * Animate multiple elements with a sequence
   */
  async animateElementGroups(
    elements: Record<string, Element[]>,
    options: {
      duration?: number;
      delay?: number; 
      stagger?: number;
      remove?: boolean;
    } = {}
  ): Promise<void> {
    const duration = options.duration || 800;
    const initialDelay = options.delay || 0;
    const stagger = options.stagger || 50;
    const shouldRemove = options.remove !== false;
    
    // Track all animation promises
    const animationPromises: Promise<void>[] = [];
    let totalElements = 0;
    
    // For each category of elements
    for (const category in elements) {
      const categoryElements = elements[category];
      totalElements += categoryElements.length;
      
      // Calculate delay for this category
      // We'll stagger a bit for more natural animation
      categoryElements.forEach((element, index) => {
        const elementDelay = initialDelay + (index * stagger);
        
        if (shouldRemove) {
          animationPromises.push(this.fadeOutAndRemove(element, duration, elementDelay));
        } else {
          animationPromises.push(this.fadeOut(element, duration, elementDelay));
        }
      });
    }
    
    this.debugLog('Starting animation sequence', {
      totalElements,
      duration,
      initialDelay,
      stagger,
      shouldRemove,
      categories: Object.keys(elements).map(category => ({
        name: category,
        count: elements[category].length
      }))
    });
    
    // Wait for all animations to complete
    await Promise.all(animationPromises);
    
    this.debugLog('Animation sequence completed', {
      totalElements
    });
  }

  /**
   * Log debug info if enabled
   */
  private debugLog(message: string, data?: Record<string, unknown>): void {
    if (this.debugEnabled) {
      logger.debug(`SvgAnimator: ${message}`, data, 'svg-animator');
    }
  }
}

export const svgAnimator = SvgAnimator.getInstance();
