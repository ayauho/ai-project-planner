import { NextRequest, NextResponse } from 'next/server';
import { TaskModel } from '@/lib/task/schema';
import { handleApiError } from '@/lib/error/api-handler';
import { withDatabase } from '@/lib/api/withDatabase';
import logger from '@/lib/logger';
import { authenticateRequest } from '@/lib/auth/middleware/authMiddleware';
import projectRepository from '@/lib/project/repository';async function getHandler(req: NextRequest): Promise<NextResponse>{
  // Extract project id from URL
  const { pathname } = new URL(req.url);
  const projectId = pathname.split('/')[3]; // /api/projects/[id]/tasks/count
  
  const requestContext = {
    url: req.url,
    method: req.method,
    projectId,
    headers: Object.fromEntries(req.headers.entries())
  };
  
  try {
    // Authenticate request
    const authenticatedRequest = await authenticateRequest(req);
    if (!authenticatedRequest.user) {
      logger.warn('Unauthorized access attempt to project task count', requestContext, 'project task count api auth');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify project exists and belongs to the authenticated user
    try {
      const project = await projectRepository.findById(projectId);
      
      // Verify project belongs to authenticated user
      if (project.userId.toString() !== authenticatedRequest.user.id) {
        logger.warn('User attempted to access task count for another user\'s project', {
          ...requestContext,
          userId: authenticatedRequest.user.id,
          projectOwnerId: project.userId.toString()
        }, 'project task count api auth');
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    } catch (projectError) {
      logger.warn('Failed to verify project ownership', { 
        projectId,
        error: projectError,
        userId: authenticatedRequest.user.id
      }, 'project task count api auth');
      
      // If project doesn't exist, return 404
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    logger.info('Fetching task count for project', { 
      projectId,
      userId: authenticatedRequest.user.id
    }, 'project task api');
    
    const count = await TaskModel.countDocuments({ projectId });
    return NextResponse.json({ count });
  } catch (error) {
    logger.error('Failed to fetch task count', { 
      error,
      context: requestContext
    }, 'project task count api');
    
    return handleApiError(error, {
      context: 'getTaskCount',
      url: req.url
    });
  }
}export const GET = withDatabase(getHandler);
