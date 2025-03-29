import mongoose from 'mongoose';
import { Project, CreateProjectInput, UpdateProjectInput, ProjectWithTaskCount } from './types';
import { ProjectModel } from './schema';
import { ProjectNotFoundError } from './errors';
import { logger } from '@/lib/logger';

export class ProjectRepository {
  async create(input: CreateProjectInput): Promise<Project> {
    try {
      // Create model instance with string IDs
      const data = {
        ...input,
        userId: new mongoose.Types.ObjectId(input.userId)
      };
      const project = new ProjectModel(data);
      await project.save();
      
      logger.info('Project created', { 
        projectId: project._id,
        userId: project.userId
      }, 'database project');
      
      return project.toObject();
    } catch (error) {
      logger.error('Failed to create project', { error, input }, 'database project error');
      throw error;
    }
  }

  async findByUserId(userId: string): Promise<ProjectWithTaskCount[]> {
    try {
      const userObjectId = new mongoose.Types.ObjectId(userId);
      
      // Aggregate projects with task counts
      const projectsWithCounts = await ProjectModel.aggregate([
        { $match: { userId: userObjectId } },
        {
          $lookup: {
            from: 'tasks',
            localField: '_id',
            foreignField: 'projectId',
            as: 'tasks'
          }
        },
        {
          $project: {
            _id: 1,
            name: 1,
            description: 1,
            userId: 1,
            rootTaskId: 1,
            createdAt: 1,
            updatedAt: 1,
            taskCount: { $size: '$tasks' }
          }
        }
      ]);

      logger.info('Found projects with task counts', { 
        userId,
        count: projectsWithCounts.length 
      }, 'database project');

      return projectsWithCounts;
    } catch (error) {
      logger.error('Failed to find projects by userId', { error, userId }, 'database project error');
      throw error;
    }
  }

  async findById(projectId: string): Promise<ProjectWithTaskCount> {
    try {
      const id = new mongoose.Types.ObjectId(projectId);
      
      const [projectWithCount] = await ProjectModel.aggregate([
        { $match: { _id: id } },
        {
          $lookup: {
            from: 'tasks',
            localField: '_id',
            foreignField: 'projectId',
            as: 'tasks'
          }
        },
        {
          $project: {
            _id: 1,
            name: 1,
            description: 1,
            userId: 1,
            rootTaskId: 1,
            createdAt: 1,
            updatedAt: 1,
            taskCount: { $size: '$tasks' }
          }
        }
      ]);

      if (!projectWithCount) {
        throw new ProjectNotFoundError(`Project not found: ${projectId}`);
      }

      return projectWithCount;
    } catch (error) {
      logger.error('Failed to find project by id', { error, projectId }, 'database project error');
      throw error;
    }
  }

  async update(projectId: string, input: UpdateProjectInput): Promise<Project> {
    try {
      const id = new mongoose.Types.ObjectId(projectId);
      
      // Convert rootTaskId if present
      const updateData = { ...input };
      if (updateData.rootTaskId) {
        updateData.rootTaskId = new mongoose.Types.ObjectId(updateData.rootTaskId);
      }
      const project = await ProjectModel.findById(id);
      if (!project) {
        throw new ProjectNotFoundError(`Project not found: ${projectId}`);
      }
      Object.assign(project, updateData);
      await project.save();
      logger.info('Project updated', { 
        projectId: project._id,
        updates: Object.keys(input)
      }, 'database project');
      return project.toObject();
    } catch (error) {
      logger.error('Failed to update project', { error, projectId, input }, 'database project error');
      throw error;
    }
  }

  async delete(projectId: string): Promise<void> {
    try {
      const id = new mongoose.Types.ObjectId(projectId);
      const project = await ProjectModel.findByIdAndDelete(id);
      if (!project) {
        throw new ProjectNotFoundError(`Project not found: ${projectId}`);
      }
      logger.info('Project deleted', { projectId }, 'database project');
    } catch (error) {
      logger.error('Failed to delete project', { error, projectId }, 'database project error');
      throw error;
    }
  }
}

// Create singleton instance
const projectRepository = new ProjectRepository();
export default projectRepository;
