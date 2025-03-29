import { Position, Dimensions } from '@/types/visual';

export interface ViewportState {
  position: Position;
  zoom: number;
  bounds: Dimensions;
}

export interface WorkspaceAreaProps {
  children?: React.ReactNode;
  className?: string;
}

export interface WorkspaceStore {
  isLoading: boolean;
  error: string | null;
  activeProjectId?: string;
  viewport: ViewportState;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setActiveProject: (projectId: string) => void;
  updateViewport: (position: Position, zoom: number) => void;
  setBounds: (bounds: Dimensions) => void;
}
