import mongoose from 'mongoose';
import { processRequest } from '@/lib/ai/request/processor';
import projectRepository from '@/lib/project/repository';
import { taskRepository } from '@/lib/task/repository';
import { logger } from '@/lib/logger';
import type { CreateProjectInput } from '@/lib/project/types';
import type { CreateTaskInput } from '@/lib/task/types';

interface TaskPosition {
  x: number;
  y: number;
}

interface ProjectCreationInput {
  name: string;
  description: string;
  userId: string;
}

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

export const createProjectWithTasks = async (input: ProjectCreationInput): Promise<{ projectId: string; taskIds: string[] }> => {
  try {
    logger.info('Starting project creation', { projectName: input.name }, 'project-creation server');

    // Create project
    const projectInput: CreateProjectInput = {
      name: input.name,
      description: input.description,
      userId: new mongoose.Types.ObjectId(input.userId)
    };

    const project = await projectRepository.create(projectInput);
    
    if (!project._id) {
      throw new Error('Project created without ID');
    }

    // Generate tasks using AI
    const aiResponse = await processRequest('decompose', {
      project: {
        name: input.name,
        description: input.description,
        definition: 'project'
      }
    });

    if (!aiResponse.content || !Array.isArray(aiResponse.content)) {
      throw new Error('Invalid AI response structure');
    }

    // Calculate positions for tasks
    const positions = calculateTaskPositions(aiResponse.content.length);
    
    // Create tasks with positions
    const taskPromises = aiResponse.content.map((task, index) => {
      if (!project._id) {
        throw new Error('Project ID is undefined');
      }

      const taskInput: CreateTaskInput = {
        projectId: project._id,
        name: task.name,
        description: task.description,
        position: positions[index]
      };
      return taskRepository.create(taskInput);
    });

    const tasks = await Promise.all(taskPromises);
    
    logger.info('Project creation completed', {
      projectId: project._id.toString(),
      tasksCount: tasks.length
    }, 'project-creation server success');

    return {
      projectId: project._id.toString(),
      taskIds: tasks.map(t => t._id?.toString() || '')
        .filter(Boolean)
    };
  } catch (error) {
    logger.error('Project creation failed', { error }, 'project-creation server error');
    throw error;
  }
};
