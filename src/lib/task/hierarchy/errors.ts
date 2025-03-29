/**
 * Custom errors for hierarchy operations
 */

export class HierarchyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HierarchyError';
  }
}

export class CountUpdateError extends HierarchyError {
  constructor(taskId: string, originalError?: Error) {
    super(`Failed to update counts for task ${taskId}: ${originalError?.message || 'Unknown error'}`);
    this.name = 'CountUpdateError';
  }
}
