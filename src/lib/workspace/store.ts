import { create } from 'zustand';
import { logger } from '@/lib/client/logger';
import type { WorkspaceStore } from '@/components/workspace/area/types';

export const useWorkspaceStore = create<WorkspaceStore>((set) => ({
  isLoading: false,
  error: null,
  viewport: {
    position: { x: 0, y: 0 },
    zoom: 1,
    bounds: { width: 0, height: 0 }
  },

  setLoading: (loading) => {
    logger.debug('Setting workspace loading state', { loading }, 'workspace-store state');
    set({ isLoading: loading });
  },

  setError: (error) => {
    if (error) {
      logger.error('Setting workspace error', { error }, 'workspace-store error');
    }
    set({ error });
  },

  setActiveProject: (projectId) => {
    logger.debug('Setting active project', { projectId }, 'workspace-store state');
    set({ activeProjectId: projectId });
  },

  updateViewport: (position, zoom) => {
    logger.debug('Updating viewport', { position, zoom }, 'workspace-store viewport');
    set((state) => ({
      viewport: {
        ...state.viewport,
        position,
        zoom
      }
    }));
  },

  setBounds: (bounds) => {
    logger.debug('Setting viewport bounds', { bounds }, 'workspace-store viewport');
    set((state) => ({
      viewport: {
        ...state.viewport,
        bounds
      }
    }));
  }
}));
