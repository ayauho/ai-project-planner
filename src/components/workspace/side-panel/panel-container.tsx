'use client';
import { useState, useEffect, useRef } from 'react';
import { PanelContainerProps } from './types';
import { logger } from '@/lib/client/logger';
import CollapseButton from './collapse-button';
import { isMobileDevice } from '@/lib/client/utils/device-detection';

const PanelContainer = ({ children, className = '' }: PanelContainerProps) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const initialRenderRef = useRef(true);
  const isSmallScreen = useRef(false);  // Initialization effect
  useEffect(() => {
    try {
      // Check if we're on a small screen
      isSmallScreen.current = window.innerWidth <= 768 || isMobileDevice();
      
      // Load saved state
      const savedState = localStorage.getItem('sidePanelCollapsed');
      
      // On small screens, default to collapsed unless explicitly set otherwise
      if (isSmallScreen.current) {
        if (savedState === 'false') {
          setIsCollapsed(false);
        } else {
          setIsCollapsed(true);
          // Store this decision
          localStorage.setItem('sidePanelCollapsed', 'true');
        }
      } else if (savedState) {
        // On larger screens, respect saved state
        setIsCollapsed(JSON.parse(savedState));
      }
    } catch (error) {
      logger.error('Failed to load side panel state', { error: String(error) }, 'panel state error');
    }
    
    // Mark first render complete
    initialRenderRef.current = false;
    
    // Listen for window resize events to update small screen status
    const handleResize = () => {
      const wasSmallScreen = isSmallScreen.current;
      isSmallScreen.current = window.innerWidth <= 768 || isMobileDevice();
      
      // If transitioning to small screen and panel is expanded, collapse it
      if (!wasSmallScreen && isSmallScreen.current && !isCollapsed) {
        setIsCollapsed(true);
        localStorage.setItem('sidePanelCollapsed', 'true');
      }
    };
    
    // Set up main content touch/click handler for small screens
    const handleMainContentTouch = (e: MouseEvent | TouchEvent) => {
      // Skip if dialog is active
      if (document.body.classList.contains('dialog-active')) {
        logger.debug('Skipping panel collapse - dialog is active', {}, 'panel ui state');
        return;
      }
      
      if (isSmallScreen.current && !isCollapsed) {
        // Only collapse when touching main content, not the side panel
        const target = e.target as HTMLElement;
        
        // Enhanced exclusion checks - comprehensive list of dialog-related elements
        if (!target.closest('[data-side-panel="true"]') && 
            !target.closest('.project-delete-confirm') && 
            !target.closest('.delete-project-dialog') &&
            !target.closest('.delete-project-button') &&
            !target.closest('[data-delete-project="true"]') &&
            !target.closest('[data-delete-dialog="true"]') &&
            !target.closest('[data-delete-dialog-button]') &&
            !target.closest('[role="dialog"]')) {
          handleToggle();
          e.preventDefault();
        }
      }
    };
    
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    
    // Add touch/click handlers for main content
    if (isSmallScreen.current) {
      document.addEventListener('click', handleMainContentTouch, { passive: false });
      document.addEventListener('touchstart', handleMainContentTouch, { passive: false });
    }
    
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
      document.removeEventListener('click', handleMainContentTouch);
      document.removeEventListener('touchstart', handleMainContentTouch);
    };
  }, [isCollapsed]);
  
  // This function is completely removed - we don't need any extra operations

  // No initialization effect needed

  // Listen for custom collapse events - but keep extremely minimal
  useEffect(() => {
    const handleForceCollapse = () => {
      // Skip if dialog is active
      if (document.body.classList.contains('dialog-active')) {
        logger.debug('Skipping forced panel collapse - dialog is active', {}, 'panel ui state');
        return;
      }
      
      if (!isCollapsed) {
        handleToggle();
      }
    };
    
    // Listen for project selection events to auto-collapse on small screens
    const handleProjectSelected = () => {
      // Skip if dialog is active
      if (document.body.classList.contains('dialog-active')) {
        logger.debug('Skipping project-selected collapse - dialog is active', {}, 'panel ui state');
        return;
      }
      
      if (isSmallScreen.current && !isCollapsed) {
        handleToggle();
      }
    };
    
    window.addEventListener('force-collapse-side-panel', handleForceCollapse);
    window.addEventListener('project-selected', handleProjectSelected);
    
    return () => {
      window.removeEventListener('force-collapse-side-panel', handleForceCollapse);
      window.removeEventListener('project-selected', handleProjectSelected);
    };
  }, [isCollapsed]);

  // RADICALLY SIMPLIFIED toggle function - absolutely minimal operations
  const handleToggle = () => {
    try {
      // Skip if dialog is active
      if (document.body.classList.contains('dialog-active')) {
        logger.debug('Skipping panel toggle - dialog is active', {}, 'panel ui state');
        return;
      }
      
      // ONLY these two operations: update state + save to localStorage
      const newState = !isCollapsed;
      setIsCollapsed(newState);
      localStorage.setItem('sidePanelCollapsed', JSON.stringify(newState));
      
      // Minimal logging with no extra operations
      logger.info('Side panel toggle - minimal operation', { isCollapsed: newState }, 'panel ui state');
    } catch (error) {
      logger.error('Failed to toggle side panel', { error: String(error) }, 'panel ui error');
    }
  };  
  
  return (<aside
      role="complementary"
      aria-label="Side Panel"
      className={`${className}`}
      data-side-panel="true"
      data-state={isCollapsed ? 'collapsed' : 'expanded'}
      style={{
        width: isCollapsed ? '42px' : '256px',
        maxWidth: isCollapsed ? '42px' : '256px',
        minWidth: isCollapsed ? '42px' : '256px'
      }}
      // Add click/touch handler to expand collapsed panel on small screens
      onClick={(e) => {
        // Skip if dialog is active
        if (document.body.classList.contains('dialog-active')) {
          return;
        }
        
        if (isSmallScreen.current && isCollapsed) {
          // Prevent expansion when clicking the collapse button itself
          const target = e.target as HTMLElement;
          if (!target.closest('.panel-collapse-button')) {
            handleToggle();
            e.stopPropagation();
          }
        }
      }}
    >{/* Collapse button with fixed positioning */}<div className="panel-collapse-button"><CollapseButton
          isCollapsed={isCollapsed}
          onToggle={handleToggle}
        /></div>{/* Content container with proper overflow handling */}<div className="h-full overflow-hidden pt-12 px-4 pr-0">{/* Only hide content when collapsed */}<div 
          className={`h-full ${isCollapsed ? 'invisible opacity-0' : 'visible opacity-100'}`}
          aria-hidden={isCollapsed}
        >{children}</div></div></aside>);
};

export default PanelContainer;
