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

export interface TaskWithVisualState extends Task {
  visualState?: 'active' | 'semi-transparent' | 'hidden';
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

export type TaskVisualState = 'active' | 'semi-transparent' | 'hidden';