// Control-specific error classes
export class ControlError extends Error {
  constructor(message: string, public context?: Record<string, unknown>) {
    super(message);
    this.name = 'ControlError';
  }
}

export class ControlEventError extends ControlError {
  constructor(message: string, public eventType: string, context?: Record<string, unknown>) {
    super(message, context);
    this.name = 'ControlEventError';
  }
}

export class ControlStateError extends ControlError {
  constructor(message: string, public state: string, context?: Record<string, unknown>) {
    super(message, context);
    this.name = 'ControlStateError';
  }
}
