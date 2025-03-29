'use client';

import { logger } from '@/lib/client/logger';

/**
 * Global registry to track tasks being deleted
 * This helps coordinate the deletion process across components
 */
class DeletionTracker {
  private static instance: DeletionTracker;
  private deletedTaskIds: Set<string> = new Set();
  private observer: MutationObserver | null = null;
  private observingStarted = false;
  private debug = false;
  private processedElements: Set<Element> = new Set();
  private isProcessing = false;
  private processingTimeout: NodeJS.Timeout | null = null;

  private constructor() {
    // Private constructor for singleton
  }

  public static getInstance(): DeletionTracker {
    if (!DeletionTracker.instance) {
      DeletionTracker.instance = new DeletionTracker();
    }
    return DeletionTracker.instance;
  }

  /**
   * Enable debug logging
   */
  public setDebug(debug: boolean): void {
    this.debug = debug;
  }

  /**
   * Mark a task as being deleted
   */
  public markForDeletion(taskId: string, isSubtask: boolean = false): void {
    if (this.debug) {
      console.log(`[DeletionTracker] Marking task ${taskId} for deletion (${isSubtask ? 'subtask' : 'main task'})`);
    }
    
    this.deletedTaskIds.add(taskId);
    
    // Only update the primary deleting task attribute if this is not a subtask
    if (!isSubtask) {
      // Mark in the DOM as well
      document.body.setAttribute('data-deleting-task', taskId);
    } else {
      // For subtasks, add to a comma-separated list of subtasks being deleted
      const currentSubtasks = document.body.getAttribute('data-deleting-subtasks') || '';
      const subtasksList = currentSubtasks ? currentSubtasks.split(',') : [];
      
      if (!subtasksList.includes(taskId)) {
        subtasksList.push(taskId);
        document.body.setAttribute('data-deleting-subtasks', subtasksList.join(','));
      }
    }
    
    // Create a style element specifically for this task if it doesn't exist
    const styleId = `deletion-style-${taskId}`;
    let styleEl = document.getElementById(styleId);
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = styleId;
      document.head.appendChild(styleEl);
      
      // Add CSS rules to aggressively hide all controls for this task
      styleEl.textContent = `
        /* Force hide any control related to deleted task ${taskId} */
        .task-control-${taskId},
        [data-task-id="${taskId}"],
        .task-split-button[data-task-id="${taskId}"],
        #task-control-${taskId},
        g[data-task-id="${taskId}"],
        .task-counter-display[data-task-id="${taskId}"],
        .counter-display[data-task-id="${taskId}"],
        .regenerate-control[data-task-id="${taskId}"],
        .delete-control[data-task-id="${taskId}"],
        /* Also hide connection elements */
        g.connection-group[id*="${taskId}"],
        path[id*="${taskId}"],
        .connection-line[id*="${taskId}"],
        .connection-marker[id*="${taskId}"] {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
          pointer-events: none !important;
          transition: none !important;
          animation: none !important;
          position: absolute !important;
          z-index: -9999 !important;
          width: 0 !important;
          height: 0 !important;
          overflow: hidden !important;
          clip: rect(0, 0, 0, 0) !important;
        }
      `;
    }
    
    // Immediately find and hide controls for this task
    this.immediatelyHideTaskControls(taskId);
    
    // Start observing DOM changes if not already doing so
    this.startObserving();
    
