import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { taskRepository } from '@/lib/task/repository';
import projectRepository from '@/lib/project/repository';
import { handleApiError } from '@/lib/error/api-handler';
import { logger } from '@/lib/logger';
import { CreateTaskInput } from '@/lib/task/types';
import { IdRouteContext } from '@/lib/api/route-types';

// VARIANT 1: Most basic approach with minimal typing
export async function GET(request: Request, context: IdRouteContext) {
  const id = context.params.id;
  const requestContext = {
    url: request.url,
    method: request.method,
    projectId: id
  };
  
  try {
    // Verify project exists first
    const project = await projectRepository.findById(id);
    
    logger.info('Fetching project tasks', requestContext, 'project task api');
    
    const tasks = await taskRepository.findByProjectId(id);
    
    logger.info('Project tasks fetched successfully', {
      ...requestContext,
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

export async function POST(request: Request, context: IdRouteContext) {
  const id = context.params.id;
  const requestContext = {
    url: request.url,
    method: request.method,
    projectId: id
  };
  
  try {
    // Verify valid project ID
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid project ID' }, { status: 400 });
    }

    // Verify project exists
    const project = await projectRepository.findById(id);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Parse request body
    const { tasks } = await request.json();
    if (!Array.isArray(tasks)) {
      return NextResponse.json({ error: 'Tasks must be an array' }, { status: 400 });
    }

    logger.info('Creating tasks for project', {
      ...requestContext,
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
