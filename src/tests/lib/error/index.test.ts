import { globalErrorHandler } from '../../../lib/error';
import { errorProcessor } from '../../../lib/error/processor';
import { errorReporter } from '../../../lib/error/reporter';

// Mock processor and reporter
jest.mock('../../../lib/error/processor', () => ({
  errorProcessor: {
    processError: jest.fn().mockReturnValue({
      errorId: '123',
      details: { message: 'Test error' },
      timestamp: new Date(),
      level: 'error'
    })
  }
}));

jest.mock('../../../lib/error/reporter', () => ({
  errorReporter: {
    reportError: jest.fn()
  }
}));

describe('GlobalErrorHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should handle errors correctly', () => {
    const error = new Error('Test error');
    const context = { test: true };

    globalErrorHandler.handleError(error, context);

    expect(errorProcessor.processError).toHaveBeenCalledWith(error, context);
    expect(errorReporter.reportError).toHaveBeenCalled();
  });

  it('should handle promise rejections', () => {
    const error = new Error('Promise rejection');
    
    globalErrorHandler.handlePromiseRejection(error);

    expect(errorProcessor.processError).toHaveBeenCalledWith(
      error,
      expect.objectContaining({ source: 'unhandledRejection' })
    );
    expect(errorReporter.reportError).toHaveBeenCalled();
  });

  describe('Global error handlers', () => {
    const originalWindow = global.window;

    beforeEach(() => {
      // Create mock window
      const mockWindow = {
        onerror: undefined as undefined | ((message: string | Event, source?: string, lineno?: number, colno?: number, error?: Error) => void),
        onunhandledrejection: undefined as undefined | ((event: PromiseRejectionEvent) => void)
      };

      // Reset mocks
      jest.clearAllMocks();
      
      // @ts-expect-error - Intentionally isolating modules for testing
      global.window = mockWindow;

      // Re-import to trigger global handlers setup
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('../../../lib/error');
      });
    });

    afterEach(() => {
      global.window = originalWindow;
    });

    it('should set up window.onerror handler', () => {
      const errorMsg = 'Error message';
      const sourceFile = 'test.js';
      const lineNo = 1;
      const colNo = 1;
      const error = new Error(errorMsg);

      // @ts-expect-error - we know window exists in this context
      const result = window.onerror(errorMsg, sourceFile, lineNo, colNo, error);

      // Verify error was processed
      expect(errorProcessor.processError).toHaveBeenCalledWith(
        error,
        expect.objectContaining({
          source: sourceFile,
          lineno: lineNo,
          colno: colNo
        })
      );

      // Handler should return undefined to let error propagate
      expect(result).toBeUndefined();
    });

    it('should set up window.onunhandledrejection handler', () => {
      const error = new Error('Promise rejection');
      const preventDefault = jest.fn();
      
      const event = new Event('unhandledrejection') as PromiseRejectionEvent;
      Object.defineProperty(event, 'reason', { value: error });
      Object.defineProperty(event, 'preventDefault', { value: preventDefault });

      // @ts-expect-error - we know window exists in this context
      window.onunhandledrejection(event);

      // Verify event handling
      expect(preventDefault).toHaveBeenCalled();
      expect(errorProcessor.processError).toHaveBeenCalledWith(
        error,
        expect.objectContaining({ source: 'unhandledRejection' })
      );
    });

    it('should handle string rejection reasons', () => {
      const stringReason = 'String rejection reason';
      const preventDefault = jest.fn();
      
      const event = new Event('unhandledrejection') as PromiseRejectionEvent;
      Object.defineProperty(event, 'reason', { value: stringReason });
      Object.defineProperty(event, 'preventDefault', { value: preventDefault });

      // @ts-expect-error - we know window exists in this context
      window.onunhandledrejection(event);

      // Verify event handling
      expect(preventDefault).toHaveBeenCalled();
      expect(errorProcessor.processError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ source: 'unhandledRejection' })
      );
      
      // Verify error conversion
      const [processedError] = (errorProcessor.processError as jest.Mock).mock.calls[0];
      expect(processedError).toBeInstanceOf(Error);
      expect(processedError.message).toBe(stringReason);
    });
  });
});
