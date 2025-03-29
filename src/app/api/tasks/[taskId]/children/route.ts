import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { authenticateRequest } from '@/lib/auth/middleware/authMiddleware';
import { taskRepository } from '@/lib/task/repository';
import { TaskNotFoundError } from '@/lib/task/errors';
import projectRepository from '@/lib/project/repository';
import mongoose from 'mongoose';
import { TaskIdRouteContext } from '@/lib/api/route-types';

export async function GET(
  request: NextRequest,
  context: TaskIdRouteContext
) {
  const { taskId } = context.params;
  
  try {
    logger.info('Processing get task/project children request', { taskId }, 'task hierarchy api');
    const authenticatedRequest = await authenticateRequest(request);
    if (!authenticatedRequest.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    // Try to find children based on task ID first
    try {
      // Try to find the task first to ensure it exists
      await taskRepository.findById(taskId);
      
      // Then get all children
      const children = await taskRepository.findChildren(taskId);
      
      logger.info('Successfully retrieved task children', { 
        taskId,
        childrenCount: children.length 
      }, 'task hierarchy api');
      
      return NextResponse.json(children);
    } catch (error) {
      // If it's not a task, check if it's a project
      if (error instanceof TaskNotFoundError && mongoose.Types.ObjectId.isValid(taskId)) {
        logger.debug('Task not found, checking if it is a project', { taskId }, 'task project api');
        
        try {
          // Try to find the project
          const project = await projectRepository.findById(taskId);
          
          if (project) {
            // If project exists, get its direct children (tasks with projectId but no parentId)
            const projectTasks = await taskRepository.findByProjectId(taskId);
            
            // Filter to only include direct children of the project (no parentId)
            const directProjectChildren = projectTasks.filter(task => !task.parentId);
            
            logger.info('Successfully retrieved project children', { 
              projectId: taskId,
              childrenCount: directProjectChildren.length 
            }, 'project task api');
            
            return NextResponse.json(directProjectChildren);
          } else {
            // Project not found
            logger.warn('Neither task nor project found', { id: taskId }, 'task project api');
            return NextResponse.json(
              { error: 'Neither task nor project found' },
              { status: 404 }
            );
          }
        } catch (projectError) {
          // Project repository error
          logger.error('Error checking for project', { id: taskId, error: projectError }, 'project api');
          throw projectError;
        }
      } else {
        // Re-throw if it's not a TaskNotFoundError
        throw error;
      }
    }
  } catch (error) {
    logger.error('Failed to get task/project children', { taskId, error }, 'task hierarchy api');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
