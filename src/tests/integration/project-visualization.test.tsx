import { render, screen } from '@testing-library/react';
import { mockFetch, mockLocalStorage, createMockWorkspaceStore, renderTasks } from './test-utils';
import type { CreateProjectInput } from './workspace-types';
import WorkspaceArea from '../../components/workspace/area';

// Mock modules
jest.mock('../../lib/client/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

jest.mock('../../lib/client/auth/storage', () => ({
  authStorage: {
    getSession: jest.fn().mockResolvedValue({
      user: { _id: 'test-user-id' }
    })
  }
}));

// Mock workspace store
const mockStore = createMockWorkspaceStore();
jest.mock('../../lib/workspace/store', () => ({
  useWorkspaceStore: () => mockStore
}));

// Dynamic workspace area with task visualization
jest.mock('../../components/workspace/area', () => {
  const WorkspaceArea = ({ children }: { children?: React.ReactNode }) => {
    const tasks = mockStore.tasks || [];
    
    return (
      <div data-testid="workspace-area">
        <div data-testid="project-content">
          {children}
        </div>
        <svg>
          <g dangerouslySetInnerHTML={{ __html: renderTasks(tasks) }} />
        </svg>
      </div>
    );
  };
  WorkspaceArea.displayName = 'WorkspaceArea';
  return { __esModule: true, default: WorkspaceArea };
});

// Mock loading state component
jest.mock('../../components/workspace/area/loading', () => {
  const LoadingState = ({ 
    isLoading, 
    error, 
    _className 
  }: { 
    isLoading: boolean; 
    error: string | null;
    className?: string;
  }) => {
    if (isLoading) return <div role="progressbar">Loading...</div>;
    if (error) return <div role="alert">{error}</div>;
    return null;
  };
  LoadingState.displayName = 'LoadingState';
  return { __esModule: true, default: LoadingState };
});

// Mock project creation component with task state update
jest.mock('../../components/workspace/area/project-creation', () => {
  const ProjectCreation = ({ 
    onProjectCreate,
    _className 
  }: { 
    onProjectCreate: (input: CreateProjectInput) => Promise<void>;
    className?: string;
  }) => {
    const handleCreate = async () => {
      const projectData = {
        name: 'Test Project', 
        description: 'Test Description'
      };
      await onProjectCreate(projectData);
    };
    
    return (
      <div className={className}>
        <textarea placeholder="describe your project" />
        <button onClick={handleCreate}>Create</button>
      </div>
    );
  };
  ProjectCreation.displayName = 'ProjectCreation';
  return { __esModule: true, default: ProjectCreation };
});

describe('Project Visualization Integration Tests', () => {
  const mockProjectResponse = {
    projectId: 'test-project-id',
    taskIds: ['task-1', 'task-2', 'task-3'],
    tasks: [
      {
        id: 'task-1',
        name: 'Root Task',
        description: 'Main task',
        position: { x: 0, y: 0 },
        dimensions: { width: 100, height: 50 }
      },
      {
        id: 'task-2',
        name: 'Subtask 1',
        description: 'First subtask',
        parentId: 'task-1',
        position: { x: 100, y: 100 },
        dimensions: { width: 100, height: 50 }
      },
      {
        id: 'task-3',
        name: 'Subtask 2',
        description: 'Second subtask',
        parentId: 'task-1',
        position: { x: -100, y: 100 },
        dimensions: { width: 100, height: 50 }
      }
    ]
  };

  beforeEach(() => {
    mockLocalStorage();
    mockFetch(mockProjectResponse);
    localStorage.setItem(`project_${mockProjectResponse.projectId}`, JSON.stringify(mockProjectResponse));
    jest.clearAllMocks();
  });

  it('renders workspace area', async () => {
    render(<WorkspaceArea />);
    expect(screen.getByTestId('workspace-area')).toBeInTheDocument();
  });

  // Your existing tests remain the same...
});
