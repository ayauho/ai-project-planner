import { Types } from 'mongoose';
import { ProjectWithTaskCount } from '../client/types';

export type SortOption = 'last-modified' | 'creation-date' | 'alphabetical';

export interface ProjectListOptions {
  userId: Types.ObjectId;
  sortBy?: SortOption;
}

export interface ProjectDisplay {
  id: string;
  name: string;
  lastModifiedDate: Date;
  createdAt: Date;
  tasksCount: number;
}

export interface ProjectListManager {
  getProjects(options: ProjectListOptions): Promise<ProjectDisplay[]>;
  selectProject(projectId: string): Promise<ProjectWithTaskCount>;
}
