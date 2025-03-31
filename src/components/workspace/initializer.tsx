'use client';

import { useEffect } from 'react';
import { logger } from '@/lib/client/logger';
import { isMobileDevice } from '@/lib/client/utils/device-detection';
import dynamic from 'next/dynamic';

// Dynamically import the API Key Controls Visibility Manager
// We use dynamic import with ssr: false to ensure it only runs in the browser
const ApiKeyControlsVisibilityManager = dynamic(
  () => import('@/components/workspace/api-key-visibility/ApiKeyControlsVisibilityManager'),
  { ssr: false }
);

/**
 * Component to initialize workspace features
 * This handles setup tasks that need to run when the workspace mounts
 */
const WorkspaceInitializer = () => {
  useEffect(() => {
    logger.info('Workspace initializer mounted', {}, 'workspace initialization');
    
    // Check if device is mobile and set the body attribute
    const isMobile = isMobileDevice();
    logger.debug('Device detection in workspace initializer', { isMobile }, 'workspace device initialization');
    
    // Check for saved state and project centering flags
    const needsCentering = sessionStorage.getItem('__new_project_needs_centering');
    if (needsCentering) {
      try {
        const centeringData = JSON.parse(needsCentering);
        logger.info('New project needs centering', { centeringData }, 'project workspace ui');
        
        // Dispatch event to notify components about project ready to display
        window.dispatchEvent(new CustomEvent('project-ready', {
          detail: centeringData
        }));
        
        // Clear the flag after a short delay
        setTimeout(() => {
          sessionStorage.removeItem('__new_project_needs_centering');
        }, 1000);
      } catch (error) {
        logger.error('Error processing centering data', { error: String(error) }, 'workspace error initialization');
        sessionStorage.removeItem('__new_project_needs_centering');
      }
    }
    
    // Auto-collapse side panel on small screens when a project is selected
    if (isMobile) {
      const handleProjectReady = () => {
        logger.debug('Project ready on mobile device, auto-collapsing panel', {}, 'project workspace mobile');
        window.dispatchEvent(new CustomEvent('force-collapse-side-panel'));
      };
      
      window.addEventListener('project-ready', handleProjectReady);
      
      return () => {
        window.removeEventListener('project-ready', handleProjectReady);
        logger.info('Workspace initializer unmounted', {}, 'workspace initialization');
      };
    }
    
    return () => {
      logger.info('Workspace initializer unmounted', {}, 'workspace initialization');
    };
  }, []);
  
  // Return the API Key Controls Visibility Manager component
  return <ApiKeyControlsVisibilityManager />;
};

export default WorkspaceInitializer;
