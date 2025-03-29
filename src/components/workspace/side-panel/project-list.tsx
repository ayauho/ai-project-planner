// src/components/workspace/side-panel/project-list.tsx
'use client';

import React, { useCallback, useRef, useEffect } from 'react';
import { ProjectDisplay } from '@/lib/project/selection/types';
import { logger } from '@/lib/client/logger';
import { useInteraction } from '@/components/workspace/interaction/context';
import { Trash2, Loader2 } from 'lucide-react';
import { projectService } from '@/lib/project/client/project-service';
import { workspaceStateManager } from '@/lib/workspace/state/manager';
import { WORKSPACE_STATE_RESTORED_EVENT } from '@/components/workspace/hooks/useWorkspacePersistence';

interface ProjectListProps {
  projects: ProjectDisplay[];
  onSelect: (id: string) => void;
  selectedId?: string;
  className?: string;
  onProjectDeleted?: () => void;
  isSelecting?: boolean;
}

const ProjectList = ({ 
  projects, 
  onSelect, 
  selectedId, 
  className = '',
  onProjectDeleted,
  isSelecting = false
}: ProjectListProps) => {
  const { showConfirmation, showError } = useInteraction();
  const inProgressRef = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);
  const scrollPositionRef = useRef(0);
  const restoreScrollRef = useRef(false);
  const restoredProjectIdRef = useRef<string | null>(null);

  // Save scroll position when component updates
  useEffect(() => {
    if (listRef.current) {
      scrollPositionRef.current = listRef.current.scrollTop;
    }
  });

  // Restore scroll position after rendering
  useEffect(() => {
    if (listRef.current && scrollPositionRef.current > 0 && !restoreScrollRef.current) {
      listRef.current.scrollTop = scrollPositionRef.current;
    }
  }, [projects, selectedId]);

  // Handle workspace state restoration event
  useEffect(() => {
    const handleStateRestored = (event: Event) => {
      const customEvent = event as CustomEvent;
      
      if (customEvent.detail && customEvent.detail.projectId) {
        restoredProjectIdRef.current = customEvent.detail.projectId;
        
        if (customEvent.detail.uiState?.projectListScrollPosition) {
          restoreScrollRef.current = true;
          scrollPositionRef.current = customEvent.detail.uiState.projectListScrollPosition;
          
          logger.info('Received state restoration event for project list', {
            projectId: customEvent.detail.projectId,
            scrollPosition: scrollPositionRef.current
          }, 'project list state restore');
          
          // Apply scroll position with delay to ensure list has rendered
          setTimeout(() => {
            if (listRef.current) {
              listRef.current.scrollTop = scrollPositionRef.current;
              
              // Highlight the selected project
              const selectedProjectElement = listRef.current.querySelector(`[data-project-id="${customEvent.detail.projectId}"]`);
              if (selectedProjectElement) {
                selectedProjectElement.scrollIntoView({ block: 'nearest', behavior: 'auto' });
              }
              
              logger.debug('Applied scroll position from restored state', {
                scrollPosition: scrollPositionRef.current,
                actualScrollTop: listRef.current.scrollTop
              }, 'project list ui state');
            }
            
            restoreScrollRef.current = false;
          }, 300);
        }
      }
    };
    
    window.addEventListener(WORKSPACE_STATE_RESTORED_EVENT, handleStateRestored);
    return () => {
      window.removeEventListener(WORKSPACE_STATE_RESTORED_EVENT, handleStateRestored);
    };
  }, []);

  const handleSelect = useCallback(async (id: string) => {
    // Skip if already selecting or same project
    if (inProgressRef.current || id === selectedId) {
      return;
    }

    // Check if a project was recently deleted - if so, add a slight delay before selection
    const isRecentlyDeleted = document.body.getAttribute('data-project-deleted-recently') === 'true';
    
    try {
      inProgressRef.current = true;
      logger.info('Project selected from list', { 
        id, 
        isRecentlyDeleted 
      }, 'project list selection');
      
      // Save scroll position before selection
      if (listRef.current) {
        scrollPositionRef.current = listRef.current.scrollTop;
      }
      
      // Set a flag in session storage to indicate selection is in progress
      sessionStorage.setItem('project_selection_in_progress', 'true');
      
      // Also set a body attribute for components to detect
      document.body.setAttribute('data-project-selection-in-progress', 'true');
      
      if (isRecentlyDeleted) {
        // Add a brief delay to allow state transitions to complete
        logger.debug('Adding delay to project selection after recent deletion', {}, 'project list selection');
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      await onSelect(id);
      
      // Fire an event to signal selection is complete
      window.dispatchEvent(new CustomEvent('project-selection-complete', {
        detail: { projectId: id }
      }));
    } catch (error) {
      logger.error('Failed to select project from list', { error: String(error) }, 'project list selection error');
    } finally {
      inProgressRef.current = false;
      
      // Clear selection flags
      sessionStorage.removeItem('project_selection_in_progress');
      document.body.removeAttribute('data-project-selection-in-progress');
      
      // Set a timeout to clear any leftover flags
      setTimeout(() => {
        sessionStorage.removeItem('project_selection_in_progress');
        document.body.removeAttribute('data-project-selection-in-progress');
      }, 500);
    }
  }, [selectedId, onSelect]);

  const deleteProject = useCallback(async (projectId: string, isSelected: boolean) => {
    try {
      if (isSelected) {
        logger.info('Clearing workspace before deletion', { projectId }, 'project list deletion');
        workspaceStateManager.clearSelection();
      }
      
      // Clear the project state from persistence BEFORE deleting the project
      logger.info('Clearing project state from persistence', { projectId }, 'project list deletion state');
      const { workspacePersistenceManager } = await import('@/lib/workspace/persistence/manager');
      await workspacePersistenceManager.clearState(undefined, projectId);
      
      // Also remove any references to this project from global state
      // to prevent restoration attempts
      if (typeof localStorage !== 'undefined') {
        const mainStateKey = 'ai-project-planner-workspace-state';
        try {
          const globalState = localStorage.getItem(mainStateKey);
          if (globalState) {
            const parsedState = JSON.parse(globalState);
            if (parsedState && parsedState.projectId === projectId) {
              logger.info('Removing deleted project from global state', { projectId }, 'project list deletion state');
              localStorage.removeItem(mainStateKey);
            }
          }
        } catch (error) {
          logger.warn('Error clearing global state', { error: String(error) }, 'project list deletion error');
        }
      }
      
      logger.info('Deleting project', { projectId }, 'project list deletion api');
      await projectService.deleteProject(projectId);
      
      logger.info('Project deleted, notifying parent', { projectId }, 'project list deletion');
      onProjectDeleted?.();
      
      // Dispatch an event to notify other components about the project deletion
      window.dispatchEvent(new CustomEvent('project-deleted', {
        detail: { projectId }
      }));
      
    } catch (error) {
      logger.error('Error during project deletion process', { 
        projectId, 
        error: String(error) 
      }, 'project list deletion error');
      throw error;
    }
  }, [onProjectDeleted]);

  const handleDelete = useCallback(async (event: React.MouseEvent, projectId: string, projectName: string) => {
    event.stopPropagation();
    
    const isSelected = projectId === selectedId;
    logger.info('Starting project deletion flow', { projectId, isSelected }, 'project list deletion');

    try {
      await showConfirmation({
        title: 'Delete Project',
        message: `Are you sure you want to delete "${projectName}"? This will also delete all tasks in the project and cannot be undone.`,
        onConfirm: () => deleteProject(projectId, isSelected)
      });
      logger.info('Project deletion flow completed', { projectId }, 'project list deletion');
    } catch (error) {
      logger.error('Project deletion failed', { projectId, error: String(error) }, 'project list deletion error');
      showError({
        title: 'Delete Failed',
        message: 'Failed to delete project. Please try again.',
        duration: 5000
      });
    }
  }, [selectedId, showConfirmation, showError, deleteProject]);

  // Scroll to selected project when projects change or a new project is selected
  useEffect(() => {
    if (listRef.current && selectedId && !restoreScrollRef.current) {
      const selectedElement = listRef.current.querySelector(`[data-project-id="${selectedId}"]`);
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest', behavior: 'auto' });
      }
    }
  }, [selectedId, projects]);

  return (<div 
      ref={listRef}
      className={`overflow-y-auto h-full ${className}`}
      style={{ marginRight: 0 }}
      data-project-list
    ><div className="space-y-2 py-2 pr-2 pl-0">{projects.map((project) => (<div
            key={project.id}
            data-project-id={project.id}
            onClick={() => handleSelect(project.id)}
            className={`w-full text-left py-2 pl-2 pr-0 rounded-md hover:bg-gray-100 transition-colors cursor-pointer
              ${project.id === selectedId ? 'bg-gray-100' : ''}
              ${project.id === restoredProjectIdRef.current && !selectedId ? 'bg-gray-50 border border-blue-200' : ''}`}
          ><div className="flex items-start justify-between group"><div className="flex flex-col"><div className="flex items-center"><span className="text-sm font-medium">{project.name}</span>{isSelecting && project.id === selectedId && (<Loader2 className="ml-2 w-3 h-3 text-blue-500 animate-spin" />)}</div><span className="text-xs text-gray-500">Tasks: {project.tasksCount} · Modified: {project.lastModifiedDate.toLocaleDateString()}</span></div><button
                onClick={(e) => handleDelete(e, project.id, project.name)}
                className="p-1 rounded hover:bg-red-100 opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="Delete project"
              ><Trash2 className="w-4 h-4 text-red-500" /></button></div></div>))}</div></div>);
};

export default ProjectList;
