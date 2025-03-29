'use client';

import { logger } from '@/lib/client/logger';

/**
 * Emergency force-centering utility that can be triggered from console
 * This provides a last-resort manual way to center the project
 */
export function forceProjectCentering(projectId?: string) {
  try {
    // Log start of operation - keep this as an info level since it's manually triggered
    logger.info('Manual project centering triggered', { projectId }, 'debug force-center');
    
    // Console logs only in development or when manually triggered
    const _isDev = process.env.NODE_ENV === 'development';
    
    // Find project ID if not provided
    if (!projectId) {
      // Try to get from session storage
      const storedProjectId = sessionStorage.getItem('__new_project_id');
      if (storedProjectId !== null) {
        projectId = storedProjectId;
      }
      
      if (!projectId) {
        // Look for any project element
        const projectElements = document.querySelectorAll('[id^="project-"]');
        if (projectElements.length > 0) {
          projectId = projectElements[0].id.replace('project-', '');
        }
      }
    }
    
    if (!projectId) {
      logger.warn('Manual centering failed: No project ID found', {}, 'debug force-center error');
      return false;
    }
    
    // Find project element
    const projectElement = document.getElementById(`project-${projectId}`);
    if (!projectElement) {
      logger.warn('Manual centering failed: Project element not found', { projectId }, 'debug force-center error');
      return false;
    }
    
    // Find SVG element
    const svg = document.querySelector('svg');
    if (!svg) {
      logger.warn('Manual centering failed: SVG element not found', {}, 'debug force-center error');
      return false;
    }
    
    // Find transform group
    const transformGroup = document.querySelector('.transform-group');
    if (!transformGroup) {
      logger.warn('Manual centering failed: Transform group not found', {}, 'debug force-center error');
      return false;
    }
    
    logger.debug('Found all required elements for manual centering', {}, 'debug force-center');
    
    // Calculate positioning
    const svgRect = svg.getBoundingClientRect();
    const projectRect = projectElement.getBoundingClientRect();
    
    // Get current scale from transform
    const transformAttr = transformGroup.getAttribute('transform') || '';
    const scaleMatch = transformAttr.match(/scale\(([^)]+)\)/);
    const scale = scaleMatch ? parseFloat(scaleMatch[1]) : 0.3; // Default to 0.3 if not found
    
    // Calculate center positions
    const projectCenterX = projectRect.left - svgRect.left + projectRect.width / 2;
    const projectCenterY = projectRect.top - svgRect.top + projectRect.height / 2;
    
    // Calculate required translation to center
    const translateX = (svgRect.width / 2 - projectCenterX * scale);
    const translateY = (svgRect.height / 2 - projectCenterY * scale);
    
    // Create new transform
    const newTransform = `translate(${translateX}, ${translateY}) scale(${scale})`;
    
    logger.debug('Applying manual transform', { newTransform }, 'debug force-center');
    
    // Apply transform directly
    transformGroup.setAttribute('transform', newTransform);
    
    // Force counter visibility
    document.querySelectorAll('.project-counter, [data-project-counter="true"]').forEach(counter => {
      (counter as HTMLElement).style.visibility = 'visible';
      (counter as HTMLElement).style.opacity = '1';
    });
    
    // Dispatch centering complete event
    document.dispatchEvent(new CustomEvent('centering-complete'));
    
    // Remove any hiding classes
    document.body.classList.remove('centering-new-project');
    document.body.classList.add('centering-complete');
    
    // Clean up after transition
    setTimeout(() => {
      document.body.classList.remove('centering-complete');
    }, 1000);
    
    logger.info('Manual centering completed successfully', { projectId }, 'debug force-center');
    return true;
  } catch (error) {
    logger.error('Manual centering failed', { 
      projectId, 
      error: error instanceof Error ? error.message : String(error)
    }, 'debug force-center error');
    return false;
  }
}

// Add to window for console access
if (typeof window !== 'undefined') {
  (window as Window & { forceProjectCentering?: typeof forceProjectCentering }).forceProjectCentering = forceProjectCentering;
}
