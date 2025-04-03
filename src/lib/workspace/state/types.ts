import { ProjectWithTaskCount } from '@/lib/project/types';
import { Task } from '@/lib/task/types';

export type TaskVisualState = 'active' | 'semi-transparent' | 'hidden' | `opacity-${string}`;

export interface TaskHierarchyState {
  expandedTaskId: string;
  parentState: TaskVisualState;
  siblingState: TaskVisualState;
  childState: TaskVisualState;
}

export type StateUpdateType = 'project' | 'tasks' | 'visual' | 'ui' | 'loading' | 'error';

export interface WorkspaceState {
  selectedProject: ProjectWithTaskCount | null;
  tasks: Task[];
  isLoading: boolean;
  error: string | null;
  showProjectCreation: boolean;
  projectListUpdated: boolean;
  newlyCreatedProjectId?: string;
  taskVisualStates: Map<string, TaskVisualState>;
}

export interface WorkspaceStateManager {
  getState(): WorkspaceState;
  showProjectCreation(): void;
  hideProjectCreation(): void;
  notifyProjectListUpdated(newlyCreatedProjectId?: string): void;
  selectProject(projectId: string): Promise<void>;
  clearSelection(): void;
  updateTasks(newTasks: Task[]): void;
  updateTaskVisualStates(hierarchyState: TaskHierarchyState): void;
  subscribe(callback: (state: WorkspaceState, updateType: StateUpdateType) => void): () => void;
}
