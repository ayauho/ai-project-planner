import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth/middleware/authMiddleware';
import { handleApiError } from '@/lib/error/api-handler';
import { withDatabase } from '@/lib/api/withDatabase';
import projectRepository from '@/lib/project/repository';
import { taskRepository } from '@/lib/task/repository';
import logger from '@/lib/logger';
import { ObjectId } from 'mongodb';
import { createApiError } from '@/lib/error/api-error';

async function handler(req: NextRequest) {
  const id = req.url.split('/').pop();
  
  const requestContext = {
    url: req.url,
    method: req.method,
    projectId: id,
    headers: Object.fromEntries(req.headers.entries())
  };

  try {
    // Authenticate request
    const authenticatedRequest = await authenticateRequest(req);
    if (!authenticatedRequest.user) {
      throw new Error('No user in authenticated request');
    }

    if (!id || !ObjectId.isValid(id)) {
      const error = createApiError('Invalid project ID', 400);
      return handleApiError(error, {
        ...requestContext,
        errorType: 'Validation'
      });
    }

    const project = await projectRepository.findById(id);

    // Verify project belongs to user
    if (project.userId.toString() !== authenticatedRequest.user.id) {
      const error = createApiError('Unauthorized access to project', 403);
      return handleApiError(error, {
        ...requestContext,
        errorType: 'Authorization'
      });
    }

    if (req.method === 'GET') {
      return NextResponse.json(project);
    }

    if (req.method === 'DELETE') {
      logger.info('Starting project deletion process', { projectId: id }, 'project api');
      
      // Delete all tasks first
      const { deletedCount } = await taskRepository.deleteByProjectId(id);
      logger.info('Deleted project tasks', { projectId: id, deletedCount }, 'project task api');

      // Delete the project
      await projectRepository.delete(id);
      logger.info('Project deleted successfully', { projectId: id }, 'project api');

      return NextResponse.json({ 
        success: true,
        deletedTasks: deletedCount
      });
    }

    // Method not allowed
    const error = createApiError(`Method ${req.method} not allowed`, 405);
    return handleApiError(error, {
      ...requestContext,
      errorType: 'Method'
    });
  } catch (error) {
    return handleApiError(error, requestContext);
  }
}

export const GET = withDatabase(handler);
export const DELETE = withDatabase(handler);
