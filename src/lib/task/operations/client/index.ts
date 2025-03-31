'use client';

import { logger } from '@/lib/client/logger';
import { Task } from '@/lib/task/types';
import { TaskGenerationError } from '../errors';
import { TaskGenerationOptions } from '../types';
import { Types } from 'mongoose';
import { processAIRequest, type AITaskResponse, type AITaskInput } from '@/lib/ai/client/processor';

interface SubtaskInput {
  name: string;
  description: string;
  position?: { x: number; y: number };
}

class TaskGeneratorClientImpl {
  // Track in-progress operations to prevent duplicates
  private inProgressOperations = new Set<string>();

  private async getAncestorChain(task: Task): Promise<Task[]>{
    const ancestors: Task[] = [];
    let currentTaskId = task.parentId;
    
    logger.debug('[TRACE] Starting ancestor chain collection', {
      taskId: task._id,
      taskName: task.name
    }, 'task-operations client');

    while (currentTaskId) {
      try {
        const response = await fetch(`/api/tasks/${currentTaskId}`);
        if (!response.ok) break;
        
        const parent = await response.json();
        logger.debug('[TRACE] Found ancestor', {
          parentId: parent._id,
          parentName: parent.name
        }, 'task-operations client');
        
        ancestors.push(parent); // Add to end to maintain closest->project order
        currentTaskId = parent.parentId;
      } catch (error) {
        logger.warn('Failed to fetch ancestor', { currentTaskId, error }, 'task-operations client warning');
        break;
      }
    }

    // Add project at the end if not already included
    const projectId = task.projectId?.toString();
    if (projectId && !ancestors.some(a =>a._id?.toString() === projectId)) {
      try {
        const projectResponse = await fetch(`/api/projects/${projectId}`);
        if (projectResponse.ok) {
          const project = await projectResponse.json();
          logger.debug('[TRACE] Adding project to chain', {
            projectId: project._id,
            projectName: project.name
          }, 'task-operations client');
          ancestors.push({ ...project, isProjectRoot: true });
        }
      } catch (error) {
        logger.warn('Failed to fetch project', { projectId, error }, 'task-operations client warning');
      }
    }

    logger.debug('[TRACE] Completed ancestor chain collection', {
      taskId: task._id?.toString(),
      chainLength: ancestors.length,
      chain: ancestors.map((a, i) =>({ 
        id: a._id?.toString() || 'unknown', 
        name: a.name,
        position: i
      }))
    }, 'task-operations client');

    return ancestors;
  }

  /**
   * Safely fetch sibling tasks with fallback and error handling
   */
  private async getSiblingTasks(task: Task, taskId: string | Types.ObjectId): Promise<Task[]>{
    try {
      let siblings: Task[] = [];
      let endpoint = '';
      const taskIdStr = taskId.toString();
      
      logger.debug('[TRACE] Fetching siblings for task', { 
        taskId: taskIdStr,
        parentId: task.parentId?.toString(),
        projectId: task.projectId?.toString()
      }, 'task-operations client');
      
      // Case 1: Task has a parent - fetch siblings from parent's children
      if (task.parentId) {
        endpoint = `/api/tasks/${task.parentId}/children`;
        logger.debug('[TRACE] Fetching siblings from parent task', { parentId: task.parentId }, 'task-operations client');
      } 
      // Case 2: Task is direct child of project - fetch project children
      else if (task.projectId) {
        endpoint = `/api/tasks/${task.projectId}/children`;
        logger.debug('[TRACE] Fetching siblings from project', { projectId: task.projectId }, 'task-operations client');
      }
      // Case 3: No valid parent/project reference
      else {
        logger.warn('Cannot fetch siblings - no parent or project reference', { taskId }, 'task-operations client warning');
        return [];
      }
      
      // Fetch siblings
      logger.debug('[TRACE] Sending request to endpoint', { endpoint }, 'task-operations client');
      const siblingsResponse = await fetch(endpoint);
      
      if (siblingsResponse.ok) {
        const siblingsData = await siblingsResponse.json();
        
        logger.debug('[TRACE] Raw siblings data received', { 
          count: Array.isArray(siblingsData) ? siblingsData.length : 0,
          isArray: Array.isArray(siblingsData)
        }, 'task-operations client');
        
        // Filter out the current task and any invalid entries
        siblings = Array.isArray(siblingsData) 
          ? siblingsData.filter((sibling: Task) =>{
              // Make sure the sibling has an ID
              if (!sibling._id) {
                logger.warn('Found sibling without ID', { sibling }, 'task-operations client warning');
                return false;
              }
              
              // Compare string values to ensure proper comparison
              const siblingId = sibling._id.toString();
              const currentTaskId = taskIdStr;
              
              // Filter out the current task being regenerated
              const isNotCurrentTask = siblingId !== currentTaskId;
              
              if (!isNotCurrentTask) {
                logger.debug('[TRACE] Filtering out current task from siblings', { 
                  siblingId, 
                  currentTaskId 
                }, 'task-operations client');
              }
              
              return isNotCurrentTask;
            })
          : [];
        
        logger.debug('[TRACE] Fetched and filtered siblings successfully', { 
          taskId,
          siblingCount: siblings.length,
          siblingIds: siblings.map((s: Task) =>s._id?.toString())
        }, 'task-operations client');
      } else {
        logger.warn('Failed to fetch siblings', { 
          taskId,
          endpoint,
          status: siblingsResponse.status,
          statusText: siblingsResponse.statusText
        }, 'task-operations client warning');
        
        // Try to get error details
        try {
          const errorText = await siblingsResponse.text();
          logger.warn('Siblings fetch error details', { errorText }, 'task-operations client warning');
        // eslint-disable-next-line unused-imports/no-unused-vars
        } catch (_error) {
          // Ignore read errors
        }
      }
      
      return siblings;
    } catch (error) {
      logger.error('Error fetching siblings', { 
        taskId, 
        error: error instanceof Error ? error.message : String(error) 
      }, 'task-operations client error');
      return [];
    }
  }

