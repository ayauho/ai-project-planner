/**
 * Types for task operations including generation and deletion
 */
import { ObjectId } from 'mongodb';
import { Task } from '../types';

export interface TaskGenerationOptions {
  validateOnly?: boolean;
  ancestors?: Task[];  // Add ancestors option for providing task context
  shouldRemoveSubtasks?: boolean; // Flag to indicate subtasks should be removed during regeneration
}

export interface TaskGenerationService {
  splitTask(taskId: string | ObjectId, options?: TaskGenerationOptions): Promise<Task[]>;
  regenerateTask(taskId: string | ObjectId, options?: TaskGenerationOptions): Promise<Task>;
}

export interface TaskDeletionService {
  deleteTask(taskId: string | ObjectId): Promise<void>;
  deleteTaskRecursive(taskId: string | ObjectId): Promise<void>;
}

export interface AITaskResponse {
  name: string;
  description: string;
}
