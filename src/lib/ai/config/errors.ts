'use client';

export class ApiKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiKeyError';
  }
}

export class ApiKeyValidationError extends ApiKeyError {
  constructor(message: string = 'API key validation failed') {
    super(message);
    this.name = 'ApiKeyValidationError';
  }
}

export class ApiKeyStorageError extends ApiKeyError {
  constructor(message: string = 'Failed to store or retrieve API key') {
    super(message);
    this.name = 'ApiKeyStorageError';
  }
}

export class ApiKeyEnvironmentError extends ApiKeyError {
  constructor(message: string = 'Operation not supported in current environment') {
    super(message);
    this.name = 'ApiKeyEnvironmentError';
  }
}
