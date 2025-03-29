import mongoose from 'mongoose';
import { getModel } from '@/lib/db/models';
import type { Project } from './types';

const projectSchema = new mongoose.Schema<Project>({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: [true, 'User ID is required'],
    ref: 'User'
  },
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    minlength: [1, 'Name is required'],
    maxlength: [200, 'Name is too long']
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    trim: true,
    minlength: [1, 'Description is required'],
    maxlength: [2000, 'Description is too long']
  },
  rootTaskId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task'
  }
}, {
  timestamps: true
});

// Create indexes (will be created only if they don't exist)
projectSchema.index({ userId: 1 });
projectSchema.index({ createdAt: 1 });

export const ProjectModel = getModel<Project>('Project', projectSchema);
