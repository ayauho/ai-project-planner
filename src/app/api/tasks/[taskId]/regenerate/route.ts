import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { authenticateRequest } from '@/lib/auth/middleware/authMiddleware';
import { taskRepository } from '@/lib/task/repository';
import { TaskIdRouteContext } from '@/lib/api/route-types';

// Define type for task updates
interface TaskUpdateData {
  name: string;
  description: string;
  childrenCount?: number;
  descendantCount?: number;
}

export async function POST(
  request: NextRequest,
  context: TaskIdRouteContext
) {
  try {
    const { taskId } = context.params;
    
    const authenticatedRequest = await authenticateRequest(request);
    if (!authenticatedRequest.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const task = await taskRepository.findById(taskId);
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }
    
    // Get request body for new content
    const body = await request.json();
    if (!body.name || !body.description) {
      return NextResponse.json({ error: 'Name and description required' }, { status: 400 });
    }
    
    logger.info('Regenerating task', { 
      taskId,
      oldName: task.name,
      newName: body.name,
      resetCounts: !!body.resetCounts
    }, 'task operations api');
    
    // Prepare update data
    const updateData: TaskUpdateData = {
      name: body.name,
      description: body.description
    };
    
    // If resetCounts flag is true, also reset the children and descendant counts
    if (body.resetCounts) {
      updateData.childrenCount = 0;
      updateData.descendantCount = 0;
      
      logger.debug('Resetting task counts during regeneration', {
        taskId,
        previousChildrenCount: task.childrenCount,
        previousDescendantCount: task.descendantCount
      }, 'task operations hierarchy');
    }
    
    // Update task with new content
    const updatedTask = await taskRepository.update(taskId, updateData);
    
    // If the task has a parent and counts were reset, update parent counts
    if (body.resetCounts && task.parentId) {
      try {
        logger.debug('Recalculating parent counts after regeneration', {
          taskId,
          parentId: task.parentId
        }, 'task hierarchy api');
        
        // Get parent task
        const parentTask = await taskRepository.findById(task.parentId);
        if (parentTask) {
          // Get all children of parent to recalculate counts
          const siblings = await taskRepository.findChildren(task.parentId);
          
          // Calculate new counts
          const childrenCount = siblings.length;
          let descendantCount = 0;
          
          // Sum up descendant counts from all children
          for (const sibling of siblings) {
            descendantCount += (sibling.childrenCount || 0) + (sibling.descendantCount || 0);
          }
          
          // Update parent with new counts
          if (parentTask._id) {
            await taskRepository.update(parentTask._id, {
              childrenCount,
              descendantCount
            });
          }
          
          logger.debug('Updated parent counts after regeneration', {
            parentId: parentTask._id,
            newChildrenCount: childrenCount,
            newDescendantCount: descendantCount
          }, 'task hierarchy api');
        }
      } catch (error) {
        logger.warn('Failed to update parent counts after regeneration', {
          taskId,
          parentId: task.parentId,
          error
        }, 'task hierarchy api');
        // Continue even if parent update fails
      }
    }
    
    logger.info('Successfully regenerated task', { taskId }, 'task operations api');
    return NextResponse.json(updatedTask);
  } catch (error) {
    logger.error('Failed to regenerate task', { 
      taskId: context.params.taskId, 
      error 
    }, 'task operations api');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