  async splitTask(taskId: string | Types.ObjectId, _options?: TaskGenerationOptions): Promise<Task[]>{
    const taskIdStr = taskId.toString();
    
    // Check if this operation is already in progress
    if (this.inProgressOperations.has(`split-${taskIdStr}`)) {
      logger.warn('Split operation already in progress for this task', { taskId: taskIdStr }, 'task-operations client');
      throw new TaskGenerationError('An operation is already in progress for this task');
    }
    
    // Mark operation as in progress
    this.inProgressOperations.add(`split-${taskIdStr}`);
    
    try {
      logger.info('Starting task split operation', { taskId: taskIdStr }, 'task-operations client');

      // Check if body has no-api-key class
      if (document.body.classList.contains('no-api-key')) {
        const error = new Error('OpenAI API key is required to split tasks. Please configure your API key in the side panel.');
        
        // Try to report the error through the error connector
        try {
          import('@/lib/client/error-connector').then(({ aiErrorConnector }) =>{
            aiErrorConnector.reportAIError(error, 'split');
          }).catch(() =>{
            // If import fails, continue with regular error handling
          });
        } catch (reportError) {
          // Ignore errors from the reporting mechanism
        }
        
        throw error;
      }

      // Get task data
      const taskResponse = await fetch(`/api/tasks/${taskId}`);
      if (!taskResponse.ok) {
        throw new Error(`Failed to get task data: ${taskResponse.statusText}`);
      }
      const task = await taskResponse.json();

      // Get ancestor chain
      const ancestors = await this.getAncestorChain(task);
      
      logger.debug('[TRACE] Preparing AI request', {
        taskId: task._id?.toString(),
        taskName: task.name,
        ancestorCount: ancestors.length,
        ancestorNames: ancestors.map((a, i) =>`${i}: ${a.name}`)
      }, 'task-operations client');

      // Extract only the needed fields for AI processing
      const aiTaskInput: AITaskInput = {
        name: task.name,
        description: task.description,
        definition: 'task'
      };

      const ancestorInputs: AITaskInput[] = ancestors.map(ancestor =>({
        name: ancestor.name,
        description: ancestor.description,
        definition: ancestor.isProjectRoot ? 'project' : 'task'
      }));

      // Process with AI
      const aiSubtasks = await processAIRequest('split', {
        task: aiTaskInput,
        ancestors: ancestorInputs
      });

      // Create subtasks
      const createResponse = await fetch(`/api/tasks/${taskId}/subtasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          subtasks: aiSubtasks.map((subtask: AITaskResponse): SubtaskInput =>({
            name: subtask.name,
            description: subtask.description,
            position: { x: 0, y: 0 }
          }))
        })
      });

      if (!createResponse.ok) {
        throw new Error(`Failed to create subtasks: ${createResponse.statusText}`);
      }

      const subtasks = await createResponse.json();
      
      logger.info('Successfully split task', {
        taskId: task._id?.toString(),
        subtasksCount: subtasks.length,
        ancestorCount: ancestors.length
      }, 'task-operations client success');

      return subtasks;

    } catch (error) {
      logger.error('Failed to split task', { 
        taskId: taskIdStr, 
        error: error instanceof Error ? error.message : String(error) 
      }, 'task-operations client error');
      
      // Try to report the error through the error connector
      try {
        import('@/lib/client/error-connector').then(({ aiErrorConnector }) =>{
          aiErrorConnector.reportAIError(
            error instanceof Error ? error : String(error), 
            'split'
          );
        }).catch(() =>{
          // If import fails, continue with regular error handling
        });
      } catch (reportError) {
        // Ignore errors from the reporting mechanism
      }
      
      // Use the original error message rather than a generic one
      // This helps avoid duplicate error messages
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new TaskGenerationError(errorMessage, error instanceof Error ? error : undefined);
    } finally {
      // Always remove from in-progress operations, even if there was an error
      this.inProgressOperations.delete(`split-${taskIdStr}`);
    }
  }  
  
  async regenerateTask(taskId: string | Types.ObjectId, options?: TaskGenerationOptions): Promise<Task>{
    const taskIdStr = taskId.toString();
    
    // Check if this operation is already in progress
    if (this.inProgressOperations.has(`regenerate-${taskIdStr}`)) {
      logger.warn('Regenerate operation already in progress for this task', { taskId: taskIdStr }, 'task-operations client');
      throw new TaskGenerationError('An operation is already in progress for this task');
    }
    
    // Mark operation as in progress
    this.inProgressOperations.add(`regenerate-${taskIdStr}`);
    
    try {
      logger.info('Starting task regeneration', { 
        taskId: taskIdStr,
        shouldRemoveSubtasks: options?.shouldRemoveSubtasks 
      }, 'task-operations client');
      
      // Check if body has no-api-key class
      if (document.body.classList.contains('no-api-key')) {
        const error = new Error('OpenAI API key is required to regenerate tasks. Please configure your API key in the side panel.');
        
        // Try to report the error through the error connector
        try {
          import('@/lib/client/error-connector').then(({ aiErrorConnector }) =>{
            aiErrorConnector.reportAIError(error, 'regenerate');
          }).catch(() =>{
            // If import fails, continue with regular error handling
          });
        } catch (reportError) {
          // Ignore errors from the reporting mechanism
        }
        
        throw error;
      }

      // Get task data for context
      const taskResponse = await fetch(`/api/tasks/${taskId}`);
      if (!taskResponse.ok) {
        throw new Error(`Failed to get task data: ${taskResponse.statusText}`);
      }
      const task = await taskResponse.json();

      // Get ancestor chain
      const ancestors = await this.getAncestorChain(task);
      
      logger.debug('[TRACE] Preparing AI regeneration request', {
        taskId: task._id?.toString(),
        taskName: task.name,
        ancestorCount: ancestors.length
      }, 'task-operations client');

      // Get siblings for better context - ensuring the current task is filtered out
      const siblings = await this.getSiblingTasks(task, taskId);
      
      logger.debug('[TRACE] Fetched siblings for context', {
        taskId: task._id?.toString(),
        siblingCount: siblings.length,
        siblingNames: siblings.map(s =>s.name)
      }, 'task-operations client');

      // Extract needed fields for AI processing
      const aiTaskInput: AITaskInput = {
        name: task.name,
        description: task.description,
        definition: 'task'
      };

      const ancestorInputs: AITaskInput[] = ancestors.map(ancestor =>({
        name: ancestor.name,
        description: ancestor.description,
        definition: ancestor.isProjectRoot ? 'project' : 'task'
      }));

      const siblingInputs: AITaskInput[] = siblings.map(sibling =>({
        name: sibling.name,
        description: sibling.description,
        definition: 'task'
      }));

      logger.debug('[TRACE] Prepared inputs for AI', {
        taskInput: {
          name: aiTaskInput.name,
          definition: aiTaskInput.definition
        },
        ancestorCount: ancestorInputs.length,
        siblingCount: siblingInputs.length
      }, 'task-operations client');

      // Process with AI - use regenerate operation
      const aiResult = await processAIRequest('regenerate', {
        task: aiTaskInput,
        ancestors: ancestorInputs,
        siblings: siblingInputs
      });

      if (!aiResult?.[0]) {
        throw new Error('Invalid AI response for regeneration');
      }

      const newTaskContent = aiResult[0];
      logger.debug('[TRACE] Received AI response for regeneration', {
        newName: newTaskContent.name,
        descriptionLength: newTaskContent.description?.length || 0
      }, 'task-operations client');

      // Send update to the API
      const updateResponse = await fetch(`/api/tasks/${taskId}/regenerate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: newTaskContent.name,
          description: newTaskContent.description,
          resetCounts: options?.shouldRemoveSubtasks
        })
      });

      if (!updateResponse.ok) {
        throw new Error(`Failed to update task: ${updateResponse.statusText}`);
      }

      const updatedTask = await updateResponse.json();
      
      // If subtasks were removed, ensure the counts are reset in the UI
      if (options?.shouldRemoveSubtasks) {
        updatedTask.childrenCount = 0;
        updatedTask.descendantCount = 0;
      }
      
      logger.info('Successfully regenerated task', { 
        taskId,
        oldName: task.name,
        newName: updatedTask.name,
        subtasksRemoved: options?.shouldRemoveSubtasks
      }, 'task-operations client success');
      
      return updatedTask;

    } catch (error) {
      logger.error('Failed to regenerate task', { 
        taskId: taskIdStr, 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      }, 'task-operations client error');
      
      // Try to report the error through the error connector
      try {
        import('@/lib/client/error-connector').then(({ aiErrorConnector }) =>{
          aiErrorConnector.reportAIError(
            error instanceof Error ? error : String(error), 
            'regenerate'
          );
        }).catch(() =>{
          // If import fails, continue with regular error handling
        });
      } catch (reportError) {
        // Ignore errors from the reporting mechanism
      }
      
      // Use the original error message rather than a generic one
      // This helps avoid duplicate error messages
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new TaskGenerationError(errorMessage, error instanceof Error ? error : undefined);
    } finally {
      // Always remove from in-progress operations, even if there was an error
      this.inProgressOperations.delete(`regenerate-${taskIdStr}`);
    }
  }
}

export const taskGenerator = new TaskGeneratorClientImpl();
