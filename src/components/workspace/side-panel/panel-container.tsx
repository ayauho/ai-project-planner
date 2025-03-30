'use client';
import { useState, useEffect, useRef } from 'react';
import { PanelContainerProps } from './types';
import { logger } from '@/lib/client/logger';
import CollapseButton from './collapse-button';
import { isMobileDevice } from '@/lib/client/utils/device-detection';

const PanelContainer = ({ children, className = '' }: PanelContainerProps) =>{
  const [isCollapsed, setIsCollapsed] = useState(false);
  const initialRenderRef = useRef(true);
  const isSmallScreen = useRef(false);

  // Initialization effect
  useEffect(() =>{
    try {
      // Check if we're on a small screen
      isSmallScreen.current = window.innerWidth<= 768 || isMobileDevice();
      logger.debug('Side panel initialized', { isSmallScreen: isSmallScreen.current }, 'panel initialization');
      
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
    const handleResize = () =>{
      const wasSmallScreen = isSmallScreen.current;
      isSmallScreen.current = window.innerWidth<= 768 || isMobileDevice();
      
      // If transitioning to small screen and panel is expanded, collapse it
      if (!wasSmallScreen && isSmallScreen.current && !isCollapsed) {
        logger.debug('Window resized to small screen, auto-collapsing panel', {}, 'panel ui responsive');
        setIsCollapsed(true);
        localStorage.setItem('sidePanelCollapsed', 'true');
        updateSidePanelWidthVar(true);
      }
    };
    
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    
    return () =>{
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, [isCollapsed]);

  // Update side panel state - simplified approach that doesn't rely on CSS variables
  const updateSidePanelWidthVar = (collapsed: boolean) =>{
    try {
      // Force resize event to update SVG dimensions after a short delay
      setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 250);
      
      // Dispatch event for immediate UI updates
      window.dispatchEvent(new CustomEvent('side-panel-state-change', {
        detail: { 
          collapsed,
          isSmallScreen: isSmallScreen.current
        }
      }));
      
      logger.debug('Updated side panel state', { 
        collapsed, 
        isSmallScreen: isSmallScreen.current
      }, 'panel ui styles');
    } catch (error) {
      logger.error('Failed to update side panel state', { error: String(error) }, 'panel ui styles error');
    }
  };

  // Initialize side panel width variable on component mount
  useEffect(() =>{
    updateSidePanelWidthVar(isCollapsed);
  }, [isCollapsed]);

  // Listen for custom collapse events
  useEffect(() =>{
    const handleForceCollapse = () =>{
      if (!isCollapsed) {
        logger.debug('Force collapsing side panel from external event', {}, 'panel ui event');
        handleToggle();
      }
    };
    
    // Listen for project selection events to auto-collapse on small screens
    const handleProjectSelected = (_event: Event) =>{
      if (isSmallScreen.current && !isCollapsed) {
        logger.debug('Project selected on small screen, auto-collapsing panel', {}, 'panel ui responsive');
        handleToggle();
      }
    };
    
    window.addEventListener('force-collapse-side-panel', handleForceCollapse);
    window.addEventListener('project-selected', handleProjectSelected);
    
    return () =>{
      window.removeEventListener('force-collapse-side-panel', handleForceCollapse);
      window.removeEventListener('project-selected', handleProjectSelected);
    };
  }, [isCollapsed]);

  const handleToggle = () =>{
    try {
      // Add transition blocker class to prevent SVG transform changes
      document.body.classList.add('side-panel-transitioning');
      
      // Toggle collapsed state
      const newState = !isCollapsed;
      setIsCollapsed(newState);
      
      // Save to localStorage
      localStorage.setItem('sidePanelCollapsed', JSON.stringify(newState));
      
      // Update side panel width CSS variable
      updateSidePanelWidthVar(newState);
      
      logger.info('Side panel toggle', { isCollapsed: newState }, 'panel ui state');
      
      // Dispatch toggle complete event after transition
      setTimeout(() =>{
        // Remove transition blocker
        document.body.classList.remove('side-panel-transitioning');
        
        // Notify toggle complete
        window.dispatchEvent(new CustomEvent('side-panel-toggle-complete', {
          detail: { isCollapsed: newState }
        }));
        
        // Force resize event to update SVG dimensions
        window.dispatchEvent(new Event('resize'));
      }, 300); // Slightly longer than CSS transition
    } catch (error) {
      // Ensure class is removed even on error
      document.body.classList.remove('side-panel-transitioning');
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
    >{/* Collapse button with fixed positioning */}<div className="panel-collapse-button"><CollapseButton
          isCollapsed={isCollapsed}
          onToggle={handleToggle}
        /></div>{/* Content container with proper overflow handling */}<div className="h-full overflow-hidden pt-12 px-4 pr-0">{/* Only hide content when collapsed */}<div 
          className={`h-full ${isCollapsed ? 'invisible opacity-0' : 'visible opacity-100'}`}
          style={{ transition: 'opacity 0.2s ease-out, visibility 0.2s ease-out' }}
          aria-hidden={isCollapsed}
        >{children}</div></div></aside>);
};

export default PanelContainer;
