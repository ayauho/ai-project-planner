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
const calculateTaskPositions = (tasksCount: number, centerX: number = 400, centerY: number = 300, radius: number = 200): TaskPosition[] => {
  const positions: TaskPosition[] = [];
  for (let i = 0; i < tasksCount; i++) {
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
export const createProjectWithTasks = async (input: ProjectCreationInput): Promise<{ projectId: string; taskIds: string[] }> => {
  try {
    logger.info('Starting client-side project creation', { projectName: input.name }, 'project-creation client');

    // Step 1: Create the project
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

    logger.debug('Project created successfully, generating tasks with AI', { 
      projectId,
      projectDetails: {
        name: input.name,
        description: input.description
      }
    }, 'project-creation ai-integration');

    // Step 2: Generate tasks using client AI API
    try {
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
        throw new Error('Invalid AI response structure');
      }

      logger.debug('AI tasks generated', { count: aiTasks.length }, 'project-creation ai-integration');

      // Step 3: Calculate positions for tasks
      const positions = calculateTaskPositions(aiTasks.length);
      
      // Step 4: Create tasks with positions
      const createTasksResponse = await fetch(`/api/projects/${projectId}/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tasks: aiTasks.map((task, index) => ({
            name: task.name,
            description: task.description,
            position: positions[index]
          }))
        }),
      });

      if (!createTasksResponse.ok) {
        const errorText = await createTasksResponse.text();
        logger.error('Failed to create tasks', { status: createTasksResponse.status, error: errorText }, 'project-creation client error');
        throw new Error(`Failed to create tasks: ${createTasksResponse.statusText}`);
      }

      const tasks = await createTasksResponse.json();
      const taskIds = tasks.map((t: TaskApiResponse) => t._id?.toString() || '').filter(Boolean);
      
      logger.info('Project creation completed', {
        projectId,
        tasksCount: taskIds.length
      }, 'project-creation client success');

      // Return the project even if task generation failed
      return {
        projectId,
        taskIds
      };
    } catch (aiError) {
      logger.error('AI task generation failed', { 
        projectId, 
        error: aiError instanceof Error ? aiError.message : String(aiError)
      }, 'project-creation ai-integration error');
      
      // Return the project even if task generation failed
      return {
        projectId,
        taskIds: []
      };
    }
  } catch (error) {
    logger.error('Project creation failed', { error }, 'project-creation client error');
    throw error;
  }
};
