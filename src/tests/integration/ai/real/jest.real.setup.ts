import { jest } from '@jest/globals';

// Setup global test timeout
jest.setTimeout(30000);

// Mock only logger
jest.mock('@/lib/logger', () => ({
  info: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
  warn: jest.fn()
}));
