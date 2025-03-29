'use client';

import { useCallback, useRef, useEffect, useState } from 'react';
import { zoom as d3zoom, ZoomTransform, zoomIdentity, ZoomBehavior } from 'd3-zoom';
import { select } from 'd3-selection';
import { logger } from '@/lib/client/logger';
import { layerManager } from '../services/layer-manager';
import { MIN_ZOOM, MAX_ZOOM, DEFAULT_ZOOM_SCALE } from '@/lib/client/layout/constants';
import { STORAGE_KEY } from '@/lib/workspace/persistence/constants';
import { getRestorationPhase, isStateBeingRestored } from '@/app/preload-state';
import { transformCoordinator } from '@/lib/client/debug/transform-coordinator';

// Declare global saveWorkspaceState method for TypeScript
  const _initializeZoom = (svgElement: SVGSVGElement, _dimensions: { width: number; height: number }, _options?: { isProjectSwitch?: boolean }) => {
    if (!svgElement || zoomInitialized) {
      return { isInitialized: zoomInitialized, currentTransform: null };
    }
    
    // Set a data attribute for mobile detection
    if (window.innerWidth <= 768) {
      document.body.setAttribute('data-mobile-view', 'true');
      svgElement.setAttribute('data-mobile-view', 'true');
    } else {
      document.body.removeAttribute('data-mobile-view');
      svgElement.removeAttribute('data-mobile-view');
    }
}

// Global reference to the zoom behavior
export let globalZoomBehavior: ZoomBehavior<SVGSVGElement, unknown>| null = null;

// Flag to prevent zoom behavior from being re-initialized when already restored from state
export let zoomInitialized = false;

// Store for the saved viewport state
export let savedViewportState: {
  scale: number;
  translate: { x: number; y: number };
} | null = null;

// Flag to track if the saved state has been applied
let savedStateApplied = false;

// Flag to completely prevent any default transforms when saved state exists
let preventDefaultTransform = false;

// Track if the user is actively dragging
export let isDragging = false;

// Track when the transform was last manually applied (to solve jump issues)
let lastManualTransformApplied = 0;

// The timeout to clear the dragging state
let draggingTimeout: NodeJS.Timeout | null = null;

// Flag to detect initial DOM manipulation
let initialDomManipulationDone = false;

/**
 * Set the dragging state and update body class for styling
 */
export function setDraggingState(dragging: boolean): void {
  // Skip during state restoration
  if (isStateBeingRestored()) return;

  // Update global state
  isDragging = dragging;

  // Update body class for CSS transitions
  if (dragging) {
    document.body.classList.add('is-dragging');

    // Clear any existing timeout
    if (draggingTimeout) {
      clearTimeout(draggingTimeout);
      draggingTimeout = null;
    }
  } else {
    // Use a small delay before removing the class to prevent flickering
    draggingTimeout = setTimeout(() =>{
      document.body.classList.remove('is-dragging');
      draggingTimeout = null;

      // Save state after dragging ends
      if (typeof window.saveWorkspaceState === 'function') {
        window.saveWorkspaceState();
      }
    }, 150);
  }
}

// Load saved state immediately when module is imported
if (typeof window !== 'undefined') {
  try {
    const savedData = localStorage.getItem(STORAGE_KEY);
    if (savedData) {
      const parsedData = JSON.parse(savedData);
      if (parsedData && parsedData.viewport) {
        savedViewportState = parsedData.viewport;

        // If we have a saved state, prevent default transform application entirely
        preventDefaultTransform = true;

        // Check that savedViewportState is not null before logging
        if (savedViewportState) {
          logger.info('Pre-loaded viewport state immediately:', {
            scale: savedViewportState.scale, 
            translate: savedViewportState.translate,
            preventDefaultTransform
          }, 'hooks zoom state');
        }
      }
    }
  } catch (error) {
    logger.error('Failed to pre-load viewport state', { error: String(error) }, 'hooks zoom error');
  }
}

/**
 * Set zoom initialized state
 */
export function setZoomInitialized(value: boolean): void {
  zoomInitialized = value;
  logger.debug('Zoom initialized state set', { zoomInitialized: value }, 'hooks zoom');
}

/**
 * Set saved viewport state
 */
export function setSavedViewportState(state: {
  scale: number;
  translate: { x: number; y: number };
} | null): void {
  savedViewportState = state;
  // Reset the applied flag when setting a new state
  savedStateApplied = false;

  // If we have a saved state, prevent default transform application
  if (state) {
    preventDefaultTransform = true;
  }

  logger.debug('Saved viewport state updated', {
    scale: state?.scale,
    x: state?.translate.x,
    y: state?.translate.y,
    preventDefaultTransform
  }, 'hooks zoom state');
}

/**
 * Get saved viewport state
 */
