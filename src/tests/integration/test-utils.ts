/* eslint-disable @typescript-eslint/no-explicit-any */
import type { WorkspaceStore } from './workspace-types';

// Mock fetch
export const mockFetch = (response: any) => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    headers: {
      get: () => 'application/json'
    },
    json: () => Promise.resolve(response)
  });
};

// Mock local storage
export const mockLocalStorage = () => {
  const store: Record<string, string> = {};
  
  const mockStorage = {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { Object.keys(store).forEach(key => delete store[key]); },
    length: Object.keys(store).length,
    key: (index: number) => Object.keys(store)[index]
  };

  Object.defineProperty(window, 'localStorage', {
    value: mockStorage
  });

  return mockStorage;
};

// Mock workspace store with tasks state
export const createMockWorkspaceStore = () => {
  let currentTasks: any[] = [];
  
  return {
    isLoading: false,
    error: null,
    activeProjectId: undefined,
    tasks: currentTasks,
    setLoading: jest.fn(),
    setError: jest.fn(),
    setActiveProject: jest.fn((projectId) => {
      if (projectId) {
        const storedResponse = localStorage.getItem(`project_${projectId}`);
        if (storedResponse) {
          const { tasks } = JSON.parse(storedResponse);
          currentTasks = tasks;
        }
      }
    })
  } as unknown as WorkspaceStore;
};

// SVG task renderer
export const renderTasks = (tasks: any[]) => {
  return tasks.map((task) => (
    `<g role="graphics-symbol" id="task-${task.id}" key="${task.id}">
      <g transform="translate(${task.position.x},${task.position.y})">
        <rect
          width="${task.dimensions.width}"
          height="${task.dimensions.height}"
          fill="white"
          stroke="black"
        />
        <text x="10" y="20">${task.name}</text>
      </g>
      ${task.parentId ? '<g role="graphics-document"></g>' : ''}
    </g>`
  )).join('');
};
