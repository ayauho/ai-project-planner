/**
 * Test logger implementation
 */
import { LogLevel, LoggerContext } from './types';

export class TestLogger {
  private logs: Array<{level: LogLevel; message: string; context?: LoggerContext}> = [];

  clearLogs(): void {
    this.logs = [];
  }

  getLogs(): typeof this.logs {
    return this.logs;
  }

  log(level: LogLevel, message: string, context?: LoggerContext): void {
    this.logs.push({ level, message, context });
  }

  error(message: string, context?: LoggerContext): void {
    this.log('error', message, context);
  }

  warn(message: string, context?: LoggerContext): void {
    this.log('warn', message, context);
  }

  info(message: string, context?: LoggerContext): void {
    this.log('info', message, context);
  }

  debug(message: string, context?: LoggerContext): void {
    this.log('debug', message, context);
  }
}