export function getSavedViewportState(): {
  scale: number;
  translate: { x: number; y: number };
} | null {
  try {
    // Check if transform is locked - if so, prioritize coordinator state
    if (transformCoordinator.isTransformLocked && typeof transformCoordinator.isTransformLocked === 'function' && transformCoordinator.isTransformLocked()) {
      const initialTransform = transformCoordinator.getInitialTransform();
      if (initialTransform) {
        logger.info('Using locked transform from coordinator', {
          scale: initialTransform.scale,
          x: initialTransform.translate.x,
          y: initialTransform.translate.y,
          locked: true
        }, 'hooks zoom transform');
        return initialTransform;
      }
    }

    // If we have a state from the transform coordinator (even if not locked), use that
    const initialTransform = transformCoordinator.getInitialTransform();
    if (initialTransform) {
      logger.debug('Using transform from coordinator as saved state', {
        scale: initialTransform.scale,
        x: initialTransform.translate.x,
        y: initialTransform.translate.y
      }, 'hooks zoom transform');
      return initialTransform;
    }

    // Check if we're creating a new project
    const isCreatingProject = typeof sessionStorage !== 'undefined' && sessionStorage.getItem('__creating_project') !== null;
    if (isCreatingProject) {
      // During project creation, don't use saved state from localStorage
      logger.debug('Skipping saved state during project creation', {}, 'hooks zoom state');
      return null;
    }

    // Otherwise use the saved state
    if (savedViewportState) {
      return savedViewportState;
    }

    // Try to get saved state from localStorage
    if (typeof window !== 'undefined') {
      const savedData = localStorage.getItem(STORAGE_KEY);
      if (savedData) {
        const parsedData = JSON.parse(savedData);
        if (parsedData && parsedData.viewport) {
          savedViewportState = parsedData.viewport;

          // If we have a saved state, prevent default transform application
          preventDefaultTransform = true;

          logger.debug('Retrieved saved viewport state', { 
            scale: parsedData.viewport.scale,
            x: parsedData.viewport.translate.x,
            y: parsedData.viewport.translate.y,
            preventDefaultTransform
          }, 'hooks zoom state');
          return parsedData.viewport;
        }
      }
    }
    return null;
  } catch (error) {
    logger.error('Failed to get saved viewport state', { error }, 'hooks zoom error');
    return null;
  }
}

/**
 * Parse transform string into components
 */
function parseTransform(transformStr: string): { x: number; y: number; k: number } {
  const defaults = { x: 0, y: 0, k: 1 };

  if (!transformStr) return defaults;

  // Parse translate values
  const translateMatch = transformStr.match(/translate\(([^,]+),\s*([^)]+)\)/);
  const x = translateMatch ? parseFloat(translateMatch[1]) : defaults.x;
  const y = translateMatch ? parseFloat(translateMatch[2]) : defaults.y;

  // Parse scale value
  const scaleMatch = transformStr.match(/scale\(([^)]+)\)/);
  const k = scaleMatch ? parseFloat(scaleMatch[1]) : defaults.k;

  return { 
    x: isNaN(x) ? defaults.x : x, 
    y: isNaN(y) ? defaults.y : y, 
    k: isNaN(k) ? defaults.k : k 
  };
}

/**
 * Get current transform from DOM
 */
export function getCurrentTransform(): ZoomTransform {
  const transformGroup = select('.transform-group');
  if (transformGroup.empty()) {
    return zoomIdentity;
  }

  const transformStr = transformGroup.attr('transform') || '';
  const { x, y, k } = parseTransform(transformStr);

  // Create a new transform with extracted values
  return zoomIdentity.translate(x, y).scale(k);
}

/**
 * Synchronize zoom behavior with current DOM transform 
 */
export function syncZoomWithTransform(svg: SVGSVGElement | null): void {
  if (!svg || !globalZoomBehavior) return;

  try {
    const svgSelection = select(svg);
    const currentTransform = getCurrentTransform();

    logger.debug('Syncing zoom with DOM transform', {
      transform: currentTransform.toString()
    }, 'hooks zoom transform');

    // Directly apply transform to zoom behavior
    // This is critical to prevent "jumps" when zooming/panning
    svgSelection.call(globalZoomBehavior.transform, currentTransform);

    // Mark that we manually applied the transform
    lastManualTransformApplied = Date.now();

    // Save state after sync
    setTimeout(() =>{
      if (typeof window.saveWorkspaceState === 'function') {
        window.saveWorkspaceState();
      }
    }, 300);
  } catch (error) {
    logger.error('Failed to sync zoom with transform', { error }, 'hooks zoom error');
  }
}

/**
 * Directly apply a transform to both DOM and zoom behavior
 * @param svg The SVG element to apply the transform to
 * @param transform The transform to apply
 * @param force Whether to force application even if transform is locked
 */
export function applyTransform(svg: SVGSVGElement, transform: ZoomTransform, force: boolean = false): void {
  if (!svg) return;

  // Check if transform is locked and we're not forcing application
  if (!force && transformCoordinator.isTransformLocked && typeof transformCoordinator.isTransformLocked === 'function' && transformCoordinator.isTransformLocked()) {
    logger.info('Transform is locked, skipping application (use force=true to override)', {}, 'hooks zoom transform');
    return;
  }

  try {
    logger.info('[TRANSFORM STATE] ⚡ applyTransform called', { 
      transform: transform.toString(),
      scale: transform.k,
      x: transform.x,
      y: transform.y,
      force,
      timestamp: new Date().toISOString(),
      caller: new Error().stack?.split('\n')[2]?.trim(),
      _style: 'background-color: #E91E63; color: white; padding: 2px 5px; border-radius: 3px;'
    }, 'hooks zoom transform');

    const svgSelection = select(svg);

    // Apply directly to DOM first for immediate visual update
    const transformGroup = select('.transform-group');
    if (!transformGroup.empty()) {
      transformGroup.attr('transform', transform.toString());

      // For forced applications, mark the transform as locked
      if (force) {
        transformGroup.attr('data-forced-transform', 'true');
        transformGroup.attr('data-forced-timestamp', Date.now().toString());
      }
    }

    // Then apply to zoom behavior if initialized - crucial for future interactions
    if (globalZoomBehavior) {
      svgSelection.call(globalZoomBehavior.transform, transform);
    }

    // Mark that we manually applied the transform
    lastManualTransformApplied = Date.now();

    logger.debug('Applied transform to DOM and zoom behavior', {
      transform: transform.toString(),
      scale: transform.k,
      x: transform.x,
      y: transform.y,
      force
    }, 'hooks zoom transform');

    // Update transform coordinator for truly forced applications
    if (force) {
      try {
        const coordinator = (window as { __transformCoordinator?: { 
          setExplicitTransform: (transform: string, force?: boolean) => void 
        } }).__transformCoordinator;
        if (coordinator && typeof coordinator.setExplicitTransform === 'function') {
          coordinator.setExplicitTransform(transform.toString(), true);
        }
      } catch (_) { // eslint-disable-line unused-imports/no-unused-vars
        // Ignore errors with transform coordinator
      }
    }

    // For forced applications, save immediately
    // For non-forced, save after a delay to avoid excessive saves
    if (force) {
      if (typeof window.saveWorkspaceState === 'function') {
        window.saveWorkspaceState();
      }
    } else {
      setTimeout(() => {
        if (typeof window.saveWorkspaceState === 'function') {
          window.saveWorkspaceState();
        }
      }, 300);
    }
  } catch (error) {
    logger.error('Failed to apply transform', { 
      error: String(error),
      stack: error instanceof Error ? error.stack : undefined,
      transform: transform.toString() 
    }, 'hooks zoom error');
  }
}

