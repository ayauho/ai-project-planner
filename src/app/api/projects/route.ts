import { NextRequest, NextResponse } from 'next/server';
import projectRepository from '@/lib/project/repository';
import { authenticateRequest } from '@/lib/auth/middleware/authMiddleware';
import { handleApiError } from '@/lib/error/api-handler';
import { withDatabase } from '@/lib/api/withDatabase';
import mongoose from 'mongoose';
import logger from '@/lib/logger';
import { createApiError } from '@/lib/error/api-error';

async function getHandler(request: NextRequest) {
  const requestContext = {
    url: request.url,
    method: request.method,
    headers: Object.fromEntries(request.headers.entries())
  };

  try {
    // Authenticate request
    const authenticatedRequest = await authenticateRequest(request);
    if (!authenticatedRequest.user) {
      throw new Error('No user in authenticated request');
    }

    logger.info('Fetching projects for user', { 
      userId: authenticatedRequest.user.id 
    }, 'project api');

    const projects = await projectRepository.findByUserId(authenticatedRequest.user.id);
    return NextResponse.json(projects);
  } catch (error) {
    return handleApiError(error, requestContext);
  }
}

async function postHandler(request: NextRequest) {
  const requestContext = {
    url: request.url,
    method: request.method,
    headers: Object.fromEntries(request.headers.entries())
  };

  try {
    // Authenticate request
    const authenticatedRequest = await authenticateRequest(request);
    if (!authenticatedRequest.user) {
      throw new Error('No user in authenticated request');
    }

    // Parse request body
    let body;
    try {
      body = await request.json();
    } catch (parseError) {
      return handleApiError(parseError, {
        ...requestContext,
        errorType: 'RequestParsing'
      });
    }

    const { name, description } = body;
    if (!name || !description) {
      const error = createApiError('Name and description are required', 400);
      return handleApiError(error, {
        ...requestContext,
        errorType: 'Validation',
        providedFields: { name: !!name, description: !!description }
      });
    }

    logger.info('Creating new project', { 
      ...requestContext,
      name, 
      userId: authenticatedRequest.user.id 
    }, 'project api');

    try {
      // Create project
      const project = await projectRepository.create({
        name,
        description,
        userId: new mongoose.Types.ObjectId(authenticatedRequest.user.id)
      });

      if (!project._id) {
        throw new Error('Project ID is undefined after creation');
      }

      // For client-side project creation, we just return the project immediately
      // Client will handle AI processing and task creation
      return NextResponse.json(project);
      
    } catch (operationError) {
      return handleApiError(operationError, {
        ...requestContext,
        errorType: 'ProjectCreation'
      });
    }
  } catch (error) {
    return handleApiError(error, requestContext);
  }
}

export const GET = withDatabase(getHandler);
export const POST = withDatabase(postHandler);
