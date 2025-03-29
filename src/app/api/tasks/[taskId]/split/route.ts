import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth/middleware/authMiddleware';
import { logger } from '@/lib/logger';
import { taskGenerator } from '@/lib/task/operations/generator';
import { TaskNotFoundError } from '@/lib/task/errors';
import { TaskIdRouteContext } from '@/lib/api/route-types';

export async function POST(
  request: NextRequest,
  context: TaskIdRouteContext
) {
  const { taskId } = context.params;

  try {
    logger.info('Processing task split request', { taskId }, 'task operations api');

    const authenticatedRequest = await authenticateRequest(request);
    if (!authenticatedRequest.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const options = body || {};

    const subtasks = await taskGenerator.splitTask(taskId, options);

    logger.info('Successfully split task', { 
      taskId,
      subtaskCount: subtasks.length
    }, 'task operations api');

    return NextResponse.json(subtasks);

  } catch (error) {
    if (error instanceof TaskNotFoundError) {
      logger.warn('Task not found for splitting', { taskId }, 'task operations api');
      return NextResponse.json(
        { error: 'Task not found' },
        { status: 404 }
      );
    }

    logger.error('Failed to split task', { taskId, error }, 'task operations api');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
