import { mockLogger } from '../mocks/logger';

export const clearLoggerMocks = () => {
  (mockLogger.error as jest.Mock).mockClear();
  (mockLogger.warn as jest.Mock).mockClear();
  (mockLogger.info as jest.Mock).mockClear();
  (mockLogger.debug as jest.Mock).mockClear();
};

// Helper to get log calls for assertions
export const getLogCalls = (level: keyof typeof mockLogger) => 
  (mockLogger[level] as jest.Mock).mock.calls;

// Helper to verify log was called with certain message
export const wasLogCalled = (level: keyof typeof mockLogger, message: string) =>
  (mockLogger[level] as jest.Mock).mock.calls.some((call: [string, ...unknown[]]) => call[0] === message);
