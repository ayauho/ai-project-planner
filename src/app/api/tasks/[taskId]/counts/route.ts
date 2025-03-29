import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { authenticateRequest } from '@/lib/auth/middleware/authMiddleware';
import { hierarchyCounter } from '@/lib/task/hierarchy';
import { TaskNotFoundError } from '@/lib/task/errors';
import { TaskIdRouteContext } from '@/lib/api/route-types';

export async function POST(
  request: NextRequest,
  context: TaskIdRouteContext
) {
  const { taskId } = context.params;
  try {
    logger.info('Processing task counts update request', { taskId }, 'task hierarchy api');
    const authenticatedRequest = await authenticateRequest(request);
    if (!authenticatedRequest.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    await hierarchyCounter.updateCounts(taskId);
    logger.info('Successfully updated task counts', { taskId }, 'task hierarchy api');
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof TaskNotFoundError) {
      logger.warn('Task not found for count update', { taskId }, 'task hierarchy api');
      return NextResponse.json(
        { error: 'Task not found' },
        { status: 404 }
      );
    }
    logger.error('Failed to update task counts', { taskId, error }, 'task hierarchy api');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  context: TaskIdRouteContext
) {
  const { taskId } = context.params;
  try {
    logger.info('Processing task counts recalculation request', { taskId }, 'task hierarchy api');
    const authenticatedRequest = await authenticateRequest(request);
    if (!authenticatedRequest.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    await hierarchyCounter.recalculateCounts(taskId);
    logger.info('Successfully recalculated task counts', { taskId }, 'task hierarchy api');
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof TaskNotFoundError) {
      logger.warn('Task not found for count recalculation', { taskId }, 'task hierarchy api');
      return NextResponse.json(
        { error: 'Task not found' },
        { status: 404 }
      );
    }
    logger.error('Failed to recalculate task counts', { taskId, error }, 'task hierarchy api');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
