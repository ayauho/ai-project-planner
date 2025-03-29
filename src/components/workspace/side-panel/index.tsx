'use client';

import PanelContainer from './panel-container';
import ApiKeyManager from './api-key-manager';
import ProjectSelector from './project-selector';
import { Button } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react';
import { logger } from '@/lib/client/logger';
import { workspaceStateManager } from '@/lib/workspace/state/manager';
import { useEffect, useState } from 'react';
import { SortOption } from '@/lib/project/selection/types';

interface SidePanelProps {
  userId?: string;
}

const SidePanel = ({ userId }: SidePanelProps) => {
  const [showProjectCreation, setShowProjectCreation] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('last-modified');
  
  // Keep the button style in sync with the app state
  useEffect(() => {
    const handleStateChange = (state: { showProjectCreation: boolean }) => {
      setShowProjectCreation(state.showProjectCreation);
    };
    
    // Initial state
    setShowProjectCreation(workspaceStateManager.getState().showProjectCreation);
    
    // Subscribe to changes
    const unsubscribe = workspaceStateManager.subscribe(handleStateChange);
    return () => unsubscribe();
  }, []);

  const handleProjectSelect = async (id: string) => {
    try {
      logger.info('Project selected in side panel', { id }, 'project panel selection');
      await workspaceStateManager.selectProject(id);
      
      // Dispatch project selected event for auto-collapse on small screens
      window.dispatchEvent(new CustomEvent('project-selected', { 
        detail: { projectId: id } 
      }));
    } catch (error) {
      logger.error('Failed to select project', { error: String(error) }, 'project panel selection error');
    }
  };

  const handleCreateProject = () => {
    logger.info('Create project button clicked', {}, 'project panel ui');
    workspaceStateManager.showProjectCreation();
    
    // On small screens, auto-collapse side panel when creating project
    if (window.innerWidth <= 768) {
      logger.debug('Auto-collapsing side panel on small screen', {}, 'panel ui mobile');
      // Dispatch event to collapse side panel
      window.dispatchEvent(new CustomEvent('force-collapse-side-panel'));
    }
  };

  if (!userId) {
    logger.warn('SidePanel rendered without userId', {}, 'panel initialization error');
    return null;
  }

  return (
    <PanelContainer className="bg-white border-r h-full">
      <div className="flex flex-col h-full pl-4 pr-0 pt-12">
        {/* Controls with right padding - fixed height with zero bottom margin */}
        <div className="pr-4 flex-shrink-0 mb-0">
          <ApiKeyManager />
          <div className="flex flex-col gap-4 mt-6 mb-4">
            <Button 
              onClick={handleCreateProject}
              className={`w-full flex items-center gap-2 ${showProjectCreation ? 'bg-blue-100 border-blue-500' : ''}`}
              variant="outline"
            >
              <PlusCircle className="w-4 h-4" />
              Create Project
            </Button>
          </div>
        </div>

        {/* Project list header with sort controls */}
        <div className="flex justify-between items-center px-2 mb-2 flex-shrink-0">
          <h3 className="text-sm font-medium">Projects</h3>
          <select 
            value={sortBy}
            onChange={e => {
              const newSortOption = e.target.value as SortOption;
              setSortBy(newSortOption);
              logger.debug('Sort option changed', { sortBy: newSortOption }, 'project panel sorting');
              // The ProjectSelector component will handle the actual sorting via its props
            }}
            className="text-sm rounded-md border border-gray-300 py-1 pl-2 pr-8 appearance-none bg-no-repeat bg-right" 
            style={{
              backgroundImage: `url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3E%3C/svg%3E")`,
              backgroundSize: '1.5em 1.5em',
              paddingRight: '1.75rem'
            }}
          >
            <option value="last-modified">Last Modified</option>
            <option value="creation-date">Creation Date</option>
            <option value="alphabetical">Alphabetical</option>
          </select>
        </div>

        {/* Project selector with data-project-list attribute */}
        <div className="flex-grow overflow-auto h-full" data-project-list="true">
          <ProjectSelector 
            userId={userId} 
            onProjectSelect={handleProjectSelect}
            sortBy={sortBy}
          />
        </div>
      </div>
    </PanelContainer>
  );
};

export default SidePanel;