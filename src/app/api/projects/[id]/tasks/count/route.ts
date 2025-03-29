import { NextRequest, NextResponse } from 'next/server';
import { TaskModel } from '@/lib/task/schema';
import { handleApiError } from '@/lib/error/api-handler';
import { withDatabase } from '@/lib/api/withDatabase';
import logger from '@/lib/logger';

async function getHandler(req: NextRequest): Promise<NextResponse> {
  try {
    // Extract project id from URL
    const { pathname } = new URL(req.url);
    const projectId = pathname.split('/')[3]; // /api/projects/[id]/tasks/count

    logger.info('Fetching task count for project', { projectId }, 'project task api');
    const count = await TaskModel.countDocuments({ projectId });
    return NextResponse.json({ count });
  } catch (error) {
    return handleApiError(error, {
      context: 'getTaskCount',
      url: req.url
    });
  }
}

export const GET = withDatabase(getHandler);
