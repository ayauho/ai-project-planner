'use client';
import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { logger } from '@/lib/client/logger';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useApiKeyCheck } from '@/lib/hooks/useApiKeyCheck';
import { extractProjectName } from '@/lib/client/project/extract-name';
import { NAME_EXTRACTION_RULES, VALIDATION_MESSAGES } from '@/lib/client/project/constants';
import { workspaceStateManager } from '@/lib/workspace/state/manager';
import { createProjectWithTasks } from '@/lib/project/handlers/client/project-creation';
import { DEFAULT_ZOOM_SCALE } from '@/lib/client/layout/constants';
import { PROJECT_WIDTH, PROJECT_HEIGHT } from '@/lib/client/visual/project/constants';
import { isMobileDevice } from '@/lib/client/utils/device-detection';
import type { ProjectCreationProps } from './types';

/**
 * Check if a user has any existing projects
 * Used to determine if this is the first project for a new user
 */
async function _checkIfUserHasProjects(userId: string): Promise<boolean>{
  try {
    // Make API call to check if user has any projects
    const response = await fetch(`/api/projects?count=1`);
    
    if (!response.ok) {
      logger.warn('Failed to check if user has projects', { 
        status: response.status,
        userId 
      }, 'project api user');
      return false;
    }
    
    const data = await response.json();
    
    // If the user has at least one project, return true
    return Array.isArray(data.projects) && data.projects.length > 0;
  } catch (error) {
    logger.error('Error checking if user has projects', { 
      error: error instanceof Error ? error.message : String(error),
      userId
    }, 'project api error');
    return false;
  }
}

const schema = z.object({
  description: z.string()
    .min(NAME_EXTRACTION_RULES.MIN_DESCRIPTION_LENGTH, VALIDATION_MESSAGES.DESCRIPTION_TOO_SHORT)
    .max(1000, 'Description must not exceed 1000 characters')
});

type FormData = z.infer<typeof schema>;

