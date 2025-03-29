'use client';
import { logger } from '@/lib/client/logger';
import { Types } from 'mongoose';
import { ProjectWithTaskCount, CreateProjectInput } from '../types';

/**
 * Interface for project data from API responses
 */
interface ProjectApiResponse {
  _id: string;
  name: string;
  description: string;
  userId: string;
  rootTaskId?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Interface for server errors with status
 */
interface ServerError extends Error {
  status?: number;
}

class ProjectService {
  async createProject(data: CreateProjectInput): Promise<ProjectWithTaskCount> {
    try {
      logger.info('Creating new project', { name: data.name }, 'api project');
      
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const project = await response.json();
      logger.info('Project created successfully', { 
        projectId: project._id,
        name: project.name,
        userId: data.userId
      }, 'api project');

      return {
        ...project,
        _id: project._id ? new Types.ObjectId(project._id) : undefined,
        userId: new Types.ObjectId(project.userId),
        rootTaskId: project.rootTaskId ? new Types.ObjectId(project.rootTaskId) : undefined,
        taskCount: 0
      };
    } catch (error) {
      logger.error('Failed to create project', { error: String(error) }, 'api project error');
      throw error;
    }
  }

  async findByUserId(userId: string): Promise<ProjectWithTaskCount[]> {
    try {
      logger.debug('Fetching projects for user - START', { userId }, 'api project');

      const response = await fetch(`/api/projects?userId=${userId}`, {
        cache: 'no-store'
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const projects = await response.json();
      logger.debug('Received projects from API', { 
        userId,
        count: projects.length,
        projectIds: projects.map((p: ProjectApiResponse) => p._id)
      }, 'api project');
      
      const processedProjects = projects.map((project: ProjectApiResponse) => ({
        ...project,
        _id: project._id ? new Types.ObjectId(project._id) : undefined,
        userId: new Types.ObjectId(project.userId),
        rootTaskId: project.rootTaskId ? new Types.ObjectId(project.rootTaskId) : undefined,
      }));

      logger.debug('Fetching projects for user - END', { 
        userId,
        count: processedProjects.length
      }, 'api project');

      return processedProjects;
    } catch (error) {
      logger.error('Failed to fetch projects by user id', { error: String(error) }, 'api project error');
      throw error;
    }
  }  
  
  async findById(projectId: string): Promise<ProjectWithTaskCount>{
    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        cache: 'no-store' // Don't use cache to ensure we get the latest data
      });
      
      if (!response.ok) {
        const status = response.status;
        let errorMessage = `HTTP error! status: ${status}`;
        
        if (status === 404) {
          errorMessage = 'Project not found or has been deleted';
        } else if (status === 500) {
          errorMessage = 'Server error while fetching project';
        }
        
        const error: ServerError = new Error(errorMessage);
        error.status = status;
        throw error;
      }

      const project = await response.json();
      
      // Validate the returned project has required fields
      if (!project || !project._id || !project.userId) {
        throw new Error('Invalid project data returned from server');
      }
      
      return {
        ...project,
        _id: project._id ? new Types.ObjectId(project._id) : undefined,
        userId: new Types.ObjectId(project.userId),
        rootTaskId: project.rootTaskId ? new Types.ObjectId(project.rootTaskId) : undefined,
      };
    } catch (error) {
      logger.error('Failed to fetch project by id', { 
        projectId,
        error: String(error),
        status: (error as ServerError)?.status || 'unknown'
      }, 'api project error');
      throw error;
    }
  }
  
  async deleteProject(projectId: string): Promise<void> {
    try {
      logger.info('Deleting project', { projectId }, 'api project');
      
      const response = await fetch(`/api/projects/${projectId}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      logger.info('Project deleted successfully', { projectId }, 'api project');
    } catch (error) {
      logger.error('Failed to delete project', { projectId, error: String(error) }, 'api project error');
      throw error;
    }
  }
}

export const projectService = new ProjectService();
