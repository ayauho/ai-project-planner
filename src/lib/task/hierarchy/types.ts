/**
 * Types and interfaces for task hierarchy management
 */

import { Types } from 'mongoose';
import { Task } from '../types';

export interface CountUpdateResult {
  childrenDelta: number;
  descendantDelta: number;
}

export interface HierarchyCounter {
  updateCounts(taskId: string | Types.ObjectId): Promise<void>;
  recalculateCounts(taskId: string | Types.ObjectId): Promise<void>;
  getTaskWithCounts(task: Task): Promise<Task>;
}
