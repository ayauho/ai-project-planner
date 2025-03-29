/**
 * Custom errors for task operations
 */

export class TaskGenerationError extends Error {
  constructor(message: string, public cause?: Error) {
    super(message);
    this.name = 'TaskGenerationError';
  }
}

export class TaskDeletionError extends Error {
  constructor(message: string, public cause?: Error) {
    super(message);
    this.name = 'TaskDeletionError';
  }
}
