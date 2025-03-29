// Defines task-related error types
export class TaskValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TaskValidationError';
  }
}

export class TaskNotFoundError extends Error {
  constructor(taskId: string) {
    super(`Task with id ${taskId} not found`);
    this.name = 'TaskNotFoundError';
  }
}
