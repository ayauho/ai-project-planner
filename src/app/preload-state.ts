'use client';

import { useEffect } from 'react';
import { 
  getSavedViewportState, 
  setZoomInitialized, 
  globalZoomBehavior, 
  setSavedViewportState
} from '@/components/workspace/visual/hooks/useZoom';
// Import the problematic functions but don't use them directly
import * as useZoomModule from '@/components/workspace/visual/hooks/useZoom';
import { logger } from '@/lib/client/logger';
import { STORAGE_KEY, STORAGE_KEY_BASE } from '@/lib/workspace/persistence/constants';
import '../styles/state-restoration.css';
import { select } from 'd3-selection';
import { zoomIdentity } from 'd3-zoom';

// Create wrapper functions that will bypass TypeScript's strict type checking
function applySavedViewportState(svg: SVGSVGElement, isProjectSwitch?: boolean, highestPriority?: boolean): boolean {
  try {
    // Define a function type that matches the expected signature
    type ApplySavedViewportStateFn = (svg: SVGSVGElement, isProjectSwitch?: boolean, highestPriority?: boolean) => boolean;
    const fn = useZoomModule.applySavedViewportState as ApplySavedViewportStateFn;
    return fn(svg, isProjectSwitch, highestPriority) || false;
  } catch (error) {
    logger.error('Error in applySavedViewportState wrapper', { error: String(error) }, 'state-restoration');
    return false;
  }
}

function forceApplySavedState(skipSavingCurrentState?: boolean, isProjectSwitch?: boolean): void {
  try {
    // Define a function type that matches the expected signature
    type ForceApplySavedStateFn = (skipSavingCurrentState?: boolean, isProjectSwitch?: boolean) => void;
    const fn = useZoomModule.forceApplySavedState as ForceApplySavedStateFn;
    return fn(skipSavingCurrentState, isProjectSwitch);
  } catch (error) {
    logger.error('Error in forceApplySavedState wrapper', { error: String(error) }, 'state-restoration');
  }
}

// Type definitions for window extensions
interface _TransformCoordinator {
  setRestorationTransform: (transform: ViewportState) => void;
  setInitialTransform: (transform: ViewportState, lock?: boolean, save?: boolean) => void;
}

interface ControlVisibilityManager {
  updateVisibility: () => void;
}

interface _CounterHandler {
  disableAllCounters: () => void;
}

interface ViewportState {
  scale: number;
  translate: {
    x: number;
    y: number;
  };
}

interface WorkspaceState {
  viewport: ViewportState;
  projectId?: string;
  selectedTaskId?: string;
  timestamp?: number;
}

// Extend Window interface
declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    __transformCoordinator?: any; // Must use any to match existing declarations elsewhere
    controlVisibilityManager?: ControlVisibilityManager;
    saveWorkspaceState?: () => void;
  }
}

// Global flag to track restoration state
export const STATE_PHASES = {
  IDLE: 'idle',
  LOADING: 'loading',
  POSITIONING: 'positioning',
  REVEALING: 'revealing',
  COMPLETE: 'complete'
};

// Global state tracking
let currentPhase = STATE_PHASES.IDLE;
let restorationTimestamp = 0;
let elementsPending = 0;
let elementsRevealed = 0;

/**
 * Get the current restoration phase
 */
export function getRestorationPhase(): string {
  return currentPhase;
}

/**
 * Check if state is currently being restored
 */
export function isStateBeingRestored(): boolean {
  return currentPhase !== STATE_PHASES.IDLE && currentPhase !== STATE_PHASES.COMPLETE;
}

/**
 * Track element for restoration (used internally)
 */
export function trackRestorableElement(): void {
  if (isStateBeingRestored()) {
    elementsPending++;
    
    // Log tracking periodically to avoid excessive logging
    if (elementsPending === 1 || elementsPending % 10 === 0) {
      logger.debug('Tracking restorable element', {
        elementsPending,
        phase: currentPhase
      }, 'state-restoration');
    }
  }
}

/**
 * Mark an element as ready to reveal
 */
export function markElementPositioned(): void {
  if (isStateBeingRestored() && elementsPending > 0) {
    elementsPending--;
    
    // Log progress periodically to avoid excessive logging
    if (elementsPending === 0 || elementsPending % 5 === 0) {
      logger.debug('Element positioned, elements pending', {
        elementsPending,
        phase: currentPhase
      }, 'state-restoration');
    }
    
    // If all elements are ready and we're in positioning phase, move to revealing phase
    if (elementsPending === 0 && currentPhase === STATE_PHASES.POSITIONING) {
      logger.info('All elements positioned, moving to reveal phase', {
        timestamp: new Date().toISOString()
      }, 'state-restoration ui');
      startRevealPhase();
    }
  }
}

