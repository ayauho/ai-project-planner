/**
 * Mock types for project selection tests
 */

import { ObjectId } from 'mongoose';

export interface MockProject {
  _id: ObjectId;
  userId: ObjectId;
  name: string;
  description: string;
  createdAt: Date;
  updatedAt?: Date;
  rootTaskId?: ObjectId;
}
