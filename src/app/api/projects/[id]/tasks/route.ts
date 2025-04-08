import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { taskRepository } from '@/lib/task/repository';
import projectRepository from '@/lib/project/repository';
import { handleApiError } from '@/lib/error/api-handler';
import { logger } from '@/lib/logger';
import { CreateTaskInput } from '@/lib/task/types';
import { authenticateRequest } from '@/lib/auth/middleware/authMiddleware';
import { withDatabase } from '@/lib/api/withDatabase';

async function getHandler(request: NextRequest) {
  // Extract the project ID from the URL path
  const { pathname } = new URL(request.url);
  const segments = pathname.split('/');
  const id = segments[3]; // /api/projects/[id]/tasks
  
  const requestContext = {
    url: request.url,
    method: request.method,
    projectId: id,
    headers: Object.fromEntries(request.headers.entries())
  };
  
  try {
    // Authenticate request
    const authenticatedRequest = await authenticateRequest(request);
    if (!authenticatedRequest.user) {
      logger.warn('Unauthorized access attempt to project tasks', requestContext, 'project task api auth');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Verify project exists first
    const project = await projectRepository.findById(id);
    
    // Verify project belongs to authenticated user
    if (project.userId.toString() !== authenticatedRequest.user.id) {
      logger.warn('User attempted to access tasks for another user\'s project', {
        ...requestContext,
        userId: authenticatedRequest.user.id,
        projectOwnerId: project.userId.toString()
      }, 'project task api auth');
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    
    logger.info('Fetching project tasks', {
      ...requestContext,
      userId: authenticatedRequest.user.id
    }, 'project task api');
    
    const tasks = await taskRepository.findByProjectId(id);
    
    logger.info('Project tasks fetched successfully', {
      ...requestContext,
      userId: authenticatedRequest.user.id,
      tasksCount: tasks.length
    }, 'project task api');
    
    return NextResponse.json({
      project,
      tasks
    });
  } catch (error) {
    logger.error('Failed to fetch project tasks', { 
      error,
      context: requestContext
    }, 'project task api');
    
    return handleApiError(error, {
      ...requestContext,
      errorType: 'TaskFetch'
    });
  }
}

async function postHandler(request: NextRequest) {
  // Extract the project ID from the URL path
  const { pathname } = new URL(request.url);
  const segments = pathname.split('/');
  const id = segments[3]; // /api/projects/[id]/tasks
  
  const requestContext = {
    url: request.url,
    method: request.method,
    projectId: id,
    headers: Object.fromEntries(request.headers.entries())
  };
  
  try {
    // Authenticate request
    const authenticatedRequest = await authenticateRequest(request);
    if (!authenticatedRequest.user) {
      logger.warn('Unauthorized access attempt to create project tasks', requestContext, 'project task api auth');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify valid project ID
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid project ID' }, { status: 400 });
    }
    
    // Verify project exists
    const project = await projectRepository.findById(id);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    
    // Verify project belongs to authenticated user
    if (project.userId.toString() !== authenticatedRequest.user.id) {
      logger.warn('User attempted to create tasks for another user\'s project', {
        ...requestContext,
        userId: authenticatedRequest.user.id,
        projectOwnerId: project.userId.toString()
      }, 'project task api auth');
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    
    // Parse request body
    const { tasks } = await request.json();
    if (!Array.isArray(tasks)) {
      return NextResponse.json({ error: 'Tasks must be an array' }, { status: 400 });
    }
    
    logger.info('Creating tasks for project', {
      ...requestContext,
      userId: authenticatedRequest.user.id,
      tasksCount: tasks.length
    }, 'project task api');
    
    // Create tasks in the database
    const taskPromises = tasks.map((task) => {
      const taskInput: CreateTaskInput = {
        projectId: new mongoose.Types.ObjectId(id),
        name: task.name,
        description: task.description,
        position: task.position
      };
      return taskRepository.create(taskInput);
    });
    const createdTasks = await Promise.all(taskPromises);
    
    logger.info('Tasks created for project', {
      ...requestContext,
      userId: authenticatedRequest.user.id,
      tasksCount: createdTasks.length
    }, 'project task api');
    
    return NextResponse.json(createdTasks);
  } catch (error) {
    logger.error('Failed to create tasks', { 
      error,
      context: requestContext
    }, 'project task api');
    
    return handleApiError(error, {
      ...requestContext,
      errorType: 'TaskCreate'
    });
  }
}

// Export the wrapped handlers
export const GET = withDatabase(getHandler);
export const POST = withDatabase(postHandler);