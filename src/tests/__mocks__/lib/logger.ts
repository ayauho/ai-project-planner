// Mock logger implementation
export class MockLogger {
  private static instance: MockLogger;
  private logs: Array<{ level: string; message: string; context?: Record<string, unknown> }> = [];

  private constructor() {}

  public static getInstance(): MockLogger {
    if (!MockLogger.instance) {
      MockLogger.instance = new MockLogger();
    }
    return MockLogger.instance;
  }

  debug(message: string, context?: Record<string, unknown>) {
    this.logs.push({ level: 'debug', message, context });
  }

  info(message: string, context?: Record<string, unknown>) {
    this.logs.push({ level: 'info', message, context });
  }

  warn(message: string, context?: Record<string, unknown>) {
    this.logs.push({ level: 'warn', message, context });
  }

  error(message: string, context?: Record<string, unknown>) {
    this.logs.push({ level: 'error', message, context });
  }

  getLogs() {
    return this.logs;
  }

  clearLogs() {
    this.logs = [];
  }
}

const mockLogger = MockLogger.getInstance();

export const logger = mockLogger;
export default mockLogger;
