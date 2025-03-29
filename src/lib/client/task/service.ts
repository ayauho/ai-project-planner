'use client';

import { logger } from '@/lib/client/logger';
import type { Task } from '@/lib/task/types';

class TaskService {
  async findByProjectId(projectId: string): Promise<Task[]> {
    try {
      const response = await fetch(`/api/projects/${projectId}/tasks`);
      if (!response.ok) {
        throw new Error(`Failed to fetch tasks: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      logger.error('Failed to fetch project tasks', { error, projectId }, 'task-service data-fetching error');
      throw error;
    }
  }

  async findChildren(taskId: string): Promise<Task[]> {
    try {
      const response = await fetch(`/api/tasks/${taskId}/children`);
      if (!response.ok) {
        throw new Error(`Failed to fetch child tasks: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      logger.error('Failed to fetch child tasks', { error, taskId }, 'task-service data-fetching error');
      throw error;
    }
  }
}

export const taskService = new TaskService();
