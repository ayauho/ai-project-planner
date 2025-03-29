import { ErrorProcessorImpl } from '../../../lib/error/processor';
import { ERROR_CATEGORIES, USER_MESSAGES } from '../../../lib/error/constants';

describe('ErrorProcessor', () => {
  let processor: ErrorProcessorImpl;

  beforeEach(() => {
    processor = new ErrorProcessorImpl();
  });

  it('should process Error objects correctly', () => {
    const error = new Error('Test error');
    const context = { userId: '123' };
    
    const result = processor.processError(error, context);
    
    expect(result).toMatchObject({
      originalError: error,
      details: {
        message: expect.any(String),
        context: context,
      },
      timestamp: expect.any(Date),
      level: expect.stringMatching(/error|warn/),
    });
    expect(result.errorId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('should handle non-Error objects', () => {
    const errorString = 'string error';
    const result = processor.processError(errorString);
    
    expect(result.originalError).toBeInstanceOf(Error);
    expect(result.originalError.message).toBe(errorString);
  });

  it('should categorize TypeError as validation error', () => {
    const error = new TypeError('Invalid type');
    const result = processor.processError(error);
    
    expect(result.details.code).toBe(ERROR_CATEGORIES.VALIDATION);
    expect(result.details.message).toBe(USER_MESSAGES[ERROR_CATEGORIES.VALIDATION]);
    expect(result.level).toBe('warn');
  });

  it('should include stack trace only in development', () => {
    const originalEnv = process.env.NODE_ENV;
    const error = new Error('Test error');

    // Test development environment
    process.env.NODE_ENV = 'development';
    let result = processor.processError(error);
    expect(result.details.stack).toBeDefined();

    // Test production environment
    process.env.NODE_ENV = 'production';
    result = processor.processError(error);
    expect(result.details.stack).toBeUndefined();

    // Restore original environment
    process.env.NODE_ENV = originalEnv;
  });
});
