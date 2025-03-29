'use client';

import { logger } from '@/lib/client/logger';
import { useWorkspaceStore } from '@/lib/workspace/store';
import type { Project } from '@/lib/project/types';
import type { Task } from '@/lib/task/types';

interface ProjectCreationInput {
  name: string;
  description: string;
  userId: string;
}

interface ProjectResult {
  projectId: string;
  taskIds: string[];
}

interface ProjectTasksResponse {
  project: Project;
  tasks: Task[];
}

const RETRY_DELAYS = [2000, 4000, 8000];

// Different timeouts for different operations
const TIMEOUTS = {
  aiOperation: 30000,    // 30 seconds for AI operations
  dataFetch: 5000,      // 5 seconds for data fetching
  defaultTimeout: 10000  // 10 seconds default
};

async function fetchWithTimeout(
  url: string, 
  options: RequestInit, 
  timeoutMs: number = TIMEOUTS.defaultTimeout
) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error) {
      // Add context to the error
      const enhancedError = new Error(
        `Request failed (timeout: ${timeoutMs}ms): ${error.message}`
      );
      enhancedError.cause = error;
      throw enhancedError;
    }
    throw error;
  }
}

export const createProjectWithTasks = async (input: ProjectCreationInput): Promise<ProjectResult> => {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    try {
      logger.info('Starting project creation request', { 
        projectName: input.name,
        userId: input.userId,
        attempt: attempt + 1
      }, 'project-creation api-client');

      // Create project and initial tasks (AI operation)
      const response = await fetchWithTimeout('/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(input),
      }, TIMEOUTS.aiOperation); // Use longer timeout for AI operation

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Project creation failed (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      
      if (!data.projectId || !data.taskIds) {
        throw new Error('Invalid response structure from server');
      }

      // Add delay before fetching tasks to ensure backend processing is complete
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Load created project with tasks
      const tasksResponse = await fetchWithTimeout(
        `/api/projects/${data.projectId}/tasks`,
        {
          headers: {
            'Accept': 'application/json'
          }
        },
        TIMEOUTS.dataFetch // Use shorter timeout for data fetching
      );
      
      if (!tasksResponse.ok) {
        const errorText = await tasksResponse.text();
        throw new Error(`Failed to load project tasks (${tasksResponse.status}): ${errorText}`);
      }

      const projectData: ProjectTasksResponse = await tasksResponse.json();

      if (!projectData.project || !projectData.tasks) {
        throw new Error('Invalid project data structure received');
      }

      // Update workspace store
      const workspaceStore = useWorkspaceStore.getState();
      // Convert ObjectId to string
      const projectId = projectData.project._id.toString();
      workspaceStore.setActiveProject(projectId);

      logger.info('Project creation and loading completed', {
        projectId: data.projectId,
        tasksCount: projectData.tasks.length
      }, 'project-creation success');

      return data;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      const errorDetails = {
        attempt: attempt + 1,
        error: lastError.message,
        retryAvailable: attempt < RETRY_DELAYS.length,
        cause: lastError.cause ? String(lastError.cause) : undefined
      };

      logger.error('Project creation/loading failed', errorDetails, 'project-creation error retry');

      if (attempt < RETRY_DELAYS.length) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[attempt]));
        continue;
      }

      throw lastError;
    }
  }

  throw lastError || new Error('Failed to create project');
};
