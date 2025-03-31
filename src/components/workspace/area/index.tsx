'use client';

import { useEffect, useState, useRef } from 'react';
import { workspaceStateManager } from '@/lib/workspace/state/manager';
import { WorkspaceState } from '@/lib/workspace/state/types';
import ProjectCreation from './project-creation';
import WorkspaceVisual from '../visual/workspace';
import { logger } from '@/lib/client/logger';
import { authStorage } from '@/lib/client/auth/storage';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Types } from 'mongoose';
import type { ProjectWithTaskCount } from '@/lib/project/types';

const WorkspaceArea = () =>{
  const [state, setState] = useState<WorkspaceState>(workspaceStateManager.getState());
  const [error, setError] = useState<string | null>(null);
  const [sidePanelState, setSidePanelState] = useState<'expanded' | 'collapsed'>('collapsed');
  const initialRenderRef = useRef(true);

  useEffect(() =>{
    // Check for side panel state on mount and track changes
    const checkSidePanelState = () =>{
      const panel = document.querySelector('[data-side-panel="true"]');
      if (panel) {
        const isExpanded = panel.getAttribute('data-state') === 'expanded';
        setSidePanelState(isExpanded ? 'expanded' : 'collapsed');
        
        // Log state change for debugging
        logger.debug('Side panel state change detected', { 
          isExpanded, 
          previousState: sidePanelState
        }, 'workspace ui');
      }
    };
    
    // Initial check
    if (initialRenderRef.current) {
      checkSidePanelState();
      initialRenderRef.current = false;
    }
    
    // Listen for side panel changes
    const handleSidePanelChange = () =>{
      checkSidePanelState();
    };
    
    window.addEventListener('side-panel-state-change', handleSidePanelChange);
    window.addEventListener('side-panel-toggle-complete', handleSidePanelChange);
    
    return () =>{
      window.removeEventListener('side-panel-state-change', handleSidePanelChange);
      window.removeEventListener('side-panel-toggle-complete', handleSidePanelChange);
    };
  }, [sidePanelState]);

  // Set data attribute on body to indicate project creation state
  useEffect(() => {
    if (state.showProjectCreation) {
      document.body.setAttribute('data-project-creation-mode', 'true');
    } else {
      document.body.removeAttribute('data-project-creation-mode');
    }
  }, [state.showProjectCreation]);

  useEffect(() =>{
    // Check if we're in a project selection transition
    const isInTransition = 
      document.body.hasAttribute('data-project-selection-active') ||
      sessionStorage.getItem('project_selection_active') === 'true';
      
    // If no project is selected and we're not in transition, show project creation
    if (!state.selectedProject && !state.showProjectCreation && !isInTransition) {
      logger.info('No project selected, showing project creation interface', {}, 'project workspace ui');
      workspaceStateManager.showProjectCreation();
    }

    const unsubscribe = workspaceStateManager.subscribe(setState);
    
    // Add listener for project deletion event
    const handleProjectDeletion = (event: CustomEvent) =>{
      const { projectId } = event.detail;
      logger.info('Project deleted event received in workspace area', { projectId }, 'project workspace event');
      
      // Reset error state if any
      setError(null);
      
      // Create a flag to prevent rapid project selection right after deletion
      document.body.setAttribute('data-project-deleted-recently', 'true');
      
      // Clear this flag after a short delay
      setTimeout(() =>{
        document.body.removeAttribute('data-project-deleted-recently');
      }, 1000);
      
      // Ensure project creation is shown
      if (!state.showProjectCreation) {
        logger.info('Showing project creation after project deletion', {}, 'project workspace ui');
        workspaceStateManager.showProjectCreation();
      }
    };
    
    window.addEventListener('project-deleted-after-task', handleProjectDeletion as EventListener);
    
    return () =>{
      unsubscribe();
      window.removeEventListener('project-deleted-after-task', handleProjectDeletion as EventListener);
    };
  }, [state.selectedProject, state.showProjectCreation]);

  const handleProjectCreate = async (data: { 
    name: string; 
    description: string; 
    userId: string;
    _id?: string; // Added to receive projectId from child component
  }): Promise<ProjectWithTaskCount>=>{
    setError(null);
    try {
      logger.info('Starting project creation in WorkspaceArea', { name: data.name }, 'project workspace creation');
      
      // Important: If _id is provided, it means the project was already created
      // by the createProjectWithTasks function, so we should use that ID
      let projectId: string;
      
      if (data._id) {
        // Project already created, use the provided ID
        projectId = data._id;
        logger.info('Using pre-created project ID', { projectId }, 'project workspace creation');
      } else {
        // Create project manually (fallback case, shouldn't normally happen)
        const session = await authStorage.getSession();
        if (!session?.user?._id) {
          throw new Error('No authenticated user found');
        }
        
        logger.info('Creating project manually', { name: data.name }, 'project workspace creation');
        
        const response = await fetch('/api/projects', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: data.name,
            description: data.description,
            userId: session.user._id
          })
        });

        if (!response.ok) {
          throw new Error(`Failed to create project: ${response.statusText}`);
        }

        const newProject = await response.json();
        logger.debug('Project creation response', { newProject }, 'project workspace creation');
        
        // Check for _id (not projectId)
        if (!newProject?._id) {
          throw new Error('Created project is missing _id');
        }

        projectId = newProject._id;
      }

      // Get the complete project data
      const projectResponse = await fetch(`/api/projects/${projectId}`);
      if (!projectResponse.ok) {
        throw new Error('Failed to fetch project details');
      }

      const projectData = await projectResponse.json();
      logger.debug('Project details fetched', { projectData }, 'project workspace api');

      // Create the project with task count, ensuring all required fields
      const projectWithTaskCount: ProjectWithTaskCount = {
        _id: new Types.ObjectId(projectId),
        userId: new Types.ObjectId(data.userId),
        name: data.name,
        description: data.description,
        rootTaskId: projectData.rootTaskId ? new Types.ObjectId(projectData.rootTaskId) : undefined,
        createdAt: projectData.createdAt ? new Date(projectData.createdAt) : new Date(),
        updatedAt: projectData.updatedAt ? new Date(projectData.updatedAt) : new Date(),
        taskCount: 0 // Will be updated when tasks are created
      };

      // This is just returning the project data, NOT loading the project view yet
      // The actual selection will be done by the caller
      logger.info('Project data prepared for state', { projectId }, 'project workspace state');

      return projectWithTaskCount;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create project';
      logger.error('Project creation flow failed', { error: String(error) }, 'project workspace error');
      setError(errorMessage);
      // Keep project creation interface visible on error
      workspaceStateManager.showProjectCreation();
      throw error;
    }
  };

  return (
    <div className="space-y-6 relative h-full flex flex-col overflow-x-hidden">
      {error && (
        <Alert variant="destructive" className="max-w-2xl mx-auto flex-shrink-0">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      
      {state.showProjectCreation ? (
        <div 
          className="flex justify-center overflow-x-hidden w-full"
          data-project-creation-container="true"
          style={{ 
            width: '100%',
            boxSizing: 'border-box',
            padding: '0px 10px 0px 10px' // Add small padding on both sides
          }}
        >
          <ProjectCreation 
            onProjectCreate={handleProjectCreate}
            className="max-w-2xl mx-auto project-creation-form"
          />
        </div>
      ) : (
        <div 
          className="w-full h-full relative workspace-always-visible" 
          style={{ flex: '1 1 auto', minHeight: '0', visibility: 'visible' }}
        >
          <WorkspaceVisual className="workspace-visual h-full" />
        </div>
      )}
    </div>
  );
};

export default WorkspaceArea;
