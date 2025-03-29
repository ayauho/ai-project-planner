import { jest } from '@jest/globals';

export const mockLogger = {
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  clearTestLogs: jest.fn(),
  getTestLogs: jest.fn().mockReturnValue([]),
};

jest.mock('@/lib/logger', () => ({
  logger: mockLogger
}));

export default mockLogger;
