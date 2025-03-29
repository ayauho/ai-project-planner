// Custom error classes for request handling
export class RequestError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = 'RequestError';
    Object.setPrototypeOf(this, RequestError.prototype);
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RateLimitError';
    Object.setPrototypeOf(this, RateLimitError.prototype);
  }
}
