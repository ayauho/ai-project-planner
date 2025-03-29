import { ReactNode } from 'react';

export interface WorkspaceAreaProps {
  children?: ReactNode;
  className?: string;
}

export interface WorkspaceAreaState {
  isLoading: boolean;
  error: string | null;
  activeProjectId?: string;
}

export interface WorkspaceStore extends WorkspaceAreaState {
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setActiveProject: (projectId: string | undefined) => void;
}

export interface CreateProjectInput {
  name: string;
  description: string;
}
