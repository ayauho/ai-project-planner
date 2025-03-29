import mongoose from 'mongoose';
import { getModel } from '@/lib/db/models';
import { Task } from './types';
import { TaskValidationError } from './errors';
import { logger } from '@/lib/logger';

const taskSchema = new mongoose.Schema<Task>({
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    required: [true, 'Project ID is required'],
    ref: 'Project'
  },
  parentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task'
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
    maxLength: [2000, 'Description is too long']
  },
  position: {
    x: { type: Number, required: [true, 'Position X coordinate is required'] },
    y: { type: Number, required: [true, 'Position Y coordinate is required'] }
  },
  childrenCount: {
    type: Number,
    default: 0,
    min: [0, 'Children count cannot be negative']
  },
  descendantCount: {
    type: Number,
    default: 0,
    min: [0, 'Descendant count cannot be negative']
  }
}, {
  timestamps: true
});

// Create indexes
taskSchema.index({ projectId: 1 });
taskSchema.index({ parentId: 1 });
taskSchema.index({ projectId: 1, parentId: 1 });

// Add validation middleware with proper error handling
taskSchema.pre('validate', function(next) {
  try {
    if (this.parentId?.toString() === this._id?.toString()) {
      const error = new TaskValidationError('Task cannot be its own parent');
      logger.error('Task validation failed', { taskId: this._id, error }, 'database schema validation');
      next(error);
      return;
    }

    // Validate position coordinates are numbers
    if (this.position) {
      const { x, y } = this.position;
      if (typeof x !== 'number' || typeof y !== 'number') {
        const error = new TaskValidationError('Position x and y must be numbers');
        logger.error('Task validation failed', { taskId: this._id, error }, 'database schema validation');
        next(error);
        return;
      }
    }
    next();
  } catch (err) {
    const error = err instanceof Error ? err : new Error('Unknown error during task validation');
    logger.error('Task validation failed', { taskId: this._id, error }, 'database schema error');
    next(error);
  }
});

export const TaskModel = getModel<Task>('Task', taskSchema);
