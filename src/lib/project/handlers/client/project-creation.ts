'use client';

import { processAIRequest } from '@/lib/ai/client/processor';
import { logger } from '@/lib/client/logger';

interface TaskPosition {
  x: number;
  y: number;
}

/**
 * Interface for task data returned from API
 */
interface TaskApiResponse {
  _id?: string;
  name: string;
  description: string;
  projectId: string;
  parentId?: string;
  position: TaskPosition;
  createdAt?: string;
  updatedAt?: string;
}

interface ProjectCreationInput {
  name: string;
  description: string;
  userId: string;
}

/**
 * Calculate positions for tasks in a circular layout around the center
 */
const calculateTaskPositions = (tasksCount: number, centerX: number = 400, centerY: number = 300, radius: number = 200): TaskPosition[] =>{
  const positions: TaskPosition[] = [];
  for (let i = 0; i< tasksCount; i++) {
    const angle = (i / tasksCount) * 2 * Math.PI;
    positions.push({
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle)
    });
  }
  return positions;
};

/**
 * Create a project and its tasks using client-side AI integration
 */
export const createProjectWithTasks = async (input: ProjectCreationInput): Promise<{ projectId: string; taskIds: string[] }>=>{
  try {
    logger.info('Starting client-side project creation', { projectName: input.name }, 'project-creation client');
    
    // Check if body has no-api-key class
    if (document.body.classList.contains('no-api-key')) {
      const error = new Error('OpenAI API key is required to create projects. Please configure your API key in the side panel.');
      
      // Try to report the error through the error connector
      try {
        import('@/lib/client/error-connector').then(({ aiErrorConnector }) =>{
          aiErrorConnector.reportAIError(error, 'decompose');
        }).catch(() =>{
          // If import fails, continue with regular error handling
        });
      } catch (reportError) {
        // Ignore errors from the reporting mechanism
      }
      
      throw error;
    }

    // Step 1: Generate tasks using client AI API
    logger.debug('Generating tasks with AI before project creation', { 
      projectDetails: {
        name: input.name,
        description: input.description
      }
    }, 'project-creation ai-integration');
    
    // Explicitly structure the payload
    const aiPayload = {
      project: {
        name: input.name,
        description: input.description,
        definition: 'project'
      }
    };
    
    logger.debug('Preparing to call AI processor', { aiPayload }, 'project-creation ai-integration');
    
    const aiTasks = await processAIRequest('decompose', aiPayload);
    
    if (!aiTasks || !Array.isArray(aiTasks)) {
      logger.error('Invalid AI response structure', { aiTasks }, 'project-creation ai-integration error');
      throw new Error('Invalid AI response structure');
    }

    if (aiTasks.length === 0) {
      logger.error('AI returned empty tasks array', {}, 'project-creation ai-integration error');
      throw new Error('Failed to generate project tasks. Please try again with a more detailed description.');
    }

    logger.debug('AI tasks generated successfully', { count: aiTasks.length }, 'project-creation ai-integration');
    
    // Step 2: Create the project only after successful AI task generation
    const createProjectResponse = await fetch('/api/projects', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: input.name,
        description: input.description,
        userId: input.userId
      }),
    });

    if (!createProjectResponse.ok) {
      const errorText = await createProjectResponse.text();
      logger.error('Failed to create project', { status: createProjectResponse.status, error: errorText }, 'project-creation client error');
      throw new Error(`Failed to create project: ${createProjectResponse.statusText}`);
    }

    const project = await createProjectResponse.json();
    const projectId = project._id;
    
    if (!projectId) {
      throw new Error('Project created without ID');
    }

    logger.info('Project created successfully, proceeding to create tasks', { 
      projectId,
      tasksCount: aiTasks.length
    }, 'project-creation client');

    // Step 3: Calculate positions for tasks
    const positions = calculateTaskPositions(aiTasks.length);
    
    // Step 4: Create tasks with positions
    const createTasksResponse = await fetch(`/api/projects/${projectId}/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tasks: aiTasks.map((task, index) =>({
          name: task.name,
          description: task.description,
          position: positions[index]
        }))
      }),
    });

    if (!createTasksResponse.ok) {
      const errorText = await createTasksResponse.text();
      logger.error('Failed to create tasks', { status: createTasksResponse.status, error: errorText }, 'project-creation client error');
      
      // Since project was created but tasks failed, attempt to delete the project
      try {
        logger.warn('Attempting to delete project due to task creation failure', { projectId }, 'project-creation client cleanup');
        await fetch(`/api/projects/${projectId}`, {
          method: 'DELETE',
        });
        logger.info('Project deleted successfully after task creation failure', { projectId }, 'project-creation client cleanup');
      } catch (deleteError) {
        logger.error('Failed to delete project after task creation failure', { 
          projectId, 
          error: deleteError instanceof Error ? deleteError.message : String(deleteError) 
        }, 'project-creation client cleanup');
        // Continue with the original error even if cleanup fails
      }
      
      throw new Error(`Failed to create tasks: ${createTasksResponse.statusText}`);
    }

    const tasks = await createTasksResponse.json();
    const taskIds = tasks.map((t: TaskApiResponse) =>t._id?.toString() || '').filter(Boolean);
    
    logger.info('Project creation completed successfully', {
      projectId,
      tasksCount: taskIds.length
    }, 'project-creation client success');

    return {
      projectId,
      taskIds
    };
  } catch (error) {
    logger.error('Project creation failed', { 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, 'project-creation client error');
    
    // Report the error through the error connector
    try {
      import('@/lib/client/error-connector').then(({ aiErrorConnector }) =>{
        aiErrorConnector.reportAIError(
          error instanceof Error ? error : String(error),
          'decompose'
        );
      }).catch(() =>{
        // If import fails, continue with regular error handling
      });
    } catch (reportError) {
      // Ignore errors from the reporting mechanism
    }
    
    throw error;
  }
};
