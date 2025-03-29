/**
 * Custom error types for layout management
 */

export class LayoutValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LayoutValidationError';
  }
}

export class ViewportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ViewportError';
  }
}