const ProjectCreation: React.FC<ProjectCreationProps> = ({
  className = '',
  onProjectCreate
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const hasApiKey = useApiKeyCheck();
  const [_isMobile, setIsMobile] = useState(false);

  // Check for active project selection - avoid showing API warnings during transitions
  useEffect(() => {
    // Check if we're in transition from project deletion to selection
    const isProjectSelectionInProgress = document.body.hasAttribute('data-project-selection-in-progress');
    const isRecentlyDeleted = document.body.hasAttribute('data-project-deleted-recently');
    
    // Check if a project is being selected from somewhere else
    const isExistingSelectionInProgress = sessionStorage.getItem('project_selection_in_progress');
    
    // If we're transitioning between states, don't show API warnings
    if (isProjectSelectionInProgress || isRecentlyDeleted || isExistingSelectionInProgress) {
      logger.debug('Project creation component detected transition state - skipping validation', {
        isProjectSelectionInProgress,
        isRecentlyDeleted,
        isExistingSelectionInProgress
      }, 'project creation ui state');
      
      // Delay initialization to skip flashing
      setIsInitializing(true);
      
      // Add event listener to detect when state stabilizes
      const clearInitializing = () => {
        setTimeout(() => {
          setIsInitializing(false);
        }, 1000);
      };
      
      // Set a timeout as a fallback
      setTimeout(clearInitializing, 1500);
      
      return () => {
        window.removeEventListener('project-selection-complete', clearInitializing);
      };
    } else {
      // Only initialize when stable
      setTimeout(() => {
        setIsInitializing(false);
      }, 500);
    }
  }, []);
  
  // Check if we're on a mobile device
  useEffect(() => {
    const mobile = isMobileDevice();
    setIsMobile(mobile);
    logger.debug('Project creation form initialized', { isMobile: mobile }, 'project creation ui');
  }, []);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset
  } = useForm<FormData>({
    resolver: zodResolver(schema)
  });

  const onSubmit = async (data: FormData) =>{
    if (!hasApiKey) {
      logger.warn('Attempted to create project without API key', {}, 'project creation api security');
      return;
    }

    setExtractionError(null);
    setIsProcessing(true);

    try {
      const result = extractProjectName(data.description);
      logger.info('Extracted project name', { 
        name: result.name, 
        descriptionLength: result.description.length 
      }, 'project creation parsing');

      const session = await import('@/lib/client/auth/storage').then(mod => mod.authStorage.getSession());
      if (!session?.user?._id) {
        throw new Error('No authenticated user found');
      }

      // Create a unique creation identifier for this session
      const creationTimestamp = Date.now();
      
      // Set flags for project creation state to coordinate components
      document.body.classList.add('project-creation-in-progress');
      sessionStorage.setItem('__creating_project', creationTimestamp.toString());
      
      // Use client-side project creation with AI
      const { projectId, taskIds } = await createProjectWithTasks({
        name: result.name,
        description: result.description,
        userId: session.user._id
      });

      logger.info('Project creation completed', { 
        projectId,
        tasksCount: taskIds.length
      }, 'project creation api');

      // Reset form 
      reset();

      // Now that project and tasks are created, update the UI and hide the form
      logger.info('Project creation complete, switching to project view', { projectId }, 'project creation ui');
      
      // First hide the project creation interface
      workspaceStateManager.hideProjectCreation();
      
      // Start loading state for the switch to the new project
      workspaceStateManager.updateState({ 
        ...workspaceStateManager.getState(),
        isLoading: true,
        error: null
      }, 'loading');
      
      // Clear any existing workspace state for the new project
      const { workspacePersistenceManager } = await import('@/lib/workspace/persistence/manager');
      await workspacePersistenceManager.clearState(undefined, projectId);
      logger.debug('Cleared workspace state for new project', { projectId }, 'project state persistence');
      
      // Set a detailed flag to mark this as a new project that needs centering
      // Include timestamp to make it uniquely identifiable
      sessionStorage.setItem('__new_project_needs_centering', JSON.stringify({
        projectId,
        timestamp: Date.now(),
        dimensions: {
          width: PROJECT_WIDTH,
          height: PROJECT_HEIGHT
        },
        zoomScale: DEFAULT_ZOOM_SCALE
      }));
      
      // Pass the project to onProjectCreate to update UI
      const createdProject = {
        name: result.name,
        description: result.description,
        userId: session.user._id,
        _id: projectId
      };
      
      // Notify about the new project and select it
      workspaceStateManager.notifyProjectListUpdated(projectId);
      
      // Set up a listener for when the project is ready to be shown
      const handleProjectReady = () =>{
        logger.info('Project ready event received, showing content', {}, 'project ui event');
        
        // Remove creation classes to allow transitions
        document.body.classList.remove('project-creation-in-progress');
        
        // Remove event listener
        document.removeEventListener('project-ready', handleProjectReady);
        
        // Clear creation flags after a delay
        setTimeout(() =>{
          sessionStorage.removeItem('__creating_project');
        }, 1000);
      };
      
      // Listen for the project-ready event
      document.addEventListener('project-ready', handleProjectReady);
      
      // Call the parent component's callback
      await onProjectCreate(createdProject);
      
      // Now explicitly select the project to ensure it's displayed
      await workspaceStateManager.selectProject(projectId, true);
      
      // Fallback cleanup of creation state after timeout
      setTimeout(() =>{
        document.body.classList.remove('project-creation-in-progress');
        sessionStorage.removeItem('__creating_project');
      }, 10000);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to process project description';
      logger.error('Project creation failed', { error: message }, 'project creation error');
      setExtractionError(message);
      
      // Reset creation state
      document.body.classList.remove('project-creation-in-progress');
      sessionStorage.removeItem('__creating_project');
      
      // Set error state but keep form visible
      workspaceStateManager.updateState({ 
        ...workspaceStateManager.getState(),
        isLoading: false,
        error: message
      }, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  // Don't show API key warning during initialization or transitions
  if (!hasApiKey && !isInitializing) {
    // Check if we're in the middle of a project selection (indicated by loading state)
    const state = workspaceStateManager.getState();
    const isSelectingProject = state.isLoading && !state.showProjectCreation;
    
    if (!isSelectingProject) {
      return (<Alert variant="destructive"><AlertDescription>An OpenAI API key is required to create projects. Please configure your API key using the button in the side panel.</AlertDescription></Alert>);
    }
  }
  
  // Show a blank div during initialization to prevent flashing
  if (isInitializing) {
    return <div className="h-32 w-full"></div>;
  }

  return (<div className="flex justify-center items-center w-full" style={{ maxWidth: "100%" }}><form
      onSubmit={handleSubmit(onSubmit)}
      className={`space-y-4 w-full project-creation-form ${className}`}
      aria-busy={isProcessing}
      style={{ maxWidth: "42rem" }}
    ><div><label htmlFor="project-description" className="sr-only">Project Description</label><textarea
          id="project-description"
          {...register('description')}
          placeholder="Describe your project... You can use formats like:&#13;&#10;Project Name / Description&#13;&#10;Project Name. Description&#13;&#10;Project Name\nDescription"
          className="w-full p-2 border rounded-md resize-none h-32"
          disabled={isProcessing}
          aria-invalid={Boolean(errors.description || extractionError)}
          aria-describedby={
            errors.description || extractionError ? "description-error" : undefined
          }
        />{(errors.description || extractionError) && (<div
            id="description-error"
            role="alert"
            className="mt-1 text-sm text-red-500"
          >{errors.description?.message || extractionError}</div>)}</div><button
        type="submit"
        disabled={isProcessing}
        className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50"
        aria-disabled={isProcessing}
      >{isProcessing ? 'Creating...' : 'Create Project'}</button></form></div>);
};

export default ProjectCreation;
