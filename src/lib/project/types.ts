import mongoose from 'mongoose';

// Base interface for project data
interface BaseProject {
  userId: mongoose.Types.ObjectId;
  name: string;
  description: string;
  rootTaskId?: mongoose.Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

// Interface for projects returned from DB (always has _id)
export interface Project extends BaseProject {
  _id: mongoose.Types.ObjectId;
}

// Interface for project with task count
export interface ProjectWithTaskCount extends Project {
  taskCount: number;
}

// Interface for creating new projects (no _id needed)
export interface CreateProjectInput {
  userId: string | mongoose.Types.ObjectId;
  name: string;
  description: string;
  rootTaskId?: string | mongoose.Types.ObjectId;
}

// Interface for updating projects
export interface UpdateProjectInput {
  name?: string;
  description?: string;
  rootTaskId?: string | mongoose.Types.ObjectId;
}
