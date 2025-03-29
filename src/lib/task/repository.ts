import { ObjectId } from 'mongodb';
import { Task, CreateTaskInput, UpdateTaskInput } from './types';
import { TaskModel } from './schema';
import { TaskNotFoundError, TaskValidationError } from './errors';
import { logger } from '@/lib/logger';

export class TaskRepository {
  async create(input: CreateTaskInput): Promise<Task> {
    try {
      const task = new TaskModel(input);
      await task.save();
      
      logger.info('Task created successfully', { taskId: task._id }, 'database task');
      return task.toObject();
    } catch (error) {
      logger.error('Failed to create task', { error, input }, 'database task error');
      if (error instanceof Error) {
        throw new TaskValidationError(error.message);
      }
      throw error;
    }
  }

  async findById(id: ObjectId | string): Promise<Task> {
    try {
      const task = await TaskModel.findById(id);
      if (!task) {
        throw new TaskNotFoundError(id.toString());
      }
      return task.toObject();
    } catch (error) {
      logger.error('Failed to find task', { error, taskId: id }, 'database task error');
      throw error;
    }
  }

  async findByProjectId(projectId: ObjectId | string): Promise<Task[]> {
    try {
      const tasks = await TaskModel.find({ projectId });
      return tasks.map(task => task.toObject());
    } catch (error) {
      logger.error('Failed to find tasks by projectId', { error, projectId }, 'database task error');
      throw error;
    }
  }

  async update(id: ObjectId | string, input: UpdateTaskInput): Promise<Task> {
    try {
      const task = await TaskModel.findById(id);
      if (!task) {
        throw new TaskNotFoundError(id.toString());
      }
      Object.assign(task, input);
      await task.save();
      logger.info('Task updated successfully', { taskId: id }, 'database task');
      return task.toObject();
    } catch (error) {
      logger.error('Failed to update task', { error, taskId: id, input }, 'database task error');
      throw error;
    }
  }

  async delete(id: ObjectId | string): Promise<void> {
    try {
      const task = await TaskModel.findById(id);
      if (!task) {
        throw new TaskNotFoundError(id.toString());
      }
      await TaskModel.findByIdAndDelete(id);
      logger.info('Task deleted successfully', { taskId: id }, 'database task');
    } catch (error) {
      logger.error('Failed to delete task', { error, taskId: id }, 'database task error');
      throw error;
    }
  }

  async findChildren(taskId: ObjectId | string): Promise<Task[]> {
    try {
      const tasks = await TaskModel.find({ parentId: taskId });
      return tasks.map(task => task.toObject());
    } catch (error) {
      logger.error('Failed to find child tasks', { error, taskId }, 'database task error');
      throw error;
    }
  }

  async deleteByProjectId(projectId: ObjectId | string): Promise<{ deletedCount: number }> {
    try {
      logger.info('Deleting all tasks for project', { projectId }, 'database task');
      const result = await TaskModel.deleteMany({ projectId });
      const deletedCount = result.deletedCount ?? 0;
      logger.info('Project tasks deleted successfully', { projectId, deletedCount }, 'database task');
      return { deletedCount };
    } catch (error) {
      logger.error('Failed to delete project tasks', { error, projectId }, 'database task error');
      throw error;
    }
  }
}

export const taskRepository = new TaskRepository();
