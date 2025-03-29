'use client';

import React, { useEffect, useState, useRef } from 'react';
import { logger } from '@/lib/client/logger';
import { forceApplySavedState } from '../hooks/useZoom';
import { getSavedViewportState } from '../hooks/useZoom';
import { isStateBeingRestored } from '@/app/preload-state';

// Declare saveWorkspaceState on Window interface
declare global {
  interface Window {
    saveWorkspaceState?: () =>void;
  }
}

interface TransformSynchronizerProps {
  children: React.ReactNode;
}

/**
 * Component that ensures transforms are correctly applied before showing content
 * This is critical for preventing visual jumps during initial loading
 */
export const TransformSynchronizer: React.FC<TransformSynchronizerProps>= ({ children }) =>{
  const [isReady, setIsReady] = useState(false);
  const attemptsRef = useRef(0);
  const transformReadyRef = useRef(false);
  const maxAttemptsRef = useRef(25); // Increased max attempts for better reliability
  const startTimeRef = useRef(Date.now());
  
  useEffect(() =>{
    // Function to confirm transform is correctly applied
    const verifyTransform = async () =>{
      try {
        attemptsRef.current++;
        
        // Log distinctive marker for TransformSynchronizer operations
        if (attemptsRef.current === 1) {
          logger.info('Starting transform verification', { 
            attempt: attemptsRef.current,
            timestamp: new Date().toISOString(),
            stateBeingRestored: isStateBeingRestored(),
            _style: 'background-color: #673AB7; color: white; padding: 2px 5px; border-radius: 3px;'
          }, 'transform-sync initialization');
        }

        // Check if transform group exists
        const transformGroup = document.querySelector('.transform-group');
        if (!transformGroup) {
          // If no transform group yet and we've tried too many times, show content anyway
          if (attemptsRef.current >maxAttemptsRef.current) {
            logger.warn('TransformSynchronizer: No transform group found after multiple attempts, showing content anyway', {
              attempts: attemptsRef.current,
              elapsedTime: Date.now() - startTimeRef.current + 'ms'
            }, 'transform-sync fallback');
            setIsReady(true);
            return;
          }
          
          // Check if this is a new project - we need special handling
          let isNewProject = false;
          try {
            const newProjectFlag = sessionStorage.getItem('__new_project_needs_centering');
            isNewProject = !!newProjectFlag;
            
            if (isNewProject) {
              logger.info('TransformSynchronizer: Detected new project flag, will ensure proper initialization', {}, 'transform-sync project');
            }
          } catch {
            // Ignore errors checking flag
          }
          
          // Check if we're in state restoration mode
          const inStateRestoration = isStateBeingRestored();
          
          // Try again with exponential backoff (faster for new projects)
          const delay = isNewProject 
            ? Math.min(20 * Math.pow(1.2, attemptsRef.current - 1), 200)
            : inStateRestoration
              ? Math.min(20 * Math.pow(1.1, attemptsRef.current - 1), 150) // Even faster during state restoration
              : Math.min(40 * Math.pow(1.4, attemptsRef.current - 1), 400);
          
          logger.debug('TransformSynchronizer: Transform group not found, retrying', {
            attempt: attemptsRef.current,
            delay,
            isNewProject,
            inStateRestoration
          }, 'transform-sync retry');
          
          setTimeout(verifyTransform, delay);
          return;
        }

        // Check if transform is applied
        const transform = transformGroup.getAttribute('transform');
        if (!transform) {
          // Apply saved state if available
          const savedState = getSavedViewportState();
          if (savedState) {
            // Validate state values
            if (isNaN(savedState.scale) || isNaN(savedState.translate.x) || isNaN(savedState.translate.y)) {
              logger.warn('TransformSynchronizer: Invalid values in saved state, fixing', {
                original: savedState
              }, 'transform-sync error');
              
              // Fix NaN values
              savedState.scale = isNaN(savedState.scale) ? 1 : savedState.scale;
              savedState.translate.x = isNaN(savedState.translate.x) ? 0 : savedState.translate.x;
              savedState.translate.y = isNaN(savedState.translate.y) ? 0 : savedState.translate.y;
            }
            
            // Check if this is a project switch
            const isProjectSwitch = document.body.classList.contains('project-switching') || 
                                   sessionStorage.getItem('__project_switch_in_progress') === 'true';
            
            // Apply transform directly
            const transformStr = `translate(${savedState.translate.x}, ${savedState.translate.y}) scale(${savedState.scale})`;
            transformGroup.setAttribute('transform', transformStr);
            
            logger.info('TransformSynchronizer: Applied transform from saved state', {
              x: savedState.translate.x,
              y: savedState.translate.y,
              scale: savedState.scale,
              attempt: attemptsRef.current,
              isProjectSwitch
            }, 'transform-sync state');
            
            // Mark as ready after applying transform
            transformReadyRef.current = true;
            
            // Try to apply transform through the API as well for redundancy
            try {
              const svg = document.querySelector('svg');
              if (svg && typeof forceApplySavedState === 'function') {
                // Pass isProjectSwitch flag to signal this could be during a project switch
                forceApplySavedState(false, isProjectSwitch);
                logger.debug('TransformSynchronizer: Used forceApplySavedState for redundancy', {
                  isProjectSwitch
                }, 'transform-sync state');
                
                // If this is a project switch, also update the transform coordinator
                if (isProjectSwitch) {
                  try {
                    const coordinator = (window as Window & { 
                      __transformCoordinator?: { 
                        setInitialTransform: (transform: { scale: number; translate: { x: number; y: number } }) => void 
                      } 
                    }).__transformCoordinator;
                    if (coordinator && typeof coordinator.setInitialTransform === 'function') {
                      coordinator.setInitialTransform(savedState, true, true);
                      logger.debug('TransformSynchronizer: Updated transform coordinator for project switch', {}, 'transform-sync state');
                    }
                  } catch (coordError) {
                    logger.warn('TransformSynchronizer: Error updating transform coordinator', {
                      error: String(coordError)
                    }, 'transform-sync error');
                  }
                }
              }
            } catch (applyError) {
              logger.warn('TransformSynchronizer: Error applying saved state via API', {
                error: String(applyError)
              }, 'transform-sync error');
            }
            
            // Small delay to ensure transform is rendered
            setTimeout(() =>{
              logger.info('Transform verification complete', { 
                attempt: attemptsRef.current,
                elapsedTime: Date.now() - startTimeRef.current + 'ms',
                fromSavedState: true,
                x: savedState.translate.x,
                y: savedState.translate.y,
                scale: savedState.scale,
                _style: 'background-color: #4CAF50; color: white; padding: 2px 5px; border-radius: 3px;'
              }, 'transform-sync complete');
              
              setIsReady(true);
            }, 50);
            return;
          }
          
          // If no saved state, use default transform and show content
          logger.info('TransformSynchronizer: No saved state, showing content with default transform', {
            attempt: attemptsRef.current
          }, 'transform-sync state');
          
          logger.info('Transform verification complete', { 
            attempt: attemptsRef.current,
            elapsedTime: Date.now() - startTimeRef.current + 'ms',
            fromSavedState: false,
            usingDefault: true,
            _style: 'background-color: #4CAF50; color: white; padding: 2px 5px; border-radius: 3px;'
          }, 'transform-sync complete');
          
          setIsReady(true);
          return;
        }
        
        // If transform exists, verify it matches saved state
        const savedState = getSavedViewportState();
        if (savedState) {
          const currentTransform = parseTransform(transform);
          
          // Check if values are significantly different
          const isXCorrect = Math.abs(currentTransform.translate.x - savedState.translate.x)< 1;
          const isYCorrect = Math.abs(currentTransform.translate.y - savedState.translate.y)< 1;
          const isScaleCorrect = Math.abs(currentTransform.scale - savedState.scale)< 0.01;
          
          // Check if this is a project switch
          const isProjectSwitch = document.body.classList.contains('project-switching') || 
                                 sessionStorage.getItem('__project_switch_in_progress') === 'true';
          
          if (!isXCorrect || !isYCorrect || !isScaleCorrect) {
            // Apply correct transform
            logger.warn('TransformSynchronizer: Transform mismatch, applying saved state', {
              current: currentTransform,
              expected: savedState,
              attempt: attemptsRef.current
            }, 'transform-sync state');
            
            // Apply correct transform
            const transformStr = `translate(${savedState.translate.x}, ${savedState.translate.y}) scale(${savedState.scale})`;
            transformGroup.setAttribute('transform', transformStr);
            
            // Try to apply transform through the API as well for redundancy
            try {
              const svg = document.querySelector('svg');
              if (svg && typeof forceApplySavedState === 'function') {
                forceApplySavedState(false, isProjectSwitch);
                logger.debug('TransformSynchronizer: Used forceApplySavedState for redundancy', {
                  isProjectSwitch
                }, 'transform-sync state');
              }
            } catch (applyError) {
              logger.warn('TransformSynchronizer: Error applying saved state via API', {
                error: String(applyError)
              }, 'transform-sync error');
            }
          } else {
            logger.info('TransformSynchronizer: Transform is correctly applied', {
              attempt: attemptsRef.current,
              scale: currentTransform.scale,
              x: currentTransform.translate.x, 
              y: currentTransform.translate.y
            }, 'transform-sync state');
          }
          
          transformReadyRef.current = true;
        }
        
        // Content is ready to be shown
        logger.info('Transform verification complete', { 
          attempt: attemptsRef.current,
          elapsedTime: Date.now() - startTimeRef.current + 'ms',
          transform: transform,
          _style: 'background-color: #4CAF50; color: white; padding: 2px 5px; border-radius: 3px;'
        }, 'transform-sync complete');
        
        setIsReady(true);
        
        // Dispatch an event to signal transform is ready
        window.dispatchEvent(new CustomEvent('transform-sync-ready', {
          detail: {
            timestamp: Date.now(),
            transform: transform
          }
        }));
      } catch (error) {
        logger.error('TransformSynchronizer: Error verifying transform', { 
          error: String(error),
          attempt: attemptsRef.current
        }, 'transform-sync error');
        
        // After multiple errors, just show content
        if (attemptsRef.current >5) {
          logger.warn('TransformSynchronizer: Too many errors, showing content anyway', {
            attempts: attemptsRef.current
          }, 'transform-sync fallback');
          setIsReady(true);
        } else {
          setTimeout(verifyTransform, 50);
        }
      }
    };
    
    // Start verification process
    verifyTransform();
    
    // Fallback to show content if verification takes too long
    const fallbackTimeout = setTimeout(() =>{
      if (!isReady) {
        logger.info('TransformSynchronizer: Fallback timeout reached, showing content', {
          elapsedTime: Date.now() - startTimeRef.current + 'ms'
        }, 'transform-sync fallback');
        
        // Try one last time to apply saved state
        try {
          const transformGroup = document.querySelector('.transform-group');
          const savedState = getSavedViewportState();
          
          if (transformGroup && savedState) {
            // Apply transform directly
            const transformStr = `translate(${savedState.translate.x}, ${savedState.translate.y}) scale(${savedState.scale})`;
            transformGroup.setAttribute('transform', transformStr);
            
            logger.info('TransformSynchronizer: Applied transform in fallback', {
              x: savedState.translate.x,
              y: savedState.translate.y,
              scale: savedState.scale
            }, 'transform-sync fallback');
          }
        } catch (fallbackError) {
          logger.error('Error applying transform in fallback', {
            error: String(fallbackError)
          }, 'transform-sync error');
        }
        
        setIsReady(true);
      }
    }, 5000);
    
    // Listen for state restoration events
    const handleRestorationPhaseChange = (event: CustomEvent) =>{
      if (event.detail?.phase === 'complete' && !isReady) {
        logger.info('TransformSynchronizer: State restoration completed, showing content', {}, 'transform-sync restoration');
        setIsReady(true);
      }
    };
    
    window.addEventListener('restoration-phase-changed', handleRestorationPhaseChange as EventListener);
    
    return () =>{
      clearTimeout(fallbackTimeout);
      window.removeEventListener('restoration-phase-changed', handleRestorationPhaseChange as EventListener);
    };
  }, [isReady]);
  
  // Simplified style handling
  const containerStyle = {
    opacity: isReady ? 1 : 0,
    transition: 'opacity 0.2s ease-out',
    position: 'relative' as const,
    width: '100%',
    height: '100%'
  };
  
  // Return children when ready, otherwise return loading indicator
  return (<>{/* Hide children completely until ready */}<div style={containerStyle}>{children}</div>{/* Loading indicator */}
      {!isReady && (<div className="absolute inset-0 flex items-center justify-center bg-white z-50"><div className="loading-spinner"></div></div>)}</>);
};

/**
 * Parse transform string into scale and translation components
 */
const parseTransform = (transform: string): { scale: number; translate: { x: number; y: number } } =>{
  const result = {
    scale: 1,
    translate: { x: 0, y: 0 }
  };
  
  try {
    // Extract scale
    const scaleMatch = transform.match(/scale\(([^)]+)\)/);
    if (scaleMatch && scaleMatch[1]) {
      const scale = parseFloat(scaleMatch[1]);
      result.scale = isNaN(scale) ? 1 : scale;
    }
    
    // Extract translation
    const translateMatch = transform.match(/translate\(([^,]+),\s*([^)]+)\)/);
    if (translateMatch && translateMatch[1] && translateMatch[2]) {
      const x = parseFloat(translateMatch[1]);
      const y = parseFloat(translateMatch[2]);
      result.translate.x = isNaN(x) ? 0 : x;
      result.translate.y = isNaN(y) ? 0 : y;
    }
  } catch (error) {
    logger.error('Failed to parse transform', { 
      transform, 
      error: String(error)
    }, 'transform-sync error');
  }
  
  return result;
};

export default TransformSynchronizer;
