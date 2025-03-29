// src/app/api/tasks/[taskId]/delete/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { authenticateRequest } from '@/lib/auth/middleware/authMiddleware';
import { taskRepository } from '@/lib/task/repository';
import { taskDeleter } from '@/lib/task/operations/deleter';
import { TaskNotFoundError } from '@/lib/task/errors';
import { TaskDeletionError } from '@/lib/task/operations/errors';

/**
 * DELETE handler for task deletion endpoint
 * Recursively deletes a task and all its descendants
 */
export async function DELETE(
  request: NextRequest,
  context: { params: { taskId: string } }
) {
  const { taskId } = context.params;
  
  try {
    logger.info('Processing task delete request', { taskId }, 'task operations api');

    // Authenticate the request
    const authenticatedRequest = await authenticateRequest(request);
    if (!authenticatedRequest.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    try {
      // Check if task exists first
      const task = await taskRepository.findById(taskId);
      
      // Get parent ID for returning in response
      const parentId = task.parentId ? task.parentId.toString() : null;
      const projectId = task.projectId ? task.projectId.toString() : null;
      
      // Use taskDeleter for recursive deletion (includes children)
      await taskDeleter.deleteTaskRecursive(taskId);
      
      logger.info('Successfully deleted task and children', { 
        taskId,
        parentId,
        projectId
      }, 'task operations api');
      
      // Return success response with parent ID for client navigation
      return NextResponse.json({
        success: true,
        taskId,
        parentId,
        projectId
      });
      
    } catch (error) {
      if (error instanceof TaskNotFoundError) {
        logger.warn('Task not found for deletion', { taskId }, 'task operations api');
        return NextResponse.json(
          { error: 'Task not found' },
          { status: 404 }
        );
      }
      
      if (error instanceof TaskDeletionError) {
        logger.error('Task deletion error', { 
          taskId, 
          error: error.message 
        }, 'task operations api');
        return NextResponse.json(
          { error: error.message },
          { status: 400 }
        );
      }
      
      throw error;
    }

  } catch (error) {
    logger.error('Failed to delete task', { 
      taskId, 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, 'task operations api');
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
