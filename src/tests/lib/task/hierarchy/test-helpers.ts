import mongoose from 'mongoose';
import { Task } from '../../../../lib/task/types';

export const createMockTask = (id: string, childrenCount = 0, descendantCount = 0): Task => {
  return {
    _id: new mongoose.Types.ObjectId(id),
    projectId: new mongoose.Types.ObjectId('507f1f77bcf86cd799439999'),
    name: 'Mock Task',
    description: 'Mock Description',
    position: { x: 0, y: 0 },
    childrenCount,
    descendantCount,
    createdAt: new Date(),
    updatedAt: new Date()
  };
};
