/**
 * Mock data for logger tests
 */

export const mockLogEntries = {
  error: {
    message: 'Test error message',
    context: { errorCode: 500, details: 'Internal server error' }
  },
  warn: {
    message: 'Test warning message',
    context: { warningCode: 'DEPRECATION', component: 'TestModule' }
  },
  info: {
    message: 'Test info message',
    context: { userId: '123', action: 'test-action' }
  },
  debug: {
    message: 'Test debug message',
    context: { debugInfo: 'Detailed debug information' }
  }
};

export const mockConfig = {
  logLevels: ['error', 'warn', 'info', 'debug'],
  formats: ['console', 'file'],
  rotationConfig: {
    maxSize: '10m',
    maxFiles: '7d',
    datePattern: 'YYYY-MM-DD'
  },
  logDir: 'test-logs'
};
