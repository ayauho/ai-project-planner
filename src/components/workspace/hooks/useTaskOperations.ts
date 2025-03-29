'use client';

import { useState, useCallback } from 'react';
import { splitHandler } from '@/components/workspace/visual/task-operations/split-handler';
import { logger } from '@/lib/client/logger';
import { TaskEventEmitter } from '@/lib/client/visual/task/events';
import { workspaceStateManager } from '@/lib/workspace/state/manager';

interface TaskOperation {
  taskId: string | null;
  isLoading: boolean;
  error: string | null;
}

export const useTaskOperations = () => {
  const [splitOperation, setSplitOperation] = useState<TaskOperation>({
    taskId: null,
    isLoading: false,
    error: null
  });
  
  const [deleteOperation, setDeleteOperation] = useState<TaskOperation>({
    taskId: null,
    isLoading: false,
    error: null
  });

  const handleSplit = useCallback(async (taskId: string) => {
    setSplitOperation({
      taskId,
      isLoading: true,
      error: null
    });

    try {
      await splitHandler(taskId);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to split task';
      logger.error('Split operation failed', { taskId, error }, 'task operations split error');
      
      setSplitOperation({
        taskId,
        isLoading: false,
        error: errorMessage
      });
      
      throw error;
    }

    setSplitOperation({
      taskId: null,
      isLoading: false,
      error: null
    });
  }, []);

  const handleDelete = useCallback(async (taskId: string) => {
    setDeleteOperation({
      taskId,
      isLoading: true,
      error: null
    });
    
    try {
      logger.info('Starting task deletion', { taskId }, 'task operations delete');
      
      // Get the state to find parent information before deletion
      const initialState = workspaceStateManager.getState();
      const task = initialState.tasks.find(t => t._id?.toString() === taskId);
      
      // Store parent task ID for counter update
      const parentTaskId = task?.parentId?.toString();
      const projectId = task?.projectId?.toString();
      
      // Emit an event to indicate that deletion is starting
      // Include parent task ID if available
      TaskEventEmitter.getInstance().emit({
        taskId,
        type: 'delete',
        data: {
          isStarting: true,
          parentTaskId
        }
      });
      
      // Call the API to delete the task
      const response = await fetch(`/api/tasks/${taskId}/delete`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        throw new Error(`Failed to delete task: ${response.statusText}`);
      }
      
      // Get the result data (unused)
      const _result = await response.json();
      
      // Find all descendant tasks that should be removed from state
      // This includes the task being deleted and any subtasks
      const currentState = workspaceStateManager.getState();
      const descendantTasks = currentState.tasks.filter(t => {
        // Check if this is the task being deleted
        if (t._id?.toString() === taskId) return true;
        
        // Check if this is a child of the task being deleted
        let currentTask = t;
        while (currentTask.parentId) {
          if (currentTask.parentId.toString() === taskId) return true;
          
          // Find the parent task
          const parent = currentState.tasks.find(p => p._id?.toString() === currentTask.parentId?.toString());
          if (!parent) break;
          
          currentTask = parent;
        }
        
        return false;
      });
      
      // Get the IDs of all tasks that should be removed
      const tasksToRemove = descendantTasks.map(t => t._id?.toString() || '').filter(Boolean);
      
      // Remove all these tasks from state
      workspaceStateManager.removeTasks(tasksToRemove);
      
      // If we had a parent task, check if it now has no children
      // We'll need to update the parent task's counter in the control layer
      let parentHasNoChildren = false;
      if (parentTaskId) {
        // Check if parent has any remaining children
        const parentTask = currentState.tasks.find(t => t._id?.toString() === parentTaskId);
        if (parentTask) {
          const remainingChildren = currentState.tasks.filter(t => t.parentId?.toString() === parentTaskId && 
            t._id?.toString() !== taskId
          );
          
          parentHasNoChildren = remainingChildren.length === 0;
          
          logger.debug('Checked parent task children status', {
            parentTaskId,
            remainingChildrenCount: remainingChildren.length,
            parentHasNoChildren
          }, 'task hierarchy operations');
          
          // If this was the last child of the parent, update the parent task in state
          if (parentHasNoChildren) {
            logger.info('Parent task has no more children, updating parent task', {
              parentTaskId,
              taskId,
              parentChildrenCount: parentTask.childrenCount
            }, 'task hierarchy operations');
            
            // Update the parent task in state to have zero children
            const updatedTasks = currentState.tasks.map(t => {
              if (t._id?.toString() === parentTaskId) {
                return {
                  ...t,
                  childrenCount: 0,
                  descendantCount: 0
                };
              }
              return t;
            });
            
            // Update state with parent task having zero children
            workspaceStateManager.updateTasks(updatedTasks);
          }
        }
      }
      
      // Check if this was the last task in the project
      const updatedState = workspaceStateManager.getState();
      const remainingTasks = updatedState.tasks.filter(t => 
        t._id?.toString() !== taskId && 
        !tasksToRemove.includes(t._id?.toString() || '')
      );
      
      const isLastTaskInProject = remainingTasks.length === 0;
      
      // This information will be used by the task control event dispatcher
      // to handle project deletion
      
      // Emit an event to indicate that deletion is complete
      TaskEventEmitter.getInstance().emit({
        taskId,
        type: 'deleteComplete',
        data: {
          success: true,
          parentTaskId,
          parentHasNoChildren,
          projectId,
          isLastTaskInProject
        }
      });
      
      // Save the updated state to reflect task deletion
      if (window.saveWorkspaceState) {
        logger.debug('Saving workspace state after task deletion', {}, 'task operations state');
        window.saveWorkspaceState();
      }
      
      logger.info('Task deletion completed successfully', { 
        taskId,
        tasksRemovedCount: tasksToRemove.length
      }, 'task operations delete');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete task';
      logger.error('Delete operation failed', { taskId, error }, 'task operations delete error');
      
      // Emit error event
      TaskEventEmitter.getInstance().emit({
        taskId,
        type: 'error',
        data: {
          error: errorMessage,
          operation: 'delete'
        }
      });
      
      setDeleteOperation({
        taskId,
        isLoading: false,
        error: errorMessage
      });
      
      throw error;
    }
    
    setDeleteOperation({
      taskId: null,
      isLoading: false,
      error: null
    });
  }, []);

  return {
    splitOperation,
    handleSplit,
    deleteOperation,
    handleDelete
  };
};