    logger.info('Task marked for deletion', { taskId, isSubtask }, 'deletion-tracker task-deletion');
  }

  /**
   * Check if a task is being deleted
   */
  public isBeingDeleted(taskId: string): boolean {
    return this.deletedTaskIds.has(taskId);
  }

  /**
   * Get all tasks being deleted
   */
  public getAllDeletedTaskIds(): string[] {
    return Array.from(this.deletedTaskIds);
  }

  /**
   * Remove a task from the deletion registry
   * with improved cleanup and coordination
   */
  public unmarkForDeletion(taskId: string): void {
    if (this.debug) {
      console.log(`[DeletionTracker] Unmarking task ${taskId} from deletion`);
    }
    
    this.deletedTaskIds.delete(taskId);
    
    // If this was the task marked in the DOM, remove it
    if (document.body.getAttribute('data-deleting-task') === taskId) {
      document.body.removeAttribute('data-deleting-task');
    }
    
    // Remove from subtasks list if present
    const currentSubtasks = document.body.getAttribute('data-deleting-subtasks') || '';
    if (currentSubtasks) {
      const subtasksList = currentSubtasks.split(',').filter(id => id !== taskId);
      if (subtasksList.length > 0) {
        document.body.setAttribute('data-deleting-subtasks', subtasksList.join(','));
      } else {
        document.body.removeAttribute('data-deleting-subtasks');
      }
    }
    
    // Remove style element created for this task
    const styleIds = [
      `deletion-style-${taskId}`,
      `deletion-control-style-${taskId}`,
      `control-style-${taskId}`,
      `deletion-tracker-style-${taskId}`
    ];
    
    styleIds.forEach(styleId => {
      const styleEl = document.getElementById(styleId);
      if (styleEl && styleEl.parentNode) {
        styleEl.parentNode.removeChild(styleEl);
      }
    });
    
    // Clear this task from the processed elements cache
    // by removing any elements with data-task-id matching this task
    this.processedElements.forEach(element => {
      if (element.getAttribute('data-task-id') === taskId) {
        this.processedElements.delete(element);
      }
    });
    
    // If no more tasks are being deleted, stop observing and clean up
    if (this.deletedTaskIds.size === 0) {
      this.stopObserving();
      
      // Force a control layer visibility reset
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('reset-common-controls'));
        
        // Also trigger a control visibility event
        window.dispatchEvent(new CustomEvent('force-control-visibility', {
          detail: { 
            forceAll: true 
          }
        }));
      }, 100);
    }
    
    logger.info('Task unmarked from deletion', { taskId }, 'deletion-tracker task-deletion-complete');
  }

  /**
   * Get class name as string (works for both HTML and SVG elements)
   */
  private getClassNameAsString(element: Element): string {
    // For SVG elements, className is SVGAnimatedString
    if (element instanceof SVGElement && element.className) {
      // Use type assertion to handle SVGAnimatedString
      const svgClassName = element.className as unknown as { baseVal: string };
      if (svgClassName && typeof svgClassName.baseVal === 'string') {
        return svgClassName.baseVal;
      }
    } 
    // For HTML elements, className is a string
    else if (typeof element.className === 'string') {
      return element.className;
    }
    
    // Fallback - try getting from classList
    if (element.classList && element.classList.length > 0) {
      return Array.from(element.classList).join(' ');
    }
    
    return '';
  }

  /**
   * Start observing DOM changes to hide control elements for deleted tasks
   */
  private startObserving(): void {
    if (this.observingStarted) return;
    
    try {
      // Create mutation observer if it doesn't exist
      if (!this.observer) {
        this.observer = new MutationObserver((mutations) => {
          // Skip if we're already processing changes to avoid recursion
          if (this.isProcessing) return;
          
          // Collect elements to process
          const elementsToProcess = new Set<Element>();
          
          for (const mutation of mutations) {
            // Skip mutations we caused ourselves
            const target = mutation.target as Element;
            if (target && 
                (target.hasAttribute('data-force-hidden') || 
                 target.classList.contains('force-hidden-element') ||
                 target.classList.contains('being-processed-by-tracker'))) {
              continue;
            }
            
            // Check added nodes
            if (mutation.addedNodes.length > 0) {
              for (const node of Array.from(mutation.addedNodes)) {
                if (node instanceof Element && !this.processedElements.has(node)) {
                  elementsToProcess.add(node);
                }
              }
            }
            
            // Also check attributes for any elements that might have been changed
            if (mutation.type === 'attributes' && target && !this.processedElements.has(target)) {
              elementsToProcess.add(target);
            }
          }
          
          // If we have elements to process, schedule processing
          if (elementsToProcess.size > 0) {
            // Clear any pending timeout
            if (this.processingTimeout) {
              clearTimeout(this.processingTimeout);
              this.processingTimeout = null;
            }
            
            // Schedule processing with a small delay
            this.processingTimeout = setTimeout(() => {
              this.processBatchOfElements(elementsToProcess);
            }, 50);
          }
        });
      }
      
      // Start observing - but with limited attributes to prevent self-triggering
      this.observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['data-task-id', 'id', 'class'] // Reduced attribute set
      });
      
      this.observingStarted = true;
      
      if (this.debug) {
        console.log('[DeletionTracker] Started observing DOM mutations');
      }
      
      // Perform an initial scan of the DOM
      this.scanDomForDeletedTaskControls();
      
      logger.info('Deletion tracker mutation observer started', {}, 'deletion-tracker mutation-observer');
    } catch (error) {
      logger.error('Failed to start mutation observer', { error }, 'deletion-tracker mutation-observer error');
    }
  }
  
  /**
   * Process a batch of elements safely
   */
  private processBatchOfElements(elements: Set<Element>): void {
    // Mark that we're processing to prevent recursion
    this.isProcessing = true;
    
    try {
      // Process each element
      elements.forEach(element => {
        if (!this.processedElements.has(element)) {
          this.processedElements.add(element);
          this.checkElementForTaskControls(element);
          
          // Also check children - but limit depth to prevent stack overflow
          this.processChildrenWithLimitedDepth(element, 3);
        }
      });
    } catch (error) {
      logger.error('Error processing batch of elements', { error }, 'deletion-tracker element-processing error');
    } finally {
      // Reset processing state
      this.isProcessing = false;
      this.processingTimeout = null;
    }
  }
  
  /**
   * Process children with a limited depth to prevent stack overflow
   */
  private processChildrenWithLimitedDepth(element: Element, maxDepth: number): void {
    if (maxDepth <= 0) return;
    
    try {
      // Only select potential control elements to reduce processing
      const children = element.querySelectorAll(
        '.task-split-button, .task-control, [data-task-id], g[data-task-id]'
      );
      
      children.forEach(child => {
        if (!this.processedElements.has(child)) {
          this.processedElements.add(child);
          this.checkElementForTaskControls(child);
          
          // Process next level with reduced depth
          this.processChildrenWithLimitedDepth(child, maxDepth - 1);
        }
      });
    } catch (error) {
      if (this.debug) {
        console.error('[DeletionTracker] Error processing children:', error);
      }
    }
  }

  /**
   * Stop observing DOM changes
   */
  private stopObserving(): void {
    if (!this.observingStarted || !this.observer) return;
    
    try {
      this.observer.disconnect();
      this.observingStarted = false;
      
      if (this.debug) {
        console.log('[DeletionTracker] Stopped observing DOM mutations');
      }
      
      logger.info('Deletion tracker mutation observer stopped', {}, 'deletion-tracker mutation-observer');
    } catch (error) {
      logger.error('Failed to stop mutation observer', { error }, 'deletion-tracker mutation-observer error');
    }
  }

  /**
   * Recursively check and hide elements that are controls for deleted tasks
   * with improved performance and loop prevention
   */
  private hideControlsForDeletedTasks(element: Element): void {
    // Skip if no deleted tasks or we're already processing
    if (this.deletedTaskIds.size === 0 || this.isProcessing) return;
    
    // Skip if we've already processed this element
    if (this.processedElements.has(element)) return;
    
    // Mark that we're processing
    this.isProcessing = true;
    
    try {
      // Add to processed set
      this.processedElements.add(element);
      
      // Check this element
      this.checkElementForTaskControls(element);
      
      // Check children with limited depth
      this.processChildrenWithLimitedDepth(element, 3);
    } finally {
      // Reset processing state
      this.isProcessing = false;
    }
  }
  
  /**
   * Immediately hide all controls for a specific task
   * This is more aggressive than the mutation observer approach
   * with improved coordination with the control layer
   */
  public immediatelyHideTaskControls(taskId: string): void {
    if (this.debug) {
      console.log(`[DeletionTracker] Immediately hiding controls for task ${taskId}`);
    }
    
    try {
      // Comprehensive list of selectors for task controls
      const controlSelectors = [
        `.task-control-${taskId}`,
        `#task-control-${taskId}`,
        `[data-task-id="${taskId}"]`,
        `.task-split-button[data-task-id="${taskId}"]`,
        `g[data-task-id="${taskId}"]`,
        `.counter-display[data-task-id="${taskId}"]`,
        `.task-counter-display[data-task-id="${taskId}"]`,
        `.regenerate-control[data-task-id="${taskId}"]`,
        `.delete-control[data-task-id="${taskId}"]`
      ];
      
      // Find all control elements
      document.querySelectorAll(controlSelectors.join(',')).forEach(element => {
        this.forceHideElement(element);
        this.processedElements.add(element);
        
        // Also mark the element as being from a deleted task
        element.setAttribute('data-being-removed-task', 'true');
        
        if (this.debug) {
          console.log(`[DeletionTracker] Immediately hid control:`, element.tagName, element.id || '(no id)');
        }
      });
      
      // Also find connection elements
      const connectionSelectors = [
        `g.connection-group[id*="${taskId}"]`,
        `path[id*="${taskId}"]`,
        `.connection-line[id*="${taskId}"]`,
        `.connection-marker[id*="${taskId}"]`,
        `[id*="connection-${taskId}"]`,
        `[id*="connection-to-${taskId}"]`,
        `[id*="connection-from-${taskId}"]`
      ];
      
      document.querySelectorAll(connectionSelectors.join(',')).forEach(element => {
        this.forceHideElement(element);
        this.processedElements.add(element);
        
        // Also mark the element as being from a deleted task
        element.setAttribute('data-being-removed-task', 'true');
        
        if (this.debug) {
          console.log(`[DeletionTracker] Immediately hid connection:`, element.tagName, element.id || '(no id)');
        }
      });
      
      // Find the task element itself and mark it
      const taskElement = document.getElementById(`task-${taskId}`);
      if (taskElement) {
        taskElement.setAttribute('data-being-deleted', 'true');
        taskElement.classList.add('being-deleted');
        
        // Also mark all child elements as being processed
        taskElement.querySelectorAll('*').forEach(element => {
          this.processedElements.add(element);
          // Add the marker attribute to all child elements as well
          element.setAttribute('data-being-removed-task', 'true');
        });
      }
      
      // Create a style element with ultra-specific selectors to ensure these controls stay hidden
      const styleId = `deletion-tracker-style-${taskId}`;
      let styleEl = document.getElementById(styleId);
      
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = styleId;
        document.head.appendChild(styleEl);
        
        // CSS with maximum specificity targeting all possible control elements
        styleEl.textContent = `
          /* Tracker enforced hiding for task ${taskId} controls */
          body .task-control-${taskId},
          body [data-task-id="${taskId}"],
          body .layer-controls [data-task-id="${taskId}"],
          body .layer-controls .task-split-button[data-task-id="${taskId}"],
          body .layer-controls g[data-task-id="${taskId}"],
          body .task-split-button[data-task-id="${taskId}"],
          body .task-control[data-task-id="${taskId}"],
          body .regenerate-control[data-task-id="${taskId}"],
          body .delete-control[data-task-id="${taskId}"],
          body svg g[data-task-id="${taskId}"],
          /* Also connection elements */
          body .layer-connections [id*="${taskId}"],
          body .layer-connections path[id*="${taskId}"],
          body .layer-connections g[id*="${taskId}"] {
            display: none !important;
            visibility: hidden !important;
            opacity: 0 !important;
            pointer-events: none !important;
            position: absolute !important;
            z-index: -9999 !important;
            clip: rect(0,0,0,0) !important;
            width: 0 !important;
            height: 0 !important;
            overflow: hidden !important;
            transition: none !important;
          }
        `;
      }
      
      // Also listen for the post-deletion cleanup event
      const handlePostDeletionComplete = () => {
        // When post-deletion centering is complete, dispatch an event to reset controls
        setTimeout(() => {
          // Force a control layer visibility reset
          window.dispatchEvent(new CustomEvent('reset-common-controls'));
          
          // Remove our style element after a delay
          setTimeout(() => {
            if (styleEl && styleEl.parentNode) {
              styleEl.parentNode.removeChild(styleEl);
            }
          }, 250);
        }, 100);
      };
      
      // Add listener once
      window.removeEventListener('post-deletion-centering-complete', handlePostDeletionComplete);
      window.addEventListener('post-deletion-centering-complete', handlePostDeletionComplete, { once: true });
      
    } catch (error) {
      console.error(`[DeletionTracker] Error immediately hiding controls for task ${taskId}:`, error);
    }
  }

  /**
   * Check if an element is a control for a deleted task and hide it if it is
   */
  private checkElementForTaskControls(element: Element): void {
    // Skip if no deleted tasks
    if (this.deletedTaskIds.size === 0) return;
    
    // Skip elements we already processed or that are already hidden
    if (this.processedElements.has(element) || 
        element.classList.contains('force-hidden-element') ||
        element.hasAttribute('data-force-hidden') ||
        element.classList.contains('being-processed-by-tracker')) {
      return;
    }
    
    try {
      // Mark as being processed to prevent recursion
      element.classList.add('being-processed-by-tracker');
      
      // Get className as string safely for SVG elements
      const classString = this.getClassNameAsString(element);
      
      // Get the task ID from various possible attributes
      const taskId = element.getAttribute('data-task-id') || 
                    element.id?.match(/task-control-([^-]+)/)?.[1] || 
                    element.id?.match(/task-(\w+)/)?.[1] ||
                    classString.match(/task-control-(\w+)/)?.[1];
      
      // Check if this is a control element
      const isControlElement = (
        element.classList.contains('task-split-button') ||
        element.classList.contains('task-control') ||
        element.classList.contains('regenerate-control') ||
        element.classList.contains('delete-control') ||
        (element.id && element.id.includes('task-control-')) ||
        classString.includes('task-control-') ||
        element.getAttribute('data-control-type') === 'split' ||
        (element.tagName.toLowerCase() === 'g' && element.hasAttribute('data-task-id'))
      );
      
      // If it's a control element and has a task ID that's being deleted, hide it
      if (isControlElement && taskId && this.deletedTaskIds.has(taskId)) {
        if (this.debug) {
          console.log(`[DeletionTracker] Hiding control element for deleted task ${taskId}`, {
            element: element.tagName + (element.id ? `#${element.id}` : '') + 
                    (classString ? `.${classString.replace(/\s+/g, '.')}` : '')
          });
        }
        
        this.forceHideElement(element);
      }
      
      // Remember that we processed this element
      this.processedElements.add(element);
    } catch (error) {
      if (this.debug) {
        console.error('[DeletionTracker] Error checking element:', error);
      }
    } finally {
      // Remove processing marker class
      element.classList.remove('being-processed-by-tracker');
    }
  }

  /**
   * Force hide an element with multiple techniques
   * with improved cleanup for post-deletion
   */
  private forceHideElement(element: Element): void {
    try {
      if (element instanceof HTMLElement || element instanceof SVGElement) {
        // Store original styles before modifying
        if (!element.hasAttribute('data-original-display')) {
          element.setAttribute('data-original-display', element.style.display || '');
        }
        if (!element.hasAttribute('data-original-visibility')) {
          element.setAttribute('data-original-visibility', element.style.visibility || '');
        }
        if (!element.hasAttribute('data-original-opacity')) {
          element.setAttribute('data-original-opacity', element.style.opacity || '');
        }
        
        // Apply inline styles with !important
        element.style.setProperty('display', 'none', 'important');
        element.style.setProperty('visibility', 'hidden', 'important');
        element.style.setProperty('opacity', '0', 'important');
        element.style.setProperty('pointer-events', 'none', 'important');
        element.style.setProperty('position', 'absolute', 'important');
        element.style.setProperty('z-index', '-9999', 'important');
        element.style.setProperty('width', '0', 'important');
        element.style.setProperty('height', '0', 'important');
        element.style.setProperty('overflow', 'hidden', 'important');
        element.style.setProperty('clip', 'rect(0,0,0,0)', 'important');
        
        // Add marker classes - use multiple to ensure compatibility with different CSS selectors
        element.classList.add('force-hidden-element');
        element.classList.add('being-removed');
        element.classList.add('force-hidden-control');
        element.classList.add('hidden-during-operation');
        element.classList.add('deletion-tracker-hidden');
        
        // Add data attributes
        element.setAttribute('data-force-hidden', 'true');
        element.setAttribute('data-being-removed-task', 'true');
        element.setAttribute('data-hidden-by-deletion-tracker', 'true');
        
        // Set a timestamp for debugging
        element.setAttribute('data-hidden-timestamp', Date.now().toString());
        
        // Get the task ID for tracking
        const taskId = element.getAttribute('data-task-id');
        if (taskId) {
          element.setAttribute('data-hidden-for-task', taskId);
        }
        
        logger.debug('Force hid control element', {
          id: element.id,
          className: element.className,
          taskId
        }, 'deletion-tracker element-hiding');
      }
    } catch (error) {
      logger.error('Error force hiding element', { error }, 'deletion-tracker element-hiding error');
    }
  }

  /**
   * Scan the entire DOM for controls of deleted tasks
   */
  private scanDomForDeletedTaskControls(): void {
    if (this.deletedTaskIds.size === 0) return;
    
    // Skip if already processing
    if (this.isProcessing) return;
    
    // Mark as processing
    this.isProcessing = true;
    
    try {
      // Clear processed elements to allow a fresh scan
      this.processedElements.clear();
      
      const selector = [
        '.task-split-button',
        '.task-control',
        '.regenerate-control',
        '.delete-control',
        '[data-task-id]',
        '[id^="task-control-"]',
        'g[data-control-type="split"]'
      ].join(',');
      
      // Find all control elements in the DOM
      const controlElements = document.querySelectorAll(selector);
      
      if (this.debug) {
        console.log(`[DeletionTracker] Scanning DOM, found ${controlElements.length} potential control elements`);
      }
      
      // Process elements in batches
      const elementsToProcess = new Set<Element>();
      controlElements.forEach(element => {
        // Skip elements already hidden
        if (!element.classList.contains('force-hidden-element') && 
            !element.hasAttribute('data-force-hidden')) {
          elementsToProcess.add(element);
        }
      });
      
      if (elementsToProcess.size > 0) {
        this.processBatchOfElements(elementsToProcess);
      }
    } catch (error) {
      logger.error('Error scanning DOM for deleted task controls', { error }, 'deletion-tracker dom-scanning error');
    } finally {
      // Reset processing state
      this.isProcessing = false;
    }
  }
}

export const deletionTracker = DeletionTracker.getInstance();
