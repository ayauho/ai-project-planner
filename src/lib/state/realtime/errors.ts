// Custom error types for real-time updates
export class UpdateError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'UpdateError';
  }
}

export class SyncError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'SyncError';
  }
}

export class ConflictError extends Error {
  constructor(message: string, public readonly conflictData: unknown) {
    super(message);
    this.name = 'ConflictError';
  }
}