/**
 * Begin the positioning phase - apply viewport transform but keep elements invisible
 */
export function beginPositioningPhase(): void {
  if (currentPhase !== STATE_PHASES.LOADING) {
    logger.debug('Cannot begin positioning phase from current phase', {
      currentPhase,
      expectedPhase: STATE_PHASES.LOADING
    }, 'state-restoration');
    return;
  }
  
  try {
    logger.info('[STATE RESTORATION] 📐 Beginning positioning phase', { 
      timestamp: new Date().toISOString(),
      phase: 'POSITIONING',
      elementsPending,
      _style: 'background-color: #3F51B5; color: white; padding: 2px 5px; border-radius: 3px;'
    }, 'state-restoration ui');
    
    logger.info('Starting positioning phase of state restoration', {
      elementsPending,
      timestamp: new Date().toISOString(),
      phaseDuration: Date.now() - restorationTimestamp + 'ms'
    }, 'state-restoration ui');
    
    // This is critical - force application of saved viewport state right at the beginning
    // of the positioning phase. No delays or timeouts that might cause flicker.
    const svg = document.querySelector('svg');
    if (svg) {
      try {
        // Get saved viewport state and validate
        const savedState = getSavedViewportState();
        if (savedState) {
          // Validate state values before applying
          if (isNaN(savedState.scale) || isNaN(savedState.translate.x) || isNaN(savedState.translate.y)) {
            logger.warn('Invalid values in saved viewport state, fixing before apply', {
              original: savedState
            }, 'state-restoration viewport');
            
            // Fix NaN values
            savedState.scale = isNaN(savedState.scale) ? 1 : savedState.scale;
            savedState.translate.x = isNaN(savedState.translate.x) ? 0 : savedState.translate.x;
            savedState.translate.y = isNaN(savedState.translate.y) ? 0 : savedState.translate.y;
            
            // Update the saved state with fixed values
            setSavedViewportState(savedState);
            
            logger.debug('Fixed saved viewport state before applying', {
              scale: savedState.scale,
              x: savedState.translate.x,
              y: savedState.translate.y
            }, 'state-restoration viewport');
          }
          
          logger.info('[STATE RESTORATION] 📌 Applying saved viewport with highest priority', { 
            scale: savedState.scale,
            x: savedState.translate.x,
            y: savedState.translate.y,
            timestamp: new Date().toISOString(),
            phase: 'positioning',
            _style: 'background-color: #F44336; color: white; padding: 2px 5px; border-radius: 3px;'
          }, 'state-restoration viewport transform');
          
          // Use our wrapper function
          try {
            // Use true for isProjectSwitch and true for highestPriority
            const applied = applySavedViewportState(svg as SVGSVGElement, true, true);
            
            logger.info('Applied saved viewport during positioning phase with highest priority', { 
              applied,
              timestamp: new Date().toISOString(),
              viewportState: savedState
            }, 'state-restoration viewport');
          } catch (importError) {
            // If our wrapper fails, log the error
            logger.error('Error using wrapper function for applySavedViewportState', {
              error: String(importError)
            }, 'state-restoration viewport');
          }
          
          // Also ensure transform coordinator is updated
          try {
            const coordinator = window.__transformCoordinator;
            if (coordinator && typeof coordinator.setRestorationTransform === 'function') {
              coordinator.setRestorationTransform(savedState);
              logger.info('Updated transform coordinator with restoration state', {
                scale: savedState.scale,
                x: savedState.translate.x,
                y: savedState.translate.y
              }, 'state-restoration transform');
            }
          } catch (coordError) {
            logger.warn('Error updating transform coordinator', {
              error: String(coordError)
            }, 'state-restoration transform');
          }
        } else {
          logger.warn('No saved viewport state found during positioning phase', {}, 'state-restoration viewport');
        }
      } catch (applyError) {
        logger.error('Error applying saved viewport state', {
          error: String(applyError),
          phase: 'positioning'
        }, 'state-restoration viewport');
      }
    } else {
      logger.warn('SVG element not found during positioning phase', {}, 'state-restoration ui');
    }
    
    // Update phase
    currentPhase = STATE_PHASES.POSITIONING;
    document.body.classList.remove('sr-loading');
    document.body.classList.add('sr-positioning');
    
    // Dispatch phase change event
    window.dispatchEvent(new CustomEvent('restoration-phase-changed', {
      detail: { 
        phase: 'positioning',
        timestamp: Date.now(),
        elementsPending
      }
    }));
    
    // Try again to apply saved state after a small delay
    // (doubles as a backup if first attempt failed)
    setTimeout(() =>{
      try {
        const svg = document.querySelector('svg');
        if (svg) {
          try {
            // Use our wrapper function
            forceApplySavedState(false, true);
            logger.debug('Applied saved viewport state with force and project switch flag (backup attempt)', {}, 'state-restoration viewport');
          } catch (importError) {
            // If our wrapper fails, log the error
            logger.error('Error using wrapper function for forceApplySavedState', {
              error: String(importError)
            }, 'state-restoration viewport');
          }
        } else {
          logger.warn('SVG element not found during backup positioning attempt', {}, 'state-restoration ui');
        }
        
        // If no elements are pending, move straight to reveal phase
        if (elementsPending === 0) {
          logger.info('No elements pending, moving directly to reveal phase', {}, 'state-restoration ui');
          startRevealPhase();
        } else {
          logger.debug('Waiting for elements to be positioned', {
            elementsPending
          }, 'state-restoration ui');
        }
      } catch (error) {
        logger.error('Error during backup positioning attempt', {
          error: String(error)
        }, 'state-restoration viewport');
        
        // Still move to reveal phase if a critical error occurred
        startRevealPhase();
      }
    }, 50);
  } catch (error) {
    logger.error('Error beginning positioning phase', { 
      error: String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, 'state-restoration');
    completeStateRestoration();
  }
}

/**
 * Start the reveal phase - make elements visible with transitions
 */
function startRevealPhase(): void {
  if (currentPhase !== STATE_PHASES.POSITIONING) {
    logger.debug('Cannot start reveal phase from current phase', {
      currentPhase,
      expectedPhase: STATE_PHASES.POSITIONING
    }, 'state-restoration');
    return;
  }
  
  try {
    logger.info('[STATE RESTORATION] 🎭 Starting reveal phase', { 
      timestamp: new Date().toISOString(),
      phase: 'REVEALING',
      elementsPending,
      _style: 'background-color: #3F51B5; color: white; padding: 2px 5px; border-radius: 3px;'
    }, 'state-restoration ui');
    
    currentPhase = STATE_PHASES.REVEALING;
    
    // Ensure transform is correctly applied and locked before revealing elements
    try {
      // Final transform checkpoint before revealing
      const transformGroup = document.querySelector('.transform-group');
      if (transformGroup) {
        const transformStr = transformGroup.getAttribute('transform');
        if (transformStr) {
          logger.info('[STATE RESTORATION] 🔍 Verifying transform before reveal', { 
            transform: transformStr,
            timestamp: new Date().toISOString(),
            _style: 'background-color: #9C27B0; color: white; padding: 2px 5px; border-radius: 3px;'
          }, 'state-restoration transform');
          
          // Extract values
          const scaleMatch = transformStr.match(/scale\(([^)]+)\)/);
          const translateMatch = transformStr.match(/translate\(([^,]+),\s*([^)]+)\)/);
          
          if (scaleMatch && translateMatch) {
            const scale = parseFloat(scaleMatch[1]);
            const x = parseFloat(translateMatch[1]);
            const y = parseFloat(translateMatch[2]);
            
            // Store in transform coordinator with lock
            try {
              const coordinator = window.__transformCoordinator;
              if (coordinator && typeof coordinator.setInitialTransform === 'function') {
                logger.info('Locking transform before revealing elements', {
                  scale, x, y
                }, 'state-restoration transform');
                
                // Lock the transform with short duration
                coordinator.setInitialTransform({
                  scale: scale,
                  translate: { x, y }
                }, true, false);
              }
            } catch (coordError) {
              logger.warn('Error locking transform before reveal', {
                error: String(coordError)
              }, 'state-restoration transform');
            }
          }
        }
      }
    } catch (transformError) {
      logger.warn('Error verifying transform before reveal', {
        error: String(transformError)
      }, 'state-restoration transform');
    }
    
    // Add reveal class to body to enable transitions
    document.body.classList.remove('sr-positioning');
    document.body.classList.add('sr-revealing');
    
    // Dispatch phase change event
    window.dispatchEvent(new CustomEvent('restoration-phase-changed', {
      detail: { 
        phase: 'revealing',
        timestamp: Date.now()
      }
    }));
    
    // Find all elements with pending class
    const pendingElements = document.querySelectorAll('.sr-pending');
    const totalElements = pendingElements.length;
    
    logger.info('Elements to reveal', {
      count: totalElements,
      timestamp: new Date().toISOString()
    }, 'state-restoration ui');
    
    // Skip if no elements to reveal
    if (totalElements === 0) {
      logger.info('No elements to reveal, completing restoration immediately', {}, 'state-restoration ui');
      completeStateRestoration();
      return;
    }
    
    // Function to handle element reveal completion
    const handleRevealComplete = (elementType?: string) => {
      elementsRevealed++;
      
      // Log progress periodically to avoid excessive logging
      if (elementsRevealed === 1 || 
          elementsRevealed === totalElements || 
          elementsRevealed % Math.max(1, Math.floor(totalElements / 10)) === 0) {
        
        logger.debug('Element reveal progress', {
          revealed: elementsRevealed,
          total: totalElements,
          percentage: Math.round((elementsRevealed / totalElements) * 100) + '%',
          elementType
        }, 'state-restoration ui');
      }
      
      if (elementsRevealed >= totalElements) {
        // All elements revealed, complete restoration
        logger.info('All elements revealed, completing restoration', {
          totalElements,
          timestamp: new Date().toISOString()
        }, 'state-restoration ui');
        completeStateRestoration();
      }
    };
    
    // Object to track different element types for debugging
    const elementTypes: Record<string, number> = {};
    
    // Reveal elements with staggered timing
    pendingElements.forEach((el, index) => {
      // Track element type for debugging
      let elementType = 'unknown';
      if (el.classList.contains('task-rect')) elementType = 'task';
      else if (el.classList.contains('project-rect')) elementType = 'project';
      else if (el.classList.contains('counter-display') || el.classList.contains('project-counter')) elementType = 'counter';
      else if (el.classList.contains('connection-line')) elementType = 'connection';
      
      // Track element types
      elementTypes[elementType] = (elementTypes[elementType] || 0) + 1;
      
      // Add transition end listener
      el.addEventListener('transitionend', function onTransitionEnd(event: Event) {
        try {
          const transEvent = event as TransitionEvent;
          if (event.target === el && transEvent.propertyName === 'opacity') {
            handleRevealComplete(elementType);
            el.removeEventListener('transitionend', onTransitionEnd);
          }
        } catch (error) {
          // Ensure we still count the element even if there's an error
          logger.error('Error in transition end handler', {
            error: String(error),
            elementType
          }, 'state-restoration ui');
          handleRevealComplete(elementType);
          el.removeEventListener('transitionend', onTransitionEnd);
        }
      }, { once: true });
      
      // Staggered reveal with small delay between elements
      setTimeout(() => {
        try {
          // Remove pending class and add ready class
          el.classList.remove('sr-pending');
          el.classList.add('sr-ready');
          
          // Make properly visible
          (el as HTMLElement).style.opacity = '1';
          (el as HTMLElement).style.visibility = 'visible';
          
          // Ensure counters are non-interactive
          if (el.classList.contains('counter-display') || 
              el.classList.contains('project-counter') || 
              el.getAttribute('data-project-counter') === 'true') {
            (el as HTMLElement).style.pointerEvents = 'none';
          }
        } catch (error) {
          logger.error('Error revealing element', {
            error: String(error),
            index,
            elementType
          }, 'state-restoration ui');
          
          // Still count as revealed even if there's an error
          handleRevealComplete(elementType);
        }
      }, Math.min(10, 1000 / totalElements) * index); // Stagger but ensure complete within 1 second
    });
    
    // Log summary of element types
    logger.info('Element types to reveal', { elementTypes }, 'state-restoration ui');
    
    // Fallback in case transition events don't fire
    const fallbackTimeout = setTimeout(() => {
      if (currentPhase === STATE_PHASES.REVEALING) {
        logger.warn('Reveal phase timeout exceeded, forcing completion', {
          elementsRevealed,
          totalElements,
          remaining: totalElements - elementsRevealed
        }, 'state-restoration ui');
        completeStateRestoration();
      }
    }, 3000); // Increased timeout for more reliability
    
    // Also listen for an explicit event to force completion
    const forceCompleteHandler = () => {
      if (currentPhase === STATE_PHASES.REVEALING) {
        logger.info('Force complete event received during reveal phase', {}, 'state-restoration');
        clearTimeout(fallbackTimeout);
        completeStateRestoration();
      }
    };
    
    window.addEventListener('force-state-restoration-complete', forceCompleteHandler, { once: true });
    
  } catch (error) {
    logger.error('Error during reveal phase', { 
      error: String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, 'state-restoration');
    completeStateRestoration();
  }
}

