// Import the unified TaskVisualState type from workspace state types
import { TaskVisualState } from '@/lib/workspace/state/types';
import { ObjectId } from 'mongodb';

export interface Task {
  _id?: ObjectId;
  projectId: ObjectId;
  parentId?: ObjectId;
  name: string;
  description: string;
  position: {
    x: number;
    y: number;
  };
  childrenCount: number;
  descendantCount: number;
  isProjectRoot?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

// Use the imported TaskVisualState to ensure it's used
export interface TaskWithVisualState extends Task {
  visualState?: TaskVisualState;
}

export interface SystemUpdateTaskInput {
  childrenCount?: number;
  descendantCount?: number;
}

export interface CreateTaskInput {
  projectId: ObjectId;
  parentId?: ObjectId;
  name: string;
  description: string;
  position?: {
    x: number;
    y: number;
  };
  childrenCount?: number;
  descendantCount?: number;
}

export interface UpdateTaskInput {
  name?: string;
  description?: string;
  position?: {
    x: number;
    y: number;
  };
  childrenCount?: number;
  descendantCount?: number;
}
