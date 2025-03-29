import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { authenticateRequest } from '@/lib/auth/middleware/authMiddleware';
import { taskRepository } from '@/lib/task/repository';
import { TaskNotFoundError } from '@/lib/task/errors';
import { TaskIdRouteContext } from '@/lib/api/route-types';

export async function GET(
  request: NextRequest,
  context: TaskIdRouteContext
) {
  const { taskId } = context.params;
  
  try {
    logger.info('Processing get task request', { taskId }, 'task api');

    const authenticatedRequest = await authenticateRequest(request);
    if (!authenticatedRequest.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    try {
      const task = await taskRepository.findById(taskId);
      logger.info('Successfully retrieved task', { taskId }, 'task api');
      return NextResponse.json(task);
    } catch (error) {
      if (error instanceof TaskNotFoundError) {
        logger.warn('Task not found', { taskId }, 'task api');
        return NextResponse.json(
          { error: 'Task not found' },
          { status: 404 }
        );
      }
      throw error;
    }

  } catch (error) {
    logger.error('Failed to get task', { taskId, error }, 'task api');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