/**
 * Complete the state restoration process
 */
function completeStateRestoration(): void {
  try {
    if (currentPhase === STATE_PHASES.COMPLETE) {
      logger.debug('State restoration already completed, ignoring duplicate call', {}, 'state-restoration');
      return;
    }
    
    logger.info('[STATE RESTORATION] ✅ Completing state restoration', { 
      timestamp: new Date().toISOString(),
      phase: 'COMPLETE',
      duration: Date.now() - restorationTimestamp + 'ms',
      _style: 'background-color: #4CAF50; color: white; padding: 2px 5px; border-radius: 3px;'
    }, 'state-restoration ui');  
    
    // Clean up classes
    document.body.classList.remove('sr-loading', 'sr-positioning', 'sr-revealing');
    
    // Make sure all elements are visible
    const pendingElements = document.querySelectorAll('.sr-pending');
    if (pendingElements.length >0) {
      logger.warn('Found pending elements during completion phase', {
        count: pendingElements.length
      }, 'state-restoration ui');
      
      pendingElements.forEach(el =>{
        el.classList.remove('sr-pending');
        el.classList.add('sr-ready');
        (el as HTMLElement).style.opacity = '1';
        (el as HTMLElement).style.visibility = 'visible';
      });
    }
    
    // Add stabilization class to indicate the workspace is in a stable state
    // This helps prevent pan/zoom issues during the transition from restoration to normal operation
    document.body.classList.add('transform-stable');
    
    // Remove any lingering initialization and interaction prohibition classes
    document.body.classList.remove('transform-initializing', 'transform-interaction-prohibited');
    
    // Reset flags
    currentPhase = STATE_PHASES.COMPLETE;
    elementsPending = 0;
    elementsRevealed = 0;
    
    // Dispatch completion event
    window.dispatchEvent(new CustomEvent('workspace-state-restored', {
      detail: {
        timestamp: Date.now(),
        duration: Date.now() - restorationTimestamp
      }
    }));
    
    // Dispatch phase change event
    window.dispatchEvent(new CustomEvent('restoration-phase-changed', {
      detail: { 
        phase: 'complete',
        timestamp: Date.now()
      }
    }));
    
    // Force final transform application with highest priority
    // This is the LAST and DEFINITIVE transform application
    setTimeout(() => {
      try {
        // Get transform from the DOM
        const transformGroup = document.querySelector('.transform-group');
        if (transformGroup) {
          const transformStr = transformGroup.getAttribute('transform');
          if (transformStr) {
            logger.info('[STATE RESTORATION] 🔒 Final transform application', { 
              transform: transformStr,
              timestamp: new Date().toISOString(),
              finalStage: true,
              _style: 'background-color: #E91E63; color: white; padding: 2px 5px; border-radius: 3px;'
            }, 'state-restoration transform');
            
            // Extract values for more reliable processing
            const scaleMatch = transformStr.match(/scale\(([^)]+)\)/);
            const translateMatch = transformStr.match(/translate\(([^,]+),\s*([^)]+)\)/);
            
            if (scaleMatch && translateMatch) {
              const scale = parseFloat(scaleMatch[1]);
              const x = parseFloat(translateMatch[1]);
              const y = parseFloat(translateMatch[2]);
              
              // Store in transform coordinator as restoration transform
              try {
                const coordinator = window.__transformCoordinator;
                if (coordinator && typeof coordinator.setRestorationTransform === 'function') {
                  coordinator.setRestorationTransform({
                    scale: scale,
                    translate: { x, y }
                  });
                  
                  logger.info('Stored final transform in coordinator', {
                    scale, x, y
                  }, 'state-restoration transform');
                }
              } catch (coordError) {
                logger.warn('Error storing transform in coordinator', {
                  error: String(coordError)
                }, 'state-restoration transform');
              }
              
              // Force application to both DOM and zoom behavior
              const svg = document.querySelector('svg');
              if (svg && globalZoomBehavior) {
                try {
                  // Create transform
                  const finalTransform = zoomIdentity
                    .translate(x, y)
                    .scale(scale);
                  
                  // Use our wrapper function
                  (async () => {
                    try {
                      // Use existing wrapper function
                      if (typeof applySavedViewportState === 'function') {
                        const applied = applySavedViewportState(svg as SVGSVGElement, true, true);
                        
                        logger.info('Applied final definitive transform via saved viewport', {
                          scale, x, y, applied, forced: true
                        }, 'state-restoration transform');
                      } else {
                        // Fallback - apply directly to zoom behavior
                        select(svg).call(globalZoomBehavior.transform, finalTransform);
                        logger.info('Applied final transform directly to zoom behavior', {
                          scale, x, y
                        }, 'state-restoration transform');
                      }
                    } catch (importError) {
                      logger.error('Error during final transform application (import)', {
                        error: String(importError)
                      }, 'state-restoration transform');
                      
                      // Fallback - apply directly to zoom behavior
                      select(svg).call(globalZoomBehavior.transform, finalTransform);
                    }
                  })();
                } catch (error) {
                  logger.error('Error applying final transform', {
                    error: String(error),
                    transform: transformStr
                  }, 'state-restoration transform');
                }
              }
            }
          }
        }
      } catch (finalError) {
        logger.error('Error during final transform application', {
          error: String(finalError)
        }, 'state-restoration transform');
      }
    }, 50);
    
    // For redundancy, also sync zoom behavior with DOM transform
    setTimeout(() =>{
      try {
        const svg = document.querySelector('svg');
        if (svg) {
          // Use sync function
          (async () => {
            try {
              // Define a sync function that doesn't depend on imports
              const syncDOMWithZoom = () => {
                if (svg && globalZoomBehavior) {
                  const transformGroup = select('.transform-group');
                  if (!transformGroup.empty()) {
                    // Use our wrapper function
                    applySavedViewportState(svg as SVGSVGElement, true, true);
                    logger.info('Synced zoom behavior with DOM transform using wrapper function', {}, 'state-restoration transform');
                    return true;
                  }
                }
                return false;
              };
              
              if (syncDOMWithZoom()) {
                return;
              }
              
              // Fallback manual sync if the function isn't available
              const transformGroup = select('.transform-group');
              if (!transformGroup.empty() && globalZoomBehavior) {
                // Get current transform from DOM
                const transformStr = transformGroup.attr('transform') || '';
                if (transformStr) {
                  // Parse transform
                  const result = {
                    scale: 1,
                    translate: { x: 0, y: 0 }
                  };
                  
                  // Extract scale
                  const scaleMatch = transformStr.match(/scale\(([^)]+)\)/);
                  if (scaleMatch && scaleMatch[1]) {
                    const scale = parseFloat(scaleMatch[1]);
                    result.scale = isNaN(scale) ? 1 : scale;
                  }
                  
                  // Extract translation
                  const translateMatch = transformStr.match(/translate\(([^,]+),\s*([^)]+)\)/);
                  if (translateMatch && translateMatch[1] && translateMatch[2]) {
                    const x = parseFloat(translateMatch[1]);
                    const y = parseFloat(translateMatch[2]);
                    result.translate.x = isNaN(x) ? 0 : x;
                    result.translate.y = isNaN(y) ? 0 : y;
                  }
                  
                  logger.info('Final sync of zoom behavior with DOM transform (fallback method)', {
                    scale: result.scale,
                    x: result.translate.x,
                    y: result.translate.y
                  }, 'state-restoration transform');
                  
                  // Create transform
                  const finalTransform = zoomIdentity
                    .translate(result.translate.x, result.translate.y)
                    .scale(result.scale);
                    
                  // Apply transform to zoom behavior
                  select(svg).call(globalZoomBehavior.transform, finalTransform);
                }
              }
            } catch (importError) {
              logger.warn('Error during zoom synchronization', {
                error: String(importError)
              }, 'state-restoration transform');
            }
          })();
        }
      } catch (syncError) {
        logger.error('Error syncing zoom behavior during completion', {
          error: String(syncError)
        }, 'state-restoration transform');
      }
    }, 100);

    // Force overlap detection update
    setTimeout(() => {
      try {
        const controlVisibilityManager = window.controlVisibilityManager;
        if (typeof controlVisibilityManager?.updateVisibility === 'function') {
          controlVisibilityManager.updateVisibility();
          logger.debug('Updated control visibility after state restoration', {}, 'state-restoration ui');
        }
        
        // Make sure counters are non-interactive
        try {
          // Use dynamic import instead of require
          (async () => {
            try {
              const counterModule = await import('@/lib/client/visual/utils/counter-handler');
              const counterHandler = counterModule.counterHandler;
              if (typeof counterHandler?.disableAllCounters === 'function') {
                counterHandler.disableAllCounters();
                logger.debug('Disabled all counters after state restoration', {}, 'state-restoration ui');
              }
            } catch (importError) {
              // Log the error with the logger
              logger.debug('Could not load counter handler', {
                error: String(importError)
              }, 'state-restoration ui');
            }
          })();
        } catch (handlerError) {
          // Log the error with the logger
          logger.debug('Error handling counters', {
            error: String(handlerError)
          }, 'state-restoration ui');
        }
      } catch (visibilityError) {
        logger.error('Error updating control visibility during completion', {
          error: String(visibilityError)
        }, 'state-restoration ui');
      }
    }, 200);
    
    // Trigger state save after a delay to ensure everything is settled
    setTimeout(() => {
      try {
        if (typeof window.saveWorkspaceState === 'function') {
          logger.debug('Saving workspace state after restoration complete', {}, 'state-restoration');
          window.saveWorkspaceState();
        }
      } catch (saveError) {
        logger.error('Error saving workspace state after restoration', {
          error: String(saveError)
        }, 'state-restoration');
      }
    }, 500);
    
  } catch (error) {
    logger.error('Error completing state restoration', { 
      error: String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, 'state-restoration');
    
    // Force reset of state
    currentPhase = STATE_PHASES.COMPLETE;
    document.body.classList.remove('sr-loading', 'sr-positioning', 'sr-revealing');
  }
}

