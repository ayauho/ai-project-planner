'use client';

import React, { useEffect, useState, useRef } from 'react';
import { logger } from '@/lib/client/logger';
import { getSavedViewportState } from '@/components/workspace/visual/hooks/useZoom';
import { isStateBeingRestored } from '@/app/preload-state';

interface WorkspaceLoaderProps {
  onReady?: () => void;
  children: React.ReactNode;
}

/**
 * Component that provides a loading mask over the workspace
 * until we've confirmed the transform is properly applied
 */
export const WorkspaceLoader: React.FC<WorkspaceLoaderProps> = ({ 
  onReady,
  children 
}) => {
  const [isTransformReady, setIsTransformReady] = useState(false);
  const [isPrepared, setIsPrepared] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const attemptCountRef = useRef(0);

  // Check if transform is properly applied
  const checkTransformState = () => {
    try {
      // Get all transform groups
      const transformGroup = document.querySelector('.transform-group');
      
      if (!transformGroup) {
        logger.debug('Transform group not found yet, waiting...', {}, 'workspace-loader transform');
        scheduleNextCheck();
        return;
      }
      
      // Get saved viewport state
      const savedState = getSavedViewportState();
      if (!savedState) {
        // No saved state, we can show the workspace immediately
        logger.debug('No saved viewport state, showing workspace', {}, 'workspace-loader transform');
        setIsTransformReady(true);
        return;
      }
      
      // Check if transform attributes are set
      const transform = transformGroup.getAttribute('transform');
      if (!transform) {
        logger.debug('Transform attribute not set yet, waiting...', {}, 'workspace-loader transform');
        scheduleNextCheck();
        return;
      }
      
      // Parse the transform
      const translateRegex = /translate\(([^,]+),\s*([^)]+)\)/;
      const scaleRegex = /scale\(([^)]+)\)/;
      
      const translateMatch = transform.match(translateRegex);
      const scaleMatch = transform.match(scaleRegex);
      
      if (!translateMatch || !scaleMatch) {
        logger.debug('Transform not properly formatted yet, waiting...', {}, 'workspace-loader transform');
        scheduleNextCheck();
        return;
      }
      
      const translateX = parseFloat(translateMatch[1]);
      const translateY = parseFloat(translateMatch[2]);
      const scale = parseFloat(scaleMatch[1]);
      
      // Check if values are close to saved state (allow minor numerical differences)
      const isCloseEnough = (a: number, b: number, threshold = 0.01) => 
        Math.abs(a - b) < threshold;
      
      const isXCorrect = isCloseEnough(translateX, savedState.translate.x);
      const isYCorrect = isCloseEnough(translateY, savedState.translate.y);
      const isScaleCorrect = isCloseEnough(scale, savedState.scale);
      
      if (isXCorrect && isYCorrect && isScaleCorrect) {
        logger.info('Transform correctly applied, showing workspace', { 
          current: { x: translateX, y: translateY, scale },
          expected: { x: savedState.translate.x, y: savedState.translate.y, scale: savedState.scale }
        }, 'workspace-loader ready');
        setIsTransformReady(true);
      } else {
        logger.debug('Transform values not matching saved state yet, waiting...', {
          current: { x: translateX, y: translateY, scale },
          expected: { x: savedState.translate.x, y: savedState.translate.y, scale: savedState.scale }
        }, 'workspace-loader transform');
        
        // If this is taking too many attempts, force it to show
        if (attemptCountRef.current > 10) {
          logger.warn('Giving up waiting for transform, showing workspace anyway', {}, 'workspace-loader fallback');
          setIsTransformReady(true);
        } else {
          scheduleNextCheck();
        }
      }
    } catch (error) {
      logger.error('Error checking transform state', { error }, 'workspace-loader error');
      // If there's an error, show the workspace anyway
      setIsTransformReady(true);
    }
  };
  
  // Schedule next transform check
  const scheduleNextCheck = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    attemptCountRef.current++;
    timeoutRef.current = setTimeout(checkTransformState, 50);
  };
  
  // Initialize check for transform state
  useEffect(() => {
    // Don't start checking until we've marked it prepared
    if (!isPrepared) return;
    
    // Start checking for transform state
    checkTransformState();
    
    // Fallback to ensure workspace is shown even if transform never settles
    const fallbackTimeout = setTimeout(() => {
      if (!isTransformReady) {
        logger.warn('Fallback timeout reached, showing workspace', {}, 'workspace-loader fallback');
        setIsTransformReady(true);
      }
    }, 2000);
    
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      clearTimeout(fallbackTimeout);
    };
  }, [isPrepared]);
  
  // Set as prepared after a short delay to allow initial rendering
  useEffect(() => {
    const timeout = setTimeout(() => {
      setIsPrepared(true);
    }, 50);
    
    return () => {
      clearTimeout(timeout);
    };
  }, []);
  
  // Call onReady when transform is ready
  useEffect(() => {
    if (isTransformReady && onReady) {
      onReady();
    }
  }, [isTransformReady, onReady]);
  
  // Determine if a loading state is already active
  const isInRestorationMode = isStateBeingRestored();
  
  return (
    <div className={`svg-container ${isTransformReady ? 'transform-ready' : ''}`}>
      {children}
      
      {/* Only show our loading mask if not already in restoration mode */}
      {!isInRestorationMode && !isTransformReady && (
        <div className={`workspace-loading-mask ${isTransformReady ? 'transform-ready' : ''}`}>
          <div className="loading-spinner"></div>
        </div>
      )}
    </div>
  );
};

export default WorkspaceLoader;
