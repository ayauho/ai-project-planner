import { Project } from '../types';

export interface ProjectWithTaskCount extends Project {
  taskCount: number;
}

export interface ProjectResponse extends Omit<Project, '_id'> {
  _id: string;
  taskCount?: number;
}
