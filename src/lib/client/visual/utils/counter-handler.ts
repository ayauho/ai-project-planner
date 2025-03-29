'use client';

import { logger } from '@/lib/client/logger';

/**
 * Utility class to handle counter display interactions
 */
export class CounterHandler {
  private static instance: CounterHandler;
  private intervalId: NodeJS.Timeout | null = null;
  
  private constructor() {
    this.initialize();
  }
  
  public static getInstance(): CounterHandler {
    if (!CounterHandler.instance) {
      CounterHandler.instance = new CounterHandler();
    }
    return CounterHandler.instance;
  }
  
  /**
   * Initialize counter handler
   */
  private initialize(): void {
    if (typeof window === 'undefined') return;
    
    // Apply immediately if document is ready
    if (document.readyState === 'complete') {
      this.disableAllCounters();
    } else {
      // Otherwise wait for document to be ready
      document.addEventListener('DOMContentLoaded', () => {
        this.disableAllCounters();
      });
    }
    
    // Set up an interval to continuously check and disable counters
    this.intervalId = setInterval(() => {
      this.disableAllCounters();
    }, 1000);
    
    // Set up mutation observer to catch dynamically added counters
    this.setupMutationObserver();
    
    logger.debug('CounterHandler initialized', {}, 'counter-handler initialization');
  }
  
  /**
   * Set up mutation observer to detect new counters
   */
  private setupMutationObserver(): void {
    if (typeof MutationObserver === 'undefined' || typeof window === 'undefined') return;
    
    try {
      const observer = new MutationObserver((mutations) => {
        let needsUpdate = false;
        
        // Check if any mutations are relevant for counters
        mutations.forEach(mutation => {
          if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
            for (let i = 0; i < mutation.addedNodes.length; i++) {
              const node = mutation.addedNodes[i];
              
              if (node.nodeType === Node.ELEMENT_NODE) {
                const element = node as Element;
                
                // Check if this is a counter-related element
                if (
                  element.classList?.contains('task-counter-display') ||
                  element.classList?.contains('project-counter') ||
                  element.getAttribute?.('data-project-counter') === 'true'
                ) {
                  needsUpdate = true;
                  // Log the found counter for debugging
                  logger.debug('Counter element found in DOM mutation', {
                    element: element.tagName,
                    classes: element.className
                  }, 'counter-handler mutation-detection');
                }
              }
            }
          }
        });
        
        if (needsUpdate) {
          this.disableAllCounters();
        }
      });
      
      // Start observing the entire document
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style', 'data-project-counter']
      });
      
      logger.debug('Counter mutation observer started', {}, 'counter-handler mutation-observer');
    } catch (error) {
      logger.error('Failed to set up counter mutation observer', { error }, 'counter-handler mutation-observer error');
    }
  }  
  /**
   * Find and disable all counter elements with improved handling for preserved counters
   */
  public disableAllCounters(): void {
    try {
      // Find all counter-related elements with more comprehensive selectors
      const selectors = [
        '.task-counter-display',
        '.project-counter', 
        '[data-project-counter="true"]',
        '.counter-clone',
        '.preserve-counter',
        '.project-counter-clone',
        '[class*="project-counter-"]',
        'g[id^="project-counter-"]',
        'g[data-counter-text]'
      ];
      
      const counters = document.querySelectorAll(selectors.join(', '));
      
      if (counters.length === 0) return;
      
      // Process each counter
      counters.forEach(counter => {
        // Skip elements that are being animated or preserved
        if (counter.classList.contains('preserved') || 
            counter.classList.contains('restoring') ||
            counter.getAttribute('data-preserved-during-centering') === 'true') {
          // For these elements, ensure visibility but maintain non-interactivity
          if (counter instanceof HTMLElement || counter instanceof SVGElement) {
            counter.style.pointerEvents = 'none';
            counter.style.cursor = 'default';
            counter.style.userSelect = 'none';
          }
          return;
        }
        
        const element = counter as HTMLElement | SVGElement;
        
        // Set styles directly with !important to override any other styles
        element.style.setProperty('pointer-events', 'none', 'important');
        element.style.setProperty('cursor', 'default', 'important');
        element.style.setProperty('user-select', 'none', 'important');
        
        // Add capture phase event listeners to prevent all interactions
        const preventDefault = (event: Event) => {
          event.preventDefault();
          event.stopPropagation();
          return false;
        };
        
        // Remove old event listeners if any (just in case)
        element.removeEventListener('click', preventDefault, true);
        element.removeEventListener('mousedown', preventDefault, true);
        element.removeEventListener('mouseover', preventDefault, true);
        element.removeEventListener('mouseenter', preventDefault, true);
        
        // Add new event listeners
        element.addEventListener('click', preventDefault, true);
        element.addEventListener('mousedown', preventDefault, true);
        element.addEventListener('mouseover', (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (element instanceof HTMLElement) {
            element.style.cursor = 'default';
          }
          return false;
        }, true);
        element.addEventListener('mouseenter', (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (element instanceof HTMLElement) {
            element.style.cursor = 'default';
          }
          return false;
        }, true);
        
        // Process child elements
        element.querySelectorAll('*').forEach(child => {
          if (child instanceof HTMLElement || child instanceof SVGElement) {
            child.style.setProperty('pointer-events', 'none', 'important');
            child.style.setProperty('cursor', 'default', 'important');
            
            // Add event listeners to children as well
            child.removeEventListener('click', preventDefault, true);
            child.removeEventListener('mousedown', preventDefault, true);
            child.addEventListener('click', preventDefault, true);
            child.addEventListener('mousedown', preventDefault, true);
          }
        });
        
        // For SVG-specific counters, ensure specific properties are set
        if (element instanceof SVGElement) {
          element.setAttribute('pointer-events', 'none');
        }
      });
      
      // Also ensure project counter clones are non-interactive
      document.querySelectorAll('.counter-clone, .preserve-counter, .project-counter-clone').forEach(clone => {
        if (clone instanceof HTMLElement) {
          clone.style.setProperty('pointer-events', 'none', 'important');
          clone.style.setProperty('cursor', 'default', 'important');
          clone.style.setProperty('user-select', 'none', 'important');
        }
      });
    } catch (error) {
      logger.error('Failed to disable counters', { 
        error: error instanceof Error ? error.message : String(error)
      }, 'counter-handler disable-counters error');
    }
  }
  /**
   * Clean up resources
   */
  public dispose(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}

// Create singleton instance
export const counterHandler = CounterHandler.getInstance();
