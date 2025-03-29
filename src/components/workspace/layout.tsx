'use client';
import { useState, useEffect, useRef } from 'react';
import SidePanel from './side-panel';
import WorkspaceArea from './area';
import WorkspaceInitializer from './initializer';
import { logger } from '@/lib/client/logger';
import { initMobileDetection } from '@/lib/client/utils/device-detection';interface WorkspaceLayoutProps {
  user: {
    _id: string;
    nickname: string;
  } | null;
  onSignOut: () =>void;
}

const WorkspaceLayout = ({ user, onSignOut }: WorkspaceLayoutProps) =>{
  const [mounted, setMounted] = useState(false);
  const mainContentRef = useRef<HTMLDivElement>(null);
  const [sidePanelState, setSidePanelState] = useState<'expanded' | 'collapsed' | 'initial'>('initial');

  // Handle initial mount and toggle events
  useEffect(() =>{
    setMounted(true);
    logger.info('Workspace layout mounted', {}, 'workspace layout ui');
    
    // Initialize mobile detection
    const cleanupMobileDetection = initMobileDetection();
    
    // Listen for side panel toggle events
    const handleSidePanelToggle = (_event: CustomEvent) =>{
      setSidePanelState(_event.detail.isCollapsed ? 'collapsed' : 'expanded');
    };
    
    // Listen for project selection to auto-collapse panel on small screens
    const handleProjectSelected = (_event: Event) => {
      if (window.innerWidth <= 768 && sidePanelState === 'expanded') {
        logger.debug('Project selected on small screen, sending auto-collapse event', {}, 'project layout ui mobile');
        window.dispatchEvent(new CustomEvent('force-collapse-side-panel'));
      }
    };
    
    window.addEventListener('side-panel-toggle-complete', handleSidePanelToggle as EventListener);
    window.addEventListener('project-selected', handleProjectSelected);
    
    // Initialize panel state from localStorage
    try {
      const savedState = localStorage.getItem('sidePanelCollapsed');
      if (savedState) {
        const isCollapsed = JSON.parse(savedState);
        setSidePanelState(isCollapsed ? 'collapsed' : 'expanded');
      } else {
        // On small screens, default to collapsed
        if (window.innerWidth <= 768) {
          setSidePanelState('collapsed');
          // Save this preference
          localStorage.setItem('sidePanelCollapsed', 'true');
        } else {
          setSidePanelState('expanded'); // Default state for larger screens
        }
      }
    } catch (error) {
      logger.error('Failed to load side panel state', { error: String(error) }, 'workspace layout error');
      setSidePanelState('expanded'); // Fallback to expanded
    }
    
    return () =>{
      window.removeEventListener('side-panel-toggle-complete', handleSidePanelToggle as EventListener);
      window.removeEventListener('project-selected', handleProjectSelected);
      if (cleanupMobileDetection) cleanupMobileDetection();
    };
  }, [sidePanelState]);
  
  // Handle window resize events
  useEffect(() =>{
    const handleResize = () =>{
      if (mainContentRef.current) {
        // Force recalculation on resize
        mainContentRef.current.style.display = 'none';
        // Force reflow by reading offsetHeight
        void mainContentRef.current.offsetHeight;
        mainContentRef.current.style.display = 'flex';
      }
    };
    
    window.addEventListener('resize', handleResize);
    
    return () =>{
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  if (!mounted) {
    return null;
  }

  return (<div className="flex flex-col h-screen overflow-hidden">{/* Header */}<header className="p-2 bg-white border-b flex justify-between items-center h-[60px] z-30 relative"><h1 className="text-xl">AI Project Planner</h1><div className="flex gap-2 items-center">{user && (<div className="text-sm text-gray-600 mr-2">Welcome, {user.nickname}</div>)}<button 
            onClick={onSignOut}
            className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded text-sm"
          >Sign Out</button></div></header>{/* Content area - side panel is fixed position, not part of the flow */}<div className="flex-1 h-[calc(100vh-60px)] overflow-hidden relative">{/* Render side panel outside normal flow */}
        {user && (<SidePanel userId={user._id} />)}
        
        {/* Main content with margin to account for side panel */}<main 
          ref={mainContentRef}
          className="w-full h-full overflow-auto flex flex-col"
          style={{ padding: "3px" }}
          data-main-content="true"
        ><WorkspaceInitializer /><WorkspaceArea /></main></div></div>);
};

export default WorkspaceLayout;