/**
 * Start the state restoration process
 */
export function beginStateRestoration(): void {
  if (currentPhase !== STATE_PHASES.IDLE) {
    logger.debug('State restoration already in progress, ignoring duplicate request', {
      currentPhase
    }, 'state-restoration');
    return;
  }
  
  try {
    // Mark start time
    restorationTimestamp = Date.now();
    
    // Update state
    currentPhase = STATE_PHASES.LOADING;
    elementsPending = 0;
    elementsRevealed = 0;
    
    // Add distinctive console log for easier debugging
    logger.info('[STATE RESTORATION] 🔄 Beginning state restoration process', { 
      timestamp: new Date().toISOString(),
      phase: 'LOADING',
      _style: 'background-color: #3F51B5; color: white; padding: 2px 5px; border-radius: 3px;'
    }, 'state-restoration ui');
    
    // Add class to body to disable transitions during loading
    document.body.classList.add('sr-loading');
    
    // Pre-load the saved state
    const savedState = getSavedViewportState();
    if (savedState) {
      // Validate state values
      if (isNaN(savedState.scale) || isNaN(savedState.translate.x) || isNaN(savedState.translate.y)) {
        logger.warn('Invalid values in saved viewport state, fixing', {
          original: savedState
        }, 'state-restoration viewport');
        
        // Fix NaN values
        savedState.scale = isNaN(savedState.scale) ? 1 : savedState.scale;
        savedState.translate.x = isNaN(savedState.translate.x) ? 0 : savedState.translate.x;
        savedState.translate.y = isNaN(savedState.translate.y) ? 0 : savedState.translate.y;
        
        logger.debug('Fixed saved viewport state', {
          scale: savedState.scale,
          x: savedState.translate.x,
          y: savedState.translate.y
        }, 'state-restoration viewport');
      }
      
      logger.info('Pre-loaded saved viewport state for restoration', {
        scale: savedState.scale,
        x: savedState.translate.x,
        y: savedState.translate.y
      }, 'state-restoration viewport');
    } else {
      logger.info('No saved viewport state found for restoration', {}, 'state-restoration viewport');
    }
    
    // Dispatch event for state restoration beginning
    window.dispatchEvent(new CustomEvent('state-restoration-begin', {
      detail: {
        phase: 'loading',
        timestamp: Date.now()
      }
    }));
    
    // Move to positioning phase after a short delay
    setTimeout(() => {
      beginPositioningPhase();
    }, 50);
    
    // Fallback to complete after timeout
    setTimeout(() => {
      if (currentPhase !== STATE_PHASES.COMPLETE) {
        logger.warn('State restoration timed out, forcing completion', {
          phaseDuration: Date.now() - restorationTimestamp + 'ms',
          currentPhase
        }, 'state-restoration');
        completeStateRestoration();
      }
    }, 10000);
    
  } catch (error) {
    logger.error('Error beginning state restoration', { 
      error: String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, 'state-restoration');
    completeStateRestoration();
  }
}

/**
 * Preloads saved state when the application starts
 */
export function usePreloadState(): void {
  // Function to complete state preload once we have valid state
  const completeStatePreload = (state: WorkspaceState) => {
    if (!state) return;
    
    // Start restoration process
    beginStateRestoration();
    
    // Store the selected task ID for restoration
    if (state.selectedTaskId) {
      // Add extra task ID recognition for split tasks
      // This helps with tracking task ID consistency for newly split tasks
      if (state.selectedTaskId.includes('child-') || 
          state.selectedTaskId.includes('split-') ||
          state.selectedTaskId.includes('subtask-')) {
        const taskIdAttr = `data-split-task-${state.selectedTaskId}`;
        document.body.setAttribute(taskIdAttr, 'true');
        
        logger.debug('Marked split task ID for tracking', { 
          taskId: state.selectedTaskId 
        }, 'state-restoration');
        
        // Clean up after a while
        setTimeout(() => {
          document.body.removeAttribute(taskIdAttr);
        }, 30000);
      }
    }
    
    // Set viewport state for later application
    setSavedViewportState(state.viewport);
    
    // Force early retrieval of saved viewport state for confirmation
    const savedState = getSavedViewportState();
    if (savedState) {
      logger.info('Preloaded saved viewport state', {
        scale: savedState.scale,
        x: savedState.translate.x,
        y: savedState.translate.y
      }, 'state-restoration viewport');
    }
    
    // Reset zoom initialized flag to ensure clean initialization
    setZoomInitialized(false);
  };

  useEffect(() => {
    try {
      // Check if this is a new user's first visit
      const isNewUser = sessionStorage.getItem('__new_user_first_visit');
      if (isNewUser) {
        logger.info('New user first visit detected, skipping state preload', {}, 'state-restoration');
        // Remove the flag after using it
        sessionStorage.removeItem('__new_user_first_visit');
        return;
      }
      
      // IMPORTANT: Check if we're creating a new project
      // If so, skip loading previous state
      const creatingProjectTimestamp = sessionStorage.getItem('__creating_new_project');
      const isCreatingNewProject = !!creatingProjectTimestamp;
      
      if (isCreatingNewProject) {
        // Only skip preload if creation is recent (within last 30 seconds)
        // This prevents a stale flag from blocking state restoration
        const timestamp = parseInt(creatingProjectTimestamp || '0');
        const now = Date.now();
        const isRecent = (now - timestamp) < 30000; // 30 seconds
        
        if (isRecent) {
          logger.info('Creating new project, skipping state preload', {
            creationTimestamp: timestamp,
            ageInSeconds: (now - timestamp) / 1000
          }, 'state-restoration project');
          return;
        } else {
          // Clean up stale flag
          logger.info('Found stale project creation flag, removing it', {
            creationTimestamp: timestamp,
            ageInSeconds: (now - timestamp) / 1000
          }, 'state-restoration project');
          sessionStorage.removeItem('__creating_new_project');
        }
      }

      // Check if there's saved state to restore
      // Try to find any state keys
      let foundState = false;
      let fullState: WorkspaceState | null = null;
      
      // Check main state first
      const savedData = localStorage.getItem(STORAGE_KEY);
      if (savedData) {
        try {
          const parsedData = JSON.parse(savedData);
          if (parsedData && parsedData.viewport && parsedData.projectId) {
            // We'll check if the project exists during the actual project loading
            // Here, we just preload the state for better performance
            foundState = true;
            fullState = parsedData;
            
            logger.info('Found global state to preload', {
              projectId: parsedData.projectId,
              timestamp: parsedData.timestamp ? new Date(parsedData.timestamp).toISOString() : 'unknown',
              hasSelectedTask: !!parsedData.selectedTaskId
            }, 'state-restoration');
            
            // Continue with state restoration if state is valid
            if (fullState) {
              completeStatePreload(fullState);
              
              // Return early as we've initiated state preload
              return;
            }
          }
        } catch (error) {
          logger.error('Error parsing main saved state', { error }, 'state-restoration');
        }
      }
      
      
      // If no state found yet, check for project-specific states
      if (!foundState && typeof localStorage !== 'undefined') {
        const projectKeyPrefix = STORAGE_KEY_BASE + '-project-';
        
        // Find the most recent project state
        let mostRecentState: WorkspaceState | null = null;
        let mostRecentTimestamp = 0;
        
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith(projectKeyPrefix)) {
            try {
              const itemData = localStorage.getItem(key);
              if (itemData) {
                const parsedItem = JSON.parse(itemData);
                if (parsedItem && parsedItem.viewport && parsedItem.timestamp) {
                  if (parsedItem.timestamp > mostRecentTimestamp) {
                    mostRecentTimestamp = parsedItem.timestamp;
                    mostRecentState = parsedItem;
                  }
                }
              }
            } catch (error) {
              logger.error('Error parsing project state', { key, error }, 'state-restoration');
            }
          }
        }
        
        if (mostRecentState) {
          foundState = true;
          fullState = mostRecentState;
          logger.info('Found most recent project state to preload', {
            projectId: mostRecentState.projectId,
            timestamp: mostRecentState.timestamp ? new Date(mostRecentState.timestamp).toISOString() : 'unknown',
            hasSelectedTask: !!mostRecentState.selectedTaskId
          }, 'state-restoration');
          
          // Initialize preload with this state if it's valid
          if (fullState) {
            completeStatePreload(fullState);
          }
        }
      }      
      // If we get here, it means we either didn't find state or we're still checking
      // We'll handle state preload in the fetch promise if we found a state to check
      if (!foundState) {
        logger.debug('No saved state to preload', {}, 'state-restoration');
      }} catch (error) {
      logger.error('Error during state preload', { error: String(error) }, 'state-restoration');
      completeStateRestoration();
    }
  }, []);
}

/**
 * Client Component that uses the preload hook
 */
export const PreloadState = () => {
  usePreloadState();
  return null;
};