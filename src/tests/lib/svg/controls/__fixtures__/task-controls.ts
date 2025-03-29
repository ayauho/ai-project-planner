export const mockTaskControl = {
  id: 'task-1-expand',
  type: 'expand' as const,
  position: { x: 100, y: 100 },
  state: 'active' as const,
  config: {
    size: 24,
    padding: 4,
    iconColor: '#666666',
    iconSize: 16,
  },
  parentId: 'parent-1',
};

export const mockControlEvents = {
  expand: {
    type: 'expand' as const,
    elementId: 'task-1',
    position: { x: 100, y: 100 },
  },
  regenerate: {
    type: 'regenerate' as const,
    elementId: 'task-1',
    position: { x: 100, y: 100 },
  },
  delete: {
    type: 'delete' as const,
    elementId: 'task-1',
    position: { x: 100, y: 100 },
  },
};
