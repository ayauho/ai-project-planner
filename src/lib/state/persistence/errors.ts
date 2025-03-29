/**
 * Custom errors for data persistence operations
 */

export class StorageError extends Error {
  constructor(message: string, public readonly context?: Record<string, unknown>) {
    super(message);
    this.name = 'StorageError';
  }
}

export class SyncError extends Error {
  constructor(message: string, public readonly context?: Record<string, unknown>) {
    super(message);
    this.name = 'SyncError';
  }
}

export class CacheError extends Error {
  constructor(message: string, public readonly context?: Record<string, unknown>) {
    super(message);
    this.name = 'CacheError';
  }
}
