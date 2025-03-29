import { errorProcessor } from './processor';
import { errorReporter } from './reporter';
import { GlobalErrorHandler } from './types';

class GlobalErrorHandlerImpl implements GlobalErrorHandler {
  handleError(error: Error | unknown, context?: Record<string, unknown>): void {
    const processedError = errorProcessor.processError(error, context);
    errorReporter.reportError(processedError);
  }

  handlePromiseRejection(error: Error | unknown): void {
    this.handleError(error, { source: 'unhandledRejection' });
  }
}

export const globalErrorHandler = new GlobalErrorHandlerImpl();

// Export other utilities
export * from './types';
export * from './constants';
export { errorProcessor } from './processor';
export { errorReporter } from './reporter';

// Set up global handlers
// Set up global handlers
if (typeof window !== 'undefined') {
  window.onerror = (message, source, lineno, colno, error) => {
    globalErrorHandler.handleError(error || new Error(String(message)), { source, lineno, colno });
  };

  window.onunhandledrejection = (event: PromiseRejectionEvent) => {
    const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
    globalErrorHandler.handleError(error, { source: 'unhandledRejection' });
    event.preventDefault();
  };
}