/**
 * Apply saved viewport state directly to SVG elements
 * @param svg The SVG element to apply the transform to
 * @param isProjectSwitch Whether this is happening during a project switch
 * @param highestPriority Whether this operation should have highest priority
 * @returns boolean indicating if state was successfully applied
 */
export function applySavedViewportState(
  svg: SVGSVGElement, 
  isProjectSwitch: boolean = false, 
  highestPriority: boolean = false
): boolean {
  if (!svg) return false;

  // Add distinctive logging for transform tracking
  logger.info('[TRANSFORM STATE] 🔄 applySavedViewportState called', { 
    isProjectSwitch,
    highestPriority,
    timestamp: new Date().toISOString(),
    caller: new Error().stack?.split('\n')[2]?.trim(),
    _style: 'background-color: #FF9800; color: white; padding: 2px 5px; border-radius: 3px;'
  }, 'hooks zoom transform');

  // If highest priority is set, we apply a transform lock first
  if (highestPriority) {
    try {
      // Apply a transform lock to prevent overwrites
      const coordinator = (window as { __transformCoordinator?: { 
        lockTransform: (duration: number) => void 
      } }).__transformCoordinator;
      if (coordinator && typeof coordinator.lockTransform === 'function') {
        coordinator.lockTransform(3000); // Lock for 3 seconds
        logger.info('Applied transform lock for highest priority operation', {}, 'hooks zoom transform');
      }
    } catch (_) { // eslint-disable-line unused-imports/no-unused-vars
      // Ignore errors with transform coordinator
    }
  }

  // For project switches, we prioritize the saved state over the coordinator's initial transform
  if (isProjectSwitch) {
    // Get the saved state directly
    const savedState = getSavedViewportState();
    if (savedState) {
      try {
        logger.info('[TRANSFORM STATE] 📊 Project switch: applying saved state', {
          scale: savedState.scale,
          x: savedState.translate.x,
          y: savedState.translate.y,
          isProjectSwitch,
          highestPriority,
          _style: 'background-color: #4CAF50; color: white; padding: 2px 5px; border-radius: 3px;'
        }, 'hooks zoom transform');

        // Create transform from saved state
        const savedTransform = zoomIdentity
          .translate(savedState.translate.x, savedState.translate.y)
          .scale(savedState.scale);

        // Apply transform with force flag
        applyTransform(svg, savedTransform, true);

        // Mark as applied
        savedStateApplied = true;

        // When applying with highest priority, update CSS variables as well
        if (highestPriority) {
          document.documentElement.style.setProperty('--initial-transform-x', `${savedState.translate.x}px`);
          document.documentElement.style.setProperty('--initial-transform-y', `${savedState.translate.y}px`);
          document.documentElement.style.setProperty('--initial-transform-scale', savedState.scale.toString());
        }

        return true;
      } catch (error) {
        logger.error('Failed to apply saved state during project switch', { 
          error: String(error),
          stack: error instanceof Error ? error.stack : undefined
        }, 'hooks zoom error');
      }
    }
  }

  // For non-project switches or if saved state application failed, check coordinator transform
  const initialTransform = transformCoordinator.getInitialTransform();
  if (initialTransform) {
    try {
      logger.info('[TRANSFORM STATE] 📊 Applying coordinator transform', {
        scale: initialTransform.scale,
        x: initialTransform.translate.x,
        y: initialTransform.translate.y,
        isProjectSwitch,
        highestPriority,
        _style: 'background-color: #9C27B0; color: white; padding: 2px 5px; border-radius: 3px;'
      }, 'hooks zoom transform');

      // Set CSS variables for transform lock
      document.documentElement.style.setProperty('--initial-transform-x', `${initialTransform.translate.x}px`);
      document.documentElement.style.setProperty('--initial-transform-y', `${initialTransform.translate.y}px`);
      document.documentElement.style.setProperty('--initial-transform-scale', initialTransform.scale.toString());

      // Create transform from initial transform
      const transform = zoomIdentity
        .translate(initialTransform.translate.x, initialTransform.translate.y)
        .scale(initialTransform.scale);

      // Apply transform with force flag for highest priority
      applyTransform(svg, transform, highestPriority);

      // Mark as applied
      savedStateApplied = true;

      return true;
    } catch (error) {
      logger.error('Failed to apply initial transform', { 
        error: String(error),
        stack: error instanceof Error ? error.stack : undefined
      }, 'hooks zoom error');
    }
  }

  // Fall back to saved viewport state
  const savedState = getSavedViewportState();
  if (!savedState) return false;

  try {
    // Create transform from saved state
    const savedTransform = zoomIdentity
      .translate(savedState.translate.x, savedState.translate.y)
      .scale(savedState.scale);

    logger.info('[TRANSFORM STATE] 📊 Directly applying saved viewport state', {
      scale: savedState.scale,
      x: savedState.translate.x,
      y: savedState.translate.y,
      wasAppliedBefore: savedStateApplied,
      isProjectSwitch,
      highestPriority,
      _style: 'background-color: #2196F3; color: white; padding: 2px 5px; border-radius: 3px;'
    }, 'hooks zoom transform');

    // Apply transform with force flag for highest priority
    applyTransform(svg, savedTransform, highestPriority);

    // Mark as applied
    savedStateApplied = true;

    // Dispatch an event to notify that viewport state was applied
    window.dispatchEvent(new CustomEvent('viewport-state-applied', {
      detail: {
        scale: savedState.scale,
        translateX: savedState.translate.x,
        translateY: savedState.translate.y,
        highPriority: highestPriority
      }
    }));

    return true;
  } catch (error) {
    logger.error('Failed to apply saved viewport state', { 
      error: String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, 'hooks zoom error');
    return false;
  }
}

/**
 * Force application of saved state
 * @param saveCurrentFirst Whether to save current state before applying new state
 * @param isProjectSwitch Whether this is happening during a project switch
 * @returns boolean indicating if state was successfully applied
 */
export function forceApplySavedState(saveCurrentFirst: boolean = false, isProjectSwitch: boolean = false): boolean {
  logger.info('[TRANSFORM STATE] 🔍 forceApplySavedState called', { 
    saveCurrentFirst,
    isProjectSwitch,
    timestamp: new Date().toISOString(),
    caller: new Error().stack?.split('\n')[2]?.trim(),
    _style: 'background-color: #2196F3; color: white; padding: 2px 5px; border-radius: 3px;'
  }, 'hooks zoom transform');

  // Optionally save current state first
  if (saveCurrentFirst && typeof window.saveWorkspaceState === 'function') {
    logger.info('Saving current state before applying new state', {}, 'hooks zoom state');
    window.saveWorkspaceState();
  }

  // Find the SVG element
  const svg = document.querySelector('svg');
  if (!svg) return false;

  // For project switches, we always need to update the transform coordinator first
  if (isProjectSwitch) {
    try {
      const savedState = getSavedViewportState();
      if (savedState) {
        const coordinator = (window as { __transformCoordinator?: { 
          setInitialTransform: (state: { scale: number; translate: { x: number; y: number } }, force?: boolean, isProjectSwitch?: boolean) => void 
        } }).__transformCoordinator;
        if (coordinator && typeof coordinator.setInitialTransform === 'function') {
          logger.info('Updating transform coordinator for project switch', {
            savedState,
            isProjectSwitch: true
          }, 'hooks zoom transform');

          coordinator.setInitialTransform(savedState, true, true);
        }
      }
    } catch (error) {
      logger.warn('Error updating transform coordinator during forceApplySavedState', { 
        error: String(error),
        isProjectSwitch
      }, 'hooks zoom warning');
    }
  }

  // Apply saved state with highest priority
  return applySavedViewportState(svg as SVGSVGElement, isProjectSwitch, true);
}

/**
 * Pre-initialize SVG by applying saved transform directly to the DOM
 * This should be done before any React rendering occurs
 */
export function preInitializeSvg(svg: SVGSVGElement): void {
  if (!svg || initialDomManipulationDone) return;

  try {
    // First check if transform coordinator has an initial transform
    const initialTransform = transformCoordinator.getInitialTransform();
    if (initialTransform) {
      // Get transform group
      let transformGroup = select(svg).select('.transform-group');
      if (transformGroup.empty()) {
        // Use a two-step cast via 'unknown' to safely convert between D3 selection types
        transformGroup = select(svg).append('g').attr('class', 'transform-group') as unknown as typeof transformGroup;
      }

      // Apply transform directly
      const transform = `translate(${initialTransform.translate.x},${initialTransform.translate.y}) scale(${initialTransform.scale})`;
      transformGroup.attr('transform', transform);

      logger.info('Pre-initialized SVG with initial transform', {
        scale: initialTransform.scale,
        x: initialTransform.translate.x,
        y: initialTransform.translate.y
      }, 'hooks zoom transform');

      // Mark as applied and manipulated
      savedStateApplied = true;
      initialDomManipulationDone = true;

      return;
    }

    // Fall back to saved viewport state
    const savedState = getSavedViewportState();
    if (!savedState) return;

    // Create transform group if it doesn't exist
    let transformGroup = select(svg).select('.transform-group');
    if (transformGroup.empty()) {
      // Use a two-step cast via 'unknown' to safely convert between D3 selection types
      transformGroup = select(svg).append('g').attr('class', 'transform-group') as unknown as typeof transformGroup;
    }

    // Apply saved transform directly to DOM
    const transform = `translate(${savedState.translate.x},${savedState.translate.y}) scale(${savedState.scale})`;
    transformGroup.attr('transform', transform);

    logger.info('Pre-initialized SVG with saved transform', {
      scale: savedState.scale,
      x: savedState.translate.x,
      y: savedState.translate.y
    }, 'hooks zoom transform');

    // Mark as applied and manipulated
    savedStateApplied = true;
    initialDomManipulationDone = true;

    // Set CSS variable for the transform
    document.documentElement.style.setProperty('--saved-transform', transform);
  } catch (error) {
    logger.error('Failed to pre-initialize SVG', { error }, 'hooks zoom error');
  }
}

/**
 * Custom hook for zoom behavior management
 */
export function useZoom() {
  const zoomBehaviorRef = useRef<ZoomBehavior<SVGSVGElement, unknown>| null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const transformRef = useRef<ZoomTransform | null>(null);
  const initializedRef = useRef(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastTransformAppliedRef = useRef<string | null>(null); // Track the last transform applied
  const _stabilizationTimerRef = useRef<NodeJS.Timeout | null>(null); // Track stabilization timer

  /**
   * Initialize zoom behavior
   */
  const transformUnlockHandlerRef = useRef<((event: Event) =>void) | null>(null);

  // Reference to store the transform unlock handler
  const initializeZoom = useCallback((
    svgElement: SVGSVGElement, 
    dimensions: { width: number; height: number },
    options: { isProjectSwitch?: boolean } = {}
  ) =>{
    logger.info('[TRANSFORM STATE] 🚀 initializeZoom called', { 
      dimensions,
      isProjectSwitch: options.isProjectSwitch,
      timestamp: new Date().toISOString(),
      caller: new Error().stack?.split('\n')[2]?.trim(),
      _style: 'background-color: #673AB7; color: white; padding: 2px 5px; border-radius: 3px;'
    }, 'hooks zoom transform');

    // Create a handler for transform unlock events
    const handleTransformUnlock = () =>{
      logger.info('Transform unlock event received, refreshing zoom behavior', {}, 'hooks zoom transform');

      // Ensure zoom is properly initialized after unlock
      if (svgElement && zoomBehaviorRef.current) {
        try {
          // Re-apply zoom behavior to ensure it works
          select(svgElement).call(zoomBehaviorRef.current);

          // Force sync with current transform
          syncZoomWithTransform(svgElement);

          logger.info('Zoom behavior refreshed after transform unlock', {}, 'hooks zoom transform');
        } catch (error) {
          logger.error('Error refreshing zoom after transform unlock', { error }, 'hooks zoom error');
        }
      }
    };

    // Store the handler in the ref for cleanup
    transformUnlockHandlerRef.current = handleTransformUnlock;

    // Add event listener for transform unlock
    window.addEventListener('transform-unlocked', handleTransformUnlock);

    // Check if the transform group already exists and has a transform
    // This is important to avoid unnecessary transform applications
    const transformGroup = select(svgElement).select('.transform-group');
    const hasExistingTransform = !transformGroup.empty() && transformGroup.attr('transform');

    // Apply saved state directly to the DOM before zoom initialization
    // Only do this if there's no existing transform to avoid overwrites
    const savedState = getSavedViewportState();
    if (savedState && !savedStateApplied && !hasExistingTransform) {
      logger.info('[TRANSFORM STATE] 📝 Pre-initializing SVG with saved state', {
        scale: savedState.scale,
        x: savedState.translate.x,
        y: savedState.translate.y,
        hasExistingTransform,
        isProjectSwitch: options.isProjectSwitch,
        _style: 'background-color: #009688; color: white; padding: 2px 5px; border-radius: 3px;'
      }, 'hooks zoom transform');

      preInitializeSvg(svgElement);

      // If this is a project switch, update the transform coordinator with isProjectSwitch flag
      if (options.isProjectSwitch) {
        try {
          const coordinator = (window as { __transformCoordinator?: { 
            setInitialTransform: (state: { scale: number; translate: { x: number; y: number } }, force?: boolean, isProjectSwitch?: boolean) => void 
          } }).__transformCoordinator;
          if (coordinator && typeof coordinator.setInitialTransform === 'function') {
            logger.info('Informing transform coordinator about project switch', {
              savedState,
              isProjectSwitch: true
            }, 'hooks zoom transform');

            coordinator.setInitialTransform(savedState, true, true);
          }
        } catch (error) {
          logger.warn('Error updating transform coordinator during project switch', { error }, 'hooks zoom warning');
        }
      }
    } else if (hasExistingTransform) {
      logger.info('Skipping pre-initialization as transform group already has transform', {
        transform: transformGroup.attr('transform'),
        isProjectSwitch: options.isProjectSwitch
      }, 'hooks zoom transform');
    }

    // Prevent multiple initializations
    if (initializedRef.current && isInitialized && zoomInitialized && globalZoomBehavior) {
      logger.debug('Zoom already initialized, applying saved state if needed', {}, 'hooks zoom');
      // Only apply if not already applied and there's no existing transform
      if (!savedStateApplied && savedState && !hasExistingTransform) {
        logger.info('[TRANSFORM STATE] 🔄 Applying saved state after initialization', {
          scale: savedState.scale,
          x: savedState.translate.x,
          y: savedState.translate.y,
          isProjectSwitch: options.isProjectSwitch,
          _style: 'background-color: #795548; color: white; padding: 2px 5px; border-radius: 3px;'
        }, 'hooks zoom transform');
        applySavedViewportState(svgElement, options.isProjectSwitch, true);
      }

      // Even if already initialized, set up event listeners
      useEventListeners(svgElement);

      return;
    }

    // Skip initialization if we're still restoring state in early phases
    const isRestoring = isStateBeingRestored();
    const restorationPhase = getRestorationPhase();

    // When restoring in early phases, don't initialize zoom yet
    if (isRestoring && (restorationPhase === 'loading' || restorationPhase === 'idle')) {
      logger.debug('Skipping zoom initialization during early restoration phase', { phase: restorationPhase }, 'hooks zoom');
      return;
    }

    logger.info('Initializing zoom behavior', { 
      dimensions,
      hasExistingBehavior: !!globalZoomBehavior,
      restorationPhase: restorationPhase,
      isRestoring,
      preventDefaultTransform,
      savedStateApplied
    }, 'hooks zoom');

    const svg = select(svgElement);

    // Clear any existing zoom
    svg.on('.zoom', null);

    // Create new zoom behavior
    const zoom = d3zoom<SVGSVGElement, unknown>()
      .scaleExtent([MIN_ZOOM, MAX_ZOOM])
      .filter((event) => {
        // Allow wheel events, mouse events and touch events
        if (event.type === 'wheel' || event.type.startsWith('mouse') || event.type.startsWith('touch')) {
          // Only block if strictly locked
          if (document.body.classList.contains('transform-locked-strict')) {
            return false;
          }
          return !event.ctrlKey && !event.button;
        }
        return false;
      })
      // Enable proper zooming relative to cursor position
      .wheelDelta((event) => {
        // Use a consistent zoom speed regardless of browser
        return -event.deltaY * 0.001;
      })
      .on('start', () =>{
        if (isStateBeingRestored()) return;
        setDraggingState(true);
      })
      .on('start', (_event) =>{
        if (isStateBeingRestored()) return;

        // Force zoom readiness on first interaction
        if (document.body.hasAttribute('data-transform-locked')) {
          document.body.classList.add('zoom-interaction');
          document.body.classList.add('zoom-pan-enabled');
          document.body.classList.add('zoom-pan-ready');
          document.body.classList.remove('transform-locked-strict');
          document.body.classList.remove('has-explicit-transform');

          // Log the first interaction
          logger.info('First zoom interaction detected, enabling zoom immediately', {}, 'hooks zoom interaction');

          // Also call prepareForZoomPan if available
          if (transformCoordinator.prepareForZoomPan && 
              typeof transformCoordinator.prepareForZoomPan === 'function') {
            transformCoordinator.prepareForZoomPan();
          }
        }

        setDraggingState(true);
      })      .on('zoom', (event) =>{
        // Skip zoom events during state restoration
        if (isStateBeingRestored()) return;
        
        // Skip zoom events immediately after manual transform application
        if (Date.now() - lastManualTransformApplied < 100) {
          logger.debug('Skipping zoom event immediately after manual transform', {}, 'hooks zoom transform');
          return;
        }
        
        // Force zoom readiness on first zoom event
        if (document.body.hasAttribute('data-transform-locked')) {
          document.body.classList.add('zoom-interaction');
          document.body.classList.add('zoom-pan-enabled');
          document.body.classList.add('zoom-pan-ready');
          document.body.classList.remove('transform-locked-strict');
          document.body.classList.remove('has-explicit-transform');
        }
        
        // Skip only if strictly locked (with the special class)
        const isStrictlyLocked = document.body.classList.contains('transform-locked-strict');
        
        if (isStrictlyLocked && transformCoordinator.isTransformLocked && 
            typeof transformCoordinator.isTransformLocked === 'function' && 
            transformCoordinator.isTransformLocked()) {
          logger.debug('Skipping zoom event during strict transform lock', {}, 'hooks zoom transform');
          return;
        }
        
        // Mark the body as having had zoom interaction
        if (!document.body.classList.contains('zoom-interaction')) {
          document.body.classList.add('zoom-interaction');
        }

        // Get the transform group and update with the new transform
        const transformGroup = svg.select('.transform-group');
        if (!transformGroup.empty()) {
          // Always use the event transform directly - this is crucial for cursor-relative zooming
          transformGroup.attr('transform', event.transform.toString());
          transformRef.current = event.transform;
          
          // Store detailed transform info for debugging
          const zoomInfo = {
            x: event.transform.x,
            y: event.transform.y,
            k: event.transform.k,
            sourceEvent: event.sourceEvent?.type,
            sourceEventPos: event.sourceEvent ? 
              { clientX: event.sourceEvent.clientX, clientY: event.sourceEvent.clientY } : 
              'unknown',
            timestamp: Date.now()
          };
          
          // Log transform for debugging when in development
          if (process.env.NODE_ENV === 'development') {
            logger.debug('Zoom transform applied', zoomInfo, 'hooks zoom transform');
          }
          
          // Ensure smooth transitions without jumps
          const _svgDimensions = {
            width: svg.node()?.clientWidth || 0,
            height: svg.node()?.clientHeight || 0
          };
          
          // Debounced state save
          if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
          }
          
          saveTimeoutRef.current = setTimeout(() =>{
            if (typeof window.saveWorkspaceState === 'function') {
              window.saveWorkspaceState();
            }
            saveTimeoutRef.current = null;
          }, 300);
        } else {
          layerManager.updateTransform(event.transform.toString());
        }
      }).on('end', () =>{
        if (isStateBeingRestored()) return;
        setDraggingState(false);

        // Save state on zoom end
        if (typeof window.saveWorkspaceState === 'function') {
          window.saveWorkspaceState();
        }
      });

    // Apply zoom behavior to the SVG element
    svg.call(zoom);

    // Store zoom behavior
    zoomBehaviorRef.current = zoom;
    globalZoomBehavior = zoom;

    // Also store in window for global access
    if (typeof window !== 'undefined') {
      (window as { __globalZoomBehavior?: ZoomBehavior<SVGSVGElement, unknown> }).__globalZoomBehavior = zoom;
    }      // Get initial transform
      const initialTransform = transformCoordinator.getInitialTransform();
      if (initialTransform) {
        logger.info('[TRANSFORM STATE] 📊 Using initial transform from coordinator', {
          scale: initialTransform.scale,
          x: initialTransform.translate.x,
          y: initialTransform.translate.y,
          timestamp: new Date().toISOString(),
          _style: 'background-color: #3F51B5; color: white; padding: 2px 5px; border-radius: 3px;'
        }, 'hooks zoom transform');

        const transform = zoomIdentity
          .translate(initialTransform.translate.x, initialTransform.translate.y)
          .scale(initialTransform.scale);

        // Apply transform with force flag for reliable application
        applyTransform(svgElement, transform, true);
        transformRef.current = transform;
        lastTransformAppliedRef.current = transform.toString();
        savedStateApplied = true;
      } else {
        // If a transform group already exists, get its current transform
        const transformGroup = svg.select('.transform-group');
        let currentTransform = null;

        if (!transformGroup.empty()) {
          const transformStr = transformGroup.attr('transform');
          if (transformStr) {
            logger.info('[TRANSFORM STATE] 🔍 Found existing transform in DOM', { 
              transform: transformStr,
              timestamp: new Date().toISOString(),
              _style: 'background-color: #795548; color: white; padding: 2px 5px; border-radius: 3px;'
            }, 'hooks zoom transform');

            const parsed = parseTransform(transformStr);
            currentTransform = zoomIdentity.translate(parsed.x, parsed.y).scale(parsed.k);
          }
        }

        // Check if we're in state restoration mode
        const isStateRestoring = typeof isStateBeingRestored === 'function' && isStateBeingRestored();

        // Apply appropriate transform with priority:
        // 1. During state restoration, the saved state is highest priority
        // 2. Saved state that hasn't been applied yet
        // 3. Current transform that's already in the DOM
        // 4. Default transform (only if no saved state exists)
        if (isStateRestoring && savedState) {
          // 1. During state restoration, saved state has absolute highest priority
          const savedTransform = zoomIdentity
            .translate(savedState.translate.x, savedState.translate.y)
            .scale(savedState.scale);

          logger.info('[TRANSFORM STATE] 🚨 Applying saved state during state restoration', {
            scale: savedState.scale,
            x: savedState.translate.x,
            y: savedState.translate.y,
            timestamp: new Date().toISOString(),
            _style: 'background-color: #F44336; color: white; padding: 2px 5px; border-radius: 3px;'
          }, 'hooks zoom transform');

          // Apply transform with force flag
          applyTransform(svgElement, savedTransform, true);
          transformRef.current = savedTransform;
          lastTransformAppliedRef.current = savedTransform.toString();
          savedStateApplied = true;
        } else if (savedState && !savedStateApplied) {
          // 2. Saved state has high priority outside of state restoration
          const savedTransform = zoomIdentity
            .translate(savedState.translate.x, savedState.translate.y)
            .scale(savedState.scale);

          logger.info('[TRANSFORM STATE] 📊 Applying saved viewport state during initialization', {
            scale: savedState.scale,
            x: savedState.translate.x,
            y: savedState.translate.y,
            timestamp: new Date().toISOString(),
            _style: 'background-color: #2196F3; color: white; padding: 2px 5px; border-radius: 3px;'
          }, 'hooks zoom transform');

          // Apply transform with force flag
          applyTransform(svgElement, savedTransform, true);
          transformRef.current = savedTransform;
          lastTransformAppliedRef.current = savedTransform.toString();
          savedStateApplied = true;
        } else if (currentTransform) {
          // 3. Current transform in DOM has third priority
          logger.info('[TRANSFORM STATE] 📊 Preserving existing transform', {
            transform: currentTransform.toString(),
            timestamp: new Date().toISOString(),
            _style: 'background-color: #FF9800; color: white; padding: 2px 5px; border-radius: 3px;'
          }, 'hooks zoom transform');

          svg.call(zoom.transform, currentTransform);
          transformRef.current = currentTransform;
          lastTransformAppliedRef.current = currentTransform.toString();
        } else if (!preventDefaultTransform) {
          // 4. Default transform only applied if explicitly allowed
          const defaultTransform = zoomIdentity.translate(0, 0).scale(DEFAULT_ZOOM_SCALE);

          logger.info('[TRANSFORM STATE] 📊 Applying default transform', {
            scale: DEFAULT_ZOOM_SCALE,
            x: 0,
            y: 0,
            timestamp: new Date().toISOString(),
            _style: 'background-color: #607D8B; color: white; padding: 2px 5px; border-radius: 3px;'
          }, 'hooks zoom transform');

          applyTransform(svgElement, defaultTransform);
          transformRef.current = defaultTransform;
          lastTransformAppliedRef.current = defaultTransform.toString();

          logger.info('Applied default zoomed-out view', {
            scale: DEFAULT_ZOOM_SCALE
          }, 'hooks zoom transform');
        }
      }// Mark as initialized
    initializedRef.current = true;
    setIsInitialized(true);
    setZoomInitialized(true);

    // Set up event listeners
    useEventListeners(svgElement);
  }, [isInitialized]);

  /**
   * Set up event listeners for custom centering events
   */
  const useEventListeners = (svgElement: SVGSVGElement) =>{
    // Flag to prevent duplicate centering operations
    let isCenteringInProgress = false;

    // Listen for custom centering event with improved error handling
    const handleCenterOnElement = (_event: CustomEvent) =>{
      try {
        // Skip if state is being restored
        if (isStateBeingRestored()) return;

        // Skip if already centering
        if (isCenteringInProgress) {
          logger.warn('Centering already in progress, ignoring event', {}, 'hooks zoom warning');
          return;
        }

        // Skip if transform coordinator is handling centering
        if (transformCoordinator.isCenteringInProgress()) {
          logger.debug('Transform coordinator is handling centering, ignoring event', {}, 'hooks zoom transform');
          return;
        }

        // Skip if transform is locked
        if (transformCoordinator.isTransformLocked && typeof transformCoordinator.isTransformLocked === 'function' && transformCoordinator.isTransformLocked()) {
          logger.debug('Transform is locked, ignoring centering event', {}, 'hooks zoom transform');
          return;
        }

        // Set flag to prevent duplicates
        isCenteringInProgress = true;

        // Extract details with defensive checks
        const detail = _event.detail || {};
        const id = detail.id;
        const rect = detail.rect;

        // Validate rect parameters
        if (!rect || typeof rect.x !== 'number' || 
            typeof rect.y !== 'number' || 
            typeof rect.width !== 'number' || 
            typeof rect.height !== 'number') {
          logger.warn('Invalid rectangle data in center-on-element event', { detail }, 'hooks zoom warning');
          isCenteringInProgress = false;
          return;
        }

        logger.info('Custom center-on-element event received', { id, rect }, 'hooks zoom interaction');

        // Validate zoom behavior and SVG element
        if (!rect || !zoomBehaviorRef.current || !svgElement) {
          logger.warn('Missing requirements for centering', { 
            hasRect: !!rect,
            hasZoomBehavior: !!zoomBehaviorRef.current,
            hasSvgElement: !!svgElement
          }, 'hooks zoom warning');
          isCenteringInProgress = false;
          return;
        }

        const svg = select(svgElement);

        // Validate transform group
        const transformGroup = svg.select('.transform-group');
        if (transformGroup.empty()) {
          logger.warn('Transform group not found for centering', {}, 'hooks zoom warning');
          isCenteringInProgress = false;
          return;
        }

        // Calculate SVG dimensions with validation
        const svgRect = svgElement.getBoundingClientRect();
        if (!svgRect || svgRect.width<= 0 || svgRect.height<= 0) {
          logger.warn('Invalid SVG dimensions for centering', { svgRect }, 'hooks zoom warning');
          isCenteringInProgress = false;
          return;
        }

        const svgWidth = svgRect.width || 800;
        const svgHeight = svgRect.height || 600;
        
        // Calculate dimensions for debugging but don't use directly
        const _svgDimensions = {
          width: svgWidth,
          height: svgHeight
        };

        // Parse current transform to preserve scale
        const currentTransform = transformGroup.attr('transform') || '';
        const scaleMatch = currentTransform.match(/scale\(([^)]+)\)/);
        const scale = scaleMatch && !isNaN(parseFloat(scaleMatch[1])) ? 
          parseFloat(scaleMatch[1]) : 1;

        // Calculate element center
        const centerX = rect.x + rect.width / 2;
        const centerY = rect.y + rect.height / 2;

        // Calculate translation needed to center the element
        const translateX = (svgWidth / 2 - centerX * scale);
        const translateY = (svgHeight / 2 - centerY * scale);

        // Create new transform
        const newTransform = zoomIdentity
          .translate(translateX, translateY)
          .scale(scale);

        logger.debug('Applying custom centering transform', {
          element: rect,
          center: { x: centerX, y: centerY },
          translation: { x: translateX, y: translateY },
          scale,
          svgDimensions: { width: svgWidth, height: svgHeight }
        }, 'hooks zoom transform');

        // Apply transform with smooth animation
        transformGroup
          .transition()
          .duration(500)
          .attr('transform', newTransform.toString())
          .on('end', () =>{
            try {
              // Sync the zoom behavior with new transform
              syncZoomWithTransform(svgElement);

              logger.debug('Custom centering complete', {}, 'hooks zoom transform');

              // Save state after centering
              setTimeout(() =>{
                if (typeof window.saveWorkspaceState === 'function') {
                  window.saveWorkspaceState();
                }
              }, 100);

              // Reset centering flag after a delay to prevent rapid consecutive operations
              setTimeout(() =>{
                isCenteringInProgress = false;
              }, 200);
            } catch (error) {
              logger.error('Error syncing zoom after centering', { error }, 'hooks zoom error');
              isCenteringInProgress = false;
            }
          })
          .on('interrupt', () =>{
            // Also reset flag if animation is interrupted
            isCenteringInProgress = false;
          });
      } catch (error) {
        // Comprehensive error handling
        logger.error('Error handling custom center-on-element event', { 
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        }, 'hooks zoom error');

        // Always reset the flag on error
        isCenteringInProgress = false;
      }
    };

    // Listen for sync transform event
    const handleSyncTransform = () =>{
      logger.debug('Sync transform event received', {}, 'hooks zoom transform');
      syncZoomWithTransform(svgElement);

      // Save state after sync
      setTimeout(() =>{
        if (typeof window.saveWorkspaceState === 'function') {
          window.saveWorkspaceState();
        }
      }, 100);
    };

    // Add event listeners
    window.addEventListener('center-on-element', handleCenterOnElement as EventListener);
    window.addEventListener('sync-transform', handleSyncTransform);

    // Return cleanup function
    return () =>{
      window.removeEventListener('center-on-element', handleCenterOnElement as EventListener);
      window.removeEventListener('sync-transform', handleSyncTransform);
    };
  };

  /**
   * Cleanup on unmount
   */
  useEffect(() =>{
    return () =>{
      // Clean up event listeners using the stored handler
      if (transformUnlockHandlerRef.current) {
        window.removeEventListener('transform-unlocked', transformUnlockHandlerRef.current);
        transformUnlockHandlerRef.current = null;
      }

      zoomBehaviorRef.current = null;
      globalZoomBehavior = null;
      setZoomInitialized(false);
      setIsInitialized(false);
      initializedRef.current = false;
      savedStateApplied = false;

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    };
  }, []);

  return { 
    initializeZoom,
    isInitialized,
    currentTransform: transformRef.current
  };
}

// Make syncZoomWithTransform and globalZoomBehavior available globally
if (typeof window !== 'undefined') {
  (window as { 
    syncZoomWithTransform?: typeof syncZoomWithTransform;
    __globalZoomBehavior?: ZoomBehavior<SVGSVGElement, unknown> | null;
  }).syncZoomWithTransform = syncZoomWithTransform;
  (window as { 
    syncZoomWithTransform?: typeof syncZoomWithTransform;
    __globalZoomBehavior?: ZoomBehavior<SVGSVGElement, unknown> | null;
  }).__globalZoomBehavior = globalZoomBehavior;
}
