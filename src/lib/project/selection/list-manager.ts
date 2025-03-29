'use client';

import { Types } from 'mongoose';
import { ProjectWithTaskCount } from '../types';
import { projectService } from '../client/project-service';
import { 
  ProjectListManager, 
  ProjectListOptions, 
  ProjectDisplay 
} from './types';
import { SORT_OPTIONS, ERROR_MESSAGES } from './constants';
import { logger } from '@/lib/client/logger';

class ProjectListManagerImpl implements ProjectListManager {
  private static instance: ProjectListManagerImpl;

  private constructor() {}

  public static getInstance(): ProjectListManagerImpl {
    if (!ProjectListManagerImpl.instance) {
      ProjectListManagerImpl.instance = new ProjectListManagerImpl();
    }
    return ProjectListManagerImpl.instance;
  }

  async getProjects(options: ProjectListOptions): Promise<ProjectDisplay[]> {
    try {
      
      const projects = await this.fetchProjects(options);

      return projects;
    } catch (error) {
      logger.error('Failed to fetch projects', { 
        userId: options.userId, 
        error: String(error)
      }, 'project-selection error');
      throw error;
    }
  }

  private async fetchProjects(options: ProjectListOptions): Promise<ProjectDisplay[]> {
    const projects = await projectService.findByUserId(options.userId.toString());

    logger.debug('Processing projects for display', { 
      rawCount: projects.length 
    }, 'project-selection list');

    const displayProjects = projects.map(project => {
      const lastModifiedDate = project.updatedAt 
        ? new Date(project.updatedAt)
        : project.createdAt 
          ? new Date(project.createdAt)
          : new Date();

      return {
        id: project._id?.toString() || '',
        name: project.name,
        lastModifiedDate,
        createdAt: project.createdAt ? new Date(project.createdAt) : lastModifiedDate,
        tasksCount: project.taskCount
      };
    });

    logger.debug('Processed projects for display', { 
      displayCount: displayProjects.length 
    }, 'project-selection list');

    if (options.sortBy) {
      return this.sortProjects(displayProjects, options.sortBy);
    }

    return displayProjects;
  }

  async selectProject(projectId: string): Promise<ProjectWithTaskCount> {
    try {
      logger.info('Selecting project', { projectId }, 'project-selection');
      
      if (!projectId || typeof projectId !== 'string' || !Types.ObjectId.isValid(projectId)) {
        throw new Error(ERROR_MESSAGES.INVALID_PROJECT_ID);
      }

      const project = await projectService.findById(projectId);

      if (!project) {
        throw new Error(ERROR_MESSAGES.PROJECT_NOT_FOUND);
      }

      return project;
    } catch (error) {
      logger.error('Failed to select project', { projectId, error: String(error) }, 'project-selection error');
      throw error;
    }
  }

  private sortProjects(projects: ProjectDisplay[], sortBy: string): ProjectDisplay[] {
    try {
      switch (sortBy) {
        case SORT_OPTIONS.LAST_MODIFIED:
          return [...projects].sort((a, b) => 
            b.lastModifiedDate.getTime() - a.lastModifiedDate.getTime()
          );

        case SORT_OPTIONS.CREATION_DATE:
          return [...projects].sort((a, b) => 
            b.createdAt.getTime() - a.createdAt.getTime()
          );

        case SORT_OPTIONS.ALPHABETICAL:
          return [...projects].sort((a, b) => 
            a.name.localeCompare(b.name)
          );

        default:
          logger.warn('Invalid sort option', { sortBy }, 'project-selection warning');
          return projects;
      }
    } catch (error) {
      logger.error('Error sorting projects', { error: String(error) }, 'project-selection sort error');
      return projects;
    }
  }
}

export const projectListManager = ProjectListManagerImpl.getInstance();
