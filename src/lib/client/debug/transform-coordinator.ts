'use client';

import { logger } from '@/lib/client/logger';

/**
 * Define window augmentation for global references
 */
// Create a more specific type for the d3 zoom behavior
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type D3ZoomBehavior = (selection: any) => any;

declare global {
  interface Window {
    __globalZoomBehavior?: D3ZoomBehavior;
    globalZoomBehavior?: D3ZoomBehavior;
    __transformCoordinator?: typeof transformCoordinator;
    __zoomHookState?: { scale: number; translate: { x: number; y: number } };
  }
}

/**
 * Global transform coordination system
 * Acts as the single source of truth for transforms to prevent conflicts
 */
export const transformCoordinator = {
  // Flag to indicate a centering operation is in progress
  centeringInProgress: false,
  
  // The explicitly set transform that should not be overridden
  explicitTransform: null as string | null,
  
  // Store initial transform values for new projects
  initialTransform: null as { scale: number; translate: { x: number; y: number } } | null,
  
  // Transform lock mechanism
  transformLocked: false,
  transformLockTimestamp: 0,
  transformLockDuration: 5000, // 5 seconds lock by default
  
  // Highest priority transform for state restoration
  restorationTransform: null as { scale: number; translate: { x: number; y: number } } | null,
  restorationTimestamp: 0,
  
// Lock the transform to prevent any changes during critical operations
lockTransform(duration: number = 5000): void {
  this.transformLocked = true;
  this.transformLockTimestamp = Date.now();
  this.transformLockDuration = duration;
  
  // Add data attributes and classes to the body for CSS and detection
  document.body.setAttribute('data-transform-locked', 'true');
  document.body.classList.add('transform-locked-strict');
  
  // Add transform-initializing class and interaction prohibition for better coordination
  document.body.classList.add('transform-initializing');
  document.body.classList.add('transform-interaction-prohibited');
  
  // Also add prevent-selection class to document element to prevent text selection
  document.documentElement.classList.add('prevent-selection');
  
  logger.info('[TRANSFORM COORDINATOR] 🔒 Transform locked', {
    duration: duration + 'ms',
    timestamp: new Date(this.transformLockTimestamp).toISOString(),
    hasExplicitTransform: !!this.explicitTransform,
    hasInitialTransform: !!this.initialTransform,
    hasRestorationTransform: !!this.restorationTransform,
    _style: 'background-color: #F44336; color: white; padding: 2px 5px; border-radius: 3px;'
  }, 'transform-coordinator lock');
  
  // Auto unlock after duration
  setTimeout(() => {
    this.unlockTransform();
  }, duration);
  
  // Add a scheduled delay for making workspace stabilized and interactive
  setTimeout(() => {
    // First remove classes
    document.body.classList.remove('transform-initializing', 'transform-interaction-prohibited');
    document.documentElement.classList.remove('prevent-selection');
    document.body.classList.add('transform-stable');
    
    // Make elements visible after a slight delay
    setTimeout(() => {
      // Make all elements visible again
      document.querySelectorAll('.task-rect, .project-rect, .counter-display, .connection-line, svg g').forEach(el => {
        (el as HTMLElement).style.visibility = 'visible';
        (el as HTMLElement).style.opacity = '1';
        (el as HTMLElement).style.transition = 'opacity 0.3s ease-out';
      });
      
      logger.info('Elements made visible after transform stabilization', {
        timestamp: new Date().toISOString()
      }, 'transform-coordinator visibility');
    }, 300);
    
    logger.info('Transform initialization complete, workspace is now stable', {
      timestamp: new Date().toISOString(),
      lockElapsed: Date.now() - this.transformLockTimestamp
    }, 'transform-coordinator initialization');
  }, Math.min(duration - 200, 1200)); // Longer delay to ensure stability
  
  // Add a shorter timeout for zoom/pan readiness - make it much faster now
  setTimeout(() => {
    this.prepareForZoomPan();
  }, 300); // Very short delay to allow positioning but enable zoom quickly
  
  // Also set up immediate interaction detection
  this.setupInteractionDetection();
},
  
  // Set up detection for the first user interaction to immediately enable zoom/pan
  setupInteractionDetection(): void {
    try {
      const handleFirstInteraction = (event: Event) => {
        // Skip if not in locked state
        if (!this.transformLocked) return;
        
        // Skip if already prepared for zoom/pan and the body has the class
        if (document.body.classList.contains('zoom-interaction')) return;
        
        // Mark that user has interacted
        document.body.classList.add('zoom-interaction');
        document.body.classList.add('zoom-pan-enabled');
        document.body.classList.add('zoom-pan-ready');
        document.body.classList.remove('transform-locked-strict');
        
        // Only prepare for zoom if we haven't already
        if (!document.body.classList.contains('zoom-pan-ready')) {
          this.prepareForZoomPan();
        }
        
        logger.info('First user interaction detected, enabling zoom/pan immediately', {
          eventType: event.type,
          timestamp: Date.now()
        }, 'transform-coordinator interaction');
      };
      
      // Add event listeners for common interaction events
      const events = ['mousedown', 'wheel', 'touchstart', 'keydown', 'mousemove'];
      
      // Clean up any existing listeners first
      events.forEach(eventType => {
        document.removeEventListener(eventType, handleFirstInteraction);
      });
      
      // Add new listeners
      events.forEach(eventType => {
        document.addEventListener(eventType, handleFirstInteraction, { passive: true });
      });
      
      // Clean up after a timeout
      setTimeout(() => {
        events.forEach(eventType => {
          document.removeEventListener(eventType, handleFirstInteraction);
        });
      }, this.transformLockDuration + 1000);
    } catch {
      // Ignore errors in interaction detection
    }
  },
  
  // Prepare for zoom/pan operations while keeping initial position
  prepareForZoomPan(): void {
    // Keep the transform locked, but enable zoom/pan
    document.body.classList.add('zoom-pan-ready');
    
    // Remove classes that block zoom/pan
    document.body.classList.remove('has-explicit-transform');
    document.body.classList.remove('transform-locked-strict');
    
    // Add class to indicate we're ready for zoom/pan
    document.body.classList.add('zoom-pan-enabled');
    
    // Remove direct attribute locks on transform group
    try {
      const transformGroup = document.querySelector('.transform-group');
      if (transformGroup) {
        transformGroup.removeAttribute('data-locked-transform');
        
        // Store the current transform in a data attribute for reference
        const transform = transformGroup.getAttribute('transform');
        if (transform) {
          transformGroup.setAttribute('data-initial-transform', transform);
        }
      }
      
      // Also update zoom behavior if available
      const svg = document.querySelector('svg');
      if (svg) {
        try {
          // Safely access the global zoom behavior
          const globalZoomBehavior = window.__globalZoomBehavior || window.globalZoomBehavior;
                                    
          if (globalZoomBehavior) {
            // Use dynamic import to access d3 modules
            Promise.all([
              import('d3'),
              import('d3-selection')
            ]).then(([_d3, selectionModule]) => {
              const select = selectionModule.select;
              // Use the properly typed zoom behavior
              select(svg).call(globalZoomBehavior);
              logger.debug('Applied zoom behavior during prepareForZoomPan', {}, 'transform-coordinator zoom');
            }).catch(() => {
              // Silently catch any import errors
            });
          }
        } catch (error) {
          // Ignore d3 import errors
          logger.warn('Error applying zoom behavior in prepareForZoomPan', { error }, 'transform-coordinator error');
        }
      }
    } catch {
      // Ignore errors
    }
    
    // Dispatch a custom event to notify that zoom/pan is ready
    try {
      window.dispatchEvent(new CustomEvent('zoom-pan-ready'));
    } catch {
      // Ignore errors
    }
    
    logger.info('Prepared for zoom/pan operations', {
      timestamp: Date.now(),
      lockRemaining: this.transformLockDuration - (Date.now() - this.transformLockTimestamp),
      zoomReady: true
    }, 'transform-coordinator zoom');
  },
  
  // Unlock the transform
  unlockTransform(): void {
    if (!this.transformLocked) return;
    
    this.transformLocked = false;
    document.body.removeAttribute('data-transform-locked');
    document.body.classList.remove('has-explicit-transform');
    document.body.classList.add('transform-unlocked');
    document.body.classList.add('zoom-pan-ready');
    
    // Remove any transform-related attributes from SVG elements
    try {
      const svg = document.querySelector('svg');
      if (svg) {
        svg.removeAttribute('data-transform-x');
        svg.removeAttribute('data-transform-y');
        svg.removeAttribute('data-transform-scale');
      }
      
      const transformGroup = document.querySelector('.transform-group');
      if (transformGroup) {
        transformGroup.removeAttribute('data-locked-transform');
      }
    } catch {
      // Ignore errors
    }
    
    logger.info('[TRANSFORM COORDINATOR] 🔓 Transform unlocked', {
      lockedDuration: (Date.now() - this.transformLockTimestamp) + 'ms',
      timestamp: new Date().toISOString(),
      _style: 'background-color: #4CAF50; color: white; padding: 2px 5px; border-radius: 3px;'
    }, 'transform-coordinator unlock');
    
    // Check if we're in project creation mode - if so, don't restore previous transform
    const isCreatingProject = typeof sessionStorage !== 'undefined' && (
      sessionStorage.getItem('__creating_project') !== null ||
      sessionStorage.getItem('__new_project_needs_centering') !== null
    );
    
    if (isCreatingProject) {
      logger.info('[TRANSFORM COORDINATOR] 🚫 Skipping restoration transform - new project creation in progress', {
        timestamp: new Date().toISOString(),
        _style: 'background-color: #E91E63; color: white; padding: 2px 5px; border-radius: 3px;'
      }, 'transform-coordinator project-creation');
      
      return; // Exit early without applying old transform
    }
    
    // Only restore previous state if we're not creating a new project
    // and if the restoration transform exists and is recent
    if (this.restorationTransform && (Date.now() - this.restorationTimestamp < 10000)) {
      try {
        logger.info('[TRANSFORM COORDINATOR] 🔄 Restoring state restoration transform after unlock', {
          scale: this.restorationTransform.scale,
          x: this.restorationTransform.translate.x,
          y: this.restorationTransform.translate.y,
          age: (Date.now() - this.restorationTimestamp) + 'ms',
          _style: 'background-color: #FF9800; color: white; padding: 2px 5px; border-radius: 3px;'
        }, 'transform-coordinator restore state');
        
        // Try to apply directly to DOM
        const transformGroup = document.querySelector('.transform-group');
        if (transformGroup) {
          const transform = `translate(${this.restorationTransform.translate.x},${this.restorationTransform.translate.y}) scale(${this.restorationTransform.scale})`;
          transformGroup.setAttribute('transform', transform);
          
          // Set as initial transform
          this.initialTransform = this.restorationTransform;
          
          // Also try to update zoom behavior if accessible
          setTimeout(() => {
            // This will be handled by the transform-unlocked event
          }, 50);
        }
      } catch (error) {
        logger.error('Error restoring state restoration transform', { error }, 'transform-coordinator error');
      }
    }
    
    // Dispatch an event to notify that transform is unlocked
    try {
      window.dispatchEvent(new CustomEvent('transform-unlocked'));
    } catch {
      // Ignore errors
    }
  },
  
  // Check if transform is currently locked
  isTransformLocked(): boolean {
    // Check if lock has expired
    if (this.transformLocked && 
        Date.now() - this.transformLockTimestamp > this.transformLockDuration) {
      this.unlockTransform();
      return false;
    }
    
    return this.transformLocked;
  },
  
  // Start a centering operation
  startCentering(transform?: string): void {
    this.centeringInProgress = true;
    
    // Only update explicit transform if not locked or if we don't have one
    if (!this.isTransformLocked() || !this.explicitTransform) {
      this.explicitTransform = transform || null;
    }
    
    // Add flag to body for CSS and other components to detect
    document.body.setAttribute('data-transform-centering', 'true');
    
    logger.debug('Transform centering started', {
      hasExplicitTransform: !!this.explicitTransform,
      transformLocked: this.transformLocked
    }, 'transform-coordinator centering');
  },
  
  // End a centering operation
  endCentering(): void {
    this.centeringInProgress = false;
    
    // Only clear explicit transform if not locked
    if (!this.isTransformLocked()) {
      this.explicitTransform = null;
    }
    
    // Remove flag from body
    document.body.removeAttribute('data-transform-centering');
    
    logger.debug('Transform centering ended', {
      transformLocked: this.transformLocked
    }, 'transform-coordinator centering');
  },
  
  // Set initial transform for new projects and lock it
  setInitialTransform(transform: { scale: number; translate: { x: number; y: number } }, lock: boolean = true, isProjectSwitch: boolean = false): void {
    // Check if we're creating a new project
    const isCreatingProject = typeof sessionStorage !== 'undefined' && (
      sessionStorage.getItem('__creating_project') !== null ||
      sessionStorage.getItem('__new_project_needs_centering') !== null
    );
    
    // For new project creation, prioritize the provided transform and clear any restoration transform
    if (isCreatingProject) {
      logger.info('[TRANSFORM COORDINATOR] 🆕 New project creation detected - using provided transform', {
        scale: transform.scale,
        x: transform.translate.x,
        y: transform.translate.y,
        timestamp: new Date().toISOString(),
        _style: 'background-color: #9C27B0; color: white; padding: 2px 5px; border-radius: 3px;'
      }, 'transform-coordinator project-creation');
      
      // Clear any restoration transform to prevent it from being applied later
      this.restorationTransform = null;
      
      // Continue with the provided transform for the new project
    }
    // Check if this is a project switch and we should honor saved state
    else if (isProjectSwitch) {
      // During project switching, we should check if there's a saved state first
      try {
        // Use a synchronous approach instead of dynamic imports to maintain return type
        const savedState = this.getSavedViewportState();
        if (savedState) {
          logger.info('[TRANSFORM COORDINATOR] 🔄 Project switch detected with saved state', {
            savedScale: savedState.scale,
            savedX: savedState.translate.x, 
            savedY: savedState.translate.y,
            proposedScale: transform.scale,
            proposedX: transform.translate.x, 
            proposedY: transform.translate.y,
            timestamp: new Date().toISOString(),
            _style: 'background-color: #FF9800; color: white; padding: 2px 5px; border-radius: 3px;'
          }, 'transform-coordinator project-switch');
          
          // Use the saved state instead
          transform = savedState;
          
          // Store this as restoration transform
          this.restorationTransform = savedState;
          this.restorationTimestamp = Date.now();
        }
      } catch {
        // Ignore errors and continue with provided transform
      }
    }
    
    this.initialTransform = transform;
    
    // Create transform string
    const transformStr = `translate(${transform.translate.x}, ${transform.translate.y}) scale(${transform.scale})`;
    
    // Set as explicit transform
    this.explicitTransform = transformStr;
    
    // Store in session storage for faster retrieval and persistence across page transitions
    try {
      sessionStorage.setItem('__initial_transform', JSON.stringify(transform));
    } catch {
      // Ignore storage errors
    }
    
    // Add transform to data attribute for immediate access in CSS
    document.documentElement.style.setProperty('--initial-transform-x', `${transform.translate.x}px`);
    document.documentElement.style.setProperty('--initial-transform-y', `${transform.translate.y}px`);
    document.documentElement.style.setProperty('--initial-transform-scale', transform.scale.toString());
    
    // Add an svg-specific transform attribute for direct application
    const svg = document.querySelector('svg');
    if (svg) {
      svg.setAttribute('data-transform-x', transform.translate.x.toString());
      svg.setAttribute('data-transform-y', transform.translate.y.toString());
      svg.setAttribute('data-transform-scale', transform.scale.toString());
    }
    
    // Add a specific class to body for style targeting
    document.body.classList.add('has-explicit-transform');
    
    // Log with distinctive styling for debugging
    logger.info('[TRANSFORM COORDINATOR] 📊 Initial transform set', {
      scale: transform.scale,
      x: transform.translate.x,
      y: transform.translate.y,
      transformLock: lock,
      explicitTransform: transformStr,
      isProjectSwitch,
      timestamp: new Date().toISOString(),
      _style: 'background-color: #9C27B0; color: white; padding: 2px 5px; border-radius: 3px;'
    }, 'transform-coordinator initialization');
    
    // Lock the transform if requested, but with shorter duration for project switches
    if (lock) {
      const lockDuration = isProjectSwitch ? 3000 : 8000; // Shorter lock time for project switches
      this.lockTransform(lockDuration);
    }
    
    // Apply the transform directly to any existing transform group
    try {
      const transformGroup = document.querySelector('.transform-group');
      if (transformGroup) {
        transformGroup.setAttribute('transform', transformStr);
        transformGroup.setAttribute('data-locked-transform', 'true');
        
        // Also store as a data attribute for debugging
        transformGroup.setAttribute('data-explicit-transform', 'true');
        transformGroup.setAttribute('data-transform-timestamp', Date.now().toString());
        
        if (isProjectSwitch) {
          transformGroup.setAttribute('data-project-switch', 'true');
        }
      }
    } catch (error) {
      logger.warn('Error applying transform directly to group', { error }, 'transform-coordinator error');
    }
  },
  
  // Helper method to access saved viewport state - using a synchronous approach now
  getSavedViewportState(): { scale: number; translate: { x: number; y: number } } | null {
    try {
      // Instead of dynamic import which causes type issues, try to access from window if available
      if (typeof window !== 'undefined' && window.__zoomHookState) {
        const savedState = window.__zoomHookState;
        if (savedState && typeof savedState.scale === 'number' && 
            savedState.translate && typeof savedState.translate.x === 'number' && 
            typeof savedState.translate.y === 'number') {
          return savedState;
        }
      }
    } catch (error) {
      logger.warn('Error accessing saved viewport state', { error }, 'transform-coordinator error');
    }
    return null;
  },
  
  // Get the initial transform
  getInitialTransform(): { scale: number; translate: { x: number; y: number } } | null {
    // If we have it in memory, return it
    if (this.initialTransform) {
      return this.initialTransform;
    }
    
    // Otherwise try to get from session storage
    try {
      const stored = sessionStorage.getItem('__initial_transform');
      if (stored) {
        const parsed = JSON.parse(stored);
        this.initialTransform = parsed;
        return parsed;
      }
    } catch {
      // Ignore storage errors
    }
    
    return null;
  },
  
  // Check if centering is in progress
  isCenteringInProgress(): boolean {
    return this.centeringInProgress;
  },
  
  // Get the explicit transform that should be used
  getExplicitTransform(): string | null {
    return this.explicitTransform;
  },
  
  // Set an explicit transform that should not be overridden
  setExplicitTransform(transform: string, lock: boolean = false): void {
    // Only update if not locked or force lock requested
    if (!this.isTransformLocked() || lock) {
      this.explicitTransform = transform;
      
      // Extract scale and translate values for state restoration if needed
      try {
        const scaleMatch = transform.match(/scale\(([^)]+)\)/);
        const translateMatch = transform.match(/translate\(([^,]+),\s*([^)]+)\)/);
        
        if (scaleMatch && translateMatch) {
          const scale = parseFloat(scaleMatch[1]);
          const x = parseFloat(translateMatch[1]);
          const y = parseFloat(translateMatch[2]);
          
          // Store as restoration transform if this is marked as a restoration
          if (lock) {
            this.restorationTransform = {
              scale: scale,
              translate: { x, y }
            };
            this.restorationTimestamp = Date.now();
            
            logger.info('[TRANSFORM COORDINATOR] 🔐 Explicit transform set with lock', {
              transform,
              scale,
              x,
              y,
              storedAsRestoration: true,
              timestamp: new Date().toISOString(),
              _style: 'background-color: #E91E63; color: white; padding: 2px 5px; border-radius: 3px;'
            }, 'transform-coordinator explicit lock');
          }
        }
      } catch {
        // Ignore parsing errors
      }
      
      if (lock) {
        this.lockTransform();
      }
      
      logger.debug('Transform explicitly set', { 
        transform,
        transformLocked: this.transformLocked || lock
      }, 'transform-coordinator explicit');
    } else {
      logger.warn('Transform update ignored due to active lock', {
        existingTransform: this.explicitTransform,
        attemptedTransform: transform
      }, 'transform-coordinator lock');
    }
  },
  
  // Store transform from state restoration
  setRestorationTransform(transform: { scale: number; translate: { x: number; y: number } }): void {
    this.restorationTransform = transform;
    this.restorationTimestamp = Date.now();
    
    logger.info('[TRANSFORM COORDINATOR] 💾 State restoration transform stored', {
      scale: transform.scale,
      x: transform.translate.x,
      y: transform.translate.y,
      timestamp: new Date().toISOString(),
      _style: 'background-color: #00BCD4; color: white; padding: 2px 5px; border-radius: 3px;'
    }, 'transform-coordinator restore state');
    
    // Apply to initial transform as well for consistency
    this.initialTransform = transform;
  }
};

// Ensure it's globally available
if (typeof window !== 'undefined') {
  window.__transformCoordinator = transformCoordinator;
}

// Hook state type is now included in the main Window interface above