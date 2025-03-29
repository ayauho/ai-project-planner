import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { authenticateRequest } from '@/lib/auth/middleware/authMiddleware';
import { taskRepository } from '@/lib/task/repository';
import { Types } from 'mongoose';
import { TaskIdRouteContext } from '@/lib/api/route-types';

interface SubtaskInput {
  name: string;
  description: string;
  position?: { x: number; y: number };
}

interface CreateSubtasksBody {
  subtasks: SubtaskInput[];
}

export async function POST(
  request: NextRequest,
  context: TaskIdRouteContext
) {
  const { taskId } = context.params;
  
  try {
    const authenticatedRequest = await authenticateRequest(request);
    if (!authenticatedRequest.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parentTask = await taskRepository.findById(taskId);
    if (!parentTask) {
      return NextResponse.json({ error: 'Parent task not found' }, { status: 404 });
    }

    const body = await request.json() as CreateSubtasksBody;
    if (!body.subtasks || !Array.isArray(body.subtasks)) {
      return NextResponse.json({ error: 'Invalid subtasks data' }, { status: 400 });
    }

    logger.info('Creating subtasks for task', { 
      taskId,
      subtaskCount: body.subtasks.length
    }, 'task hierarchy api');

    const subtasks = await Promise.all(
      body.subtasks.map((subtask: SubtaskInput) => 
        taskRepository.create({
          projectId: parentTask.projectId,
          parentId: new Types.ObjectId(taskId),
          name: subtask.name,
          description: subtask.description,
          position: subtask.position || { x: 0, y: 0 }
        })
      )
    );

    logger.info('Successfully created subtasks', { 
      taskId,
      subtaskCount: subtasks.length
    }, 'task hierarchy api');
    
    return NextResponse.json(subtasks);

  } catch (error) {
    logger.error('Failed to create subtasks', { taskId, error }, 'task hierarchy api');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
