/**
 * Main logger implementation
 */
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import { LogLevel, LoggerConfigOptions, LoggerContext } from './types';
import { getLoggerConfig, readConfigFile } from './config';
import { TestLogger } from './test-logger';

class Logger {
  private static instance: Logger;
  private testLogger: TestLogger | null = null;
  private prodLogger: winston.Logger | null = null;
  private loggerConfig: LoggerConfigOptions;
  private isTestMode = false;
  private projectRoot: string;

  private constructor() {
    this.loggerConfig = getLoggerConfig();
    this.projectRoot = process.cwd();
    this.initializeLoggers();
  }

  private initializeLoggers(): void {
    // Initialize test logger
    this.testLogger = new TestLogger();

    // Initialize production logger only if not in test mode
    if (!this.isTestMode) {
      const transports: winston.transport[] = [];

      if (this.loggerConfig.formats.includes('console')) {
        transports.push(
          new winston.transports.Console({
            format: winston.format.combine(
              winston.format.colorize(),
              winston.format.simple()
            )
          })
        );
      }

      if (this.loggerConfig.formats.includes('file') && this.loggerConfig.rotationConfig) {
        transports.push(
          new DailyRotateFile({
            dirname: path.join(process.cwd(), this.loggerConfig.logDir || 'logs'),
            filename: 'application-%DATE%.log',
            datePattern: this.loggerConfig.rotationConfig.datePattern,
            maxSize: this.loggerConfig.rotationConfig.maxSize,
            maxFiles: this.loggerConfig.rotationConfig.maxFiles,
            format: winston.format.combine(
              winston.format.timestamp(),
              winston.format.json()
            )
          })
        );
      }

      this.prodLogger = winston.createLogger({
        level: 'debug',
        transports
      });
    }
  }

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  public enableTestMode(): void {
    this.isTestMode = true;
    this.prodLogger = null;
    if (this.testLogger) {
      this.testLogger.clearLogs();
    }
  }

  public disableTestMode(): void {
    this.isTestMode = false;
    this.initializeLoggers();
  }

  public clearTestLogs(): void {
    if (this.testLogger) {
      this.testLogger.clearLogs();
    }
  }

  public getTestLogs(): Array<{level: LogLevel; message: string; context?: Record<string, unknown>}> {
    return this.testLogger ? this.testLogger.getLogs() : [];
  }

  /**
   * Extract the calling file path from the stack trace
   */
  private getCallerPath(): string {
    // Create an error to get the stack trace
    const err = {} as Error;
    Error.captureStackTrace(err);
    
    // Get the stack as a string
    const stackLines = err.stack?.split('\n') || [];
    
    // Look for the first line that's not from this file
    // Typically we need to skip the first few lines (current function, log method, public methods like info/error)
    let callerLine = '';
    for (let i = 3; i < stackLines.length; i++) {
      const line = stackLines[i];
      // Skip lines from this file
      if (line.includes(__filename)) {
        continue;
      }
      callerLine = line;
      break;
    }
    
    // Extract the file path from the line
    // Stack trace format varies by environment, but typically looks like:
    // at Object.<anonymous> (/path/to/file.js:line:column)
    const matches = callerLine.match(/\(([^:]+):/);
    if (matches && matches[1]) {
      // Convert absolute path to relative from project root
      try {
        return path.relative(this.projectRoot, matches[1]);
      } catch {
        return matches[1]; // Return absolute path if relative path conversion fails
      }
    }
    
    return 'unknown';
  }

  /**
   * Parse keywords string into array of keywords
   * @param keywordsStr Space-separated keywords or single keyword
   */
  private parseKeywords(keywordsStr?: string): string[] {
    if (!keywordsStr) return [];
    return keywordsStr.trim().split(/\s+/);
  }

  /**
   * Check if the current log should be shown based on config rules and environment
   * @param keywords Array of keywords to check against rules
   */
  private shouldShowLog(keywords: string[]): boolean {
    // Highest priority rule: If SHOW_BACKEND_LOGS is true, always show logs
    if (process.env.SHOW_BACKEND_LOGS === 'true') {
      return true;
    }
    
    // Check environment - only show logs in development
    if (process.env.NODE_ENV && process.env.NODE_ENV !== 'development') {
      return false;
    }
    
    // Read the latest config
    const configFile = readConfigFile();
    
    // If hide-all is true, don't show any logs
    if (configFile['hide-all']) {
      return false;
    }
    
    // If show-by-keyword is active
    if (configFile['show-by-keyword'].works) {
      // No keywords means this log should be hidden
      if (keywords.length === 0) {
        return false;
      }
      
      // Check if ANY of the provided keywords is in the show list
      const shouldShow = keywords.some(keyword => 
        configFile['show-by-keyword'].keywords.includes(keyword)
      );
      
      if (!shouldShow) {
        return false;
      }
      
      // Check if ANY of the keywords is in the hide list
      if (configFile['hide-by-keyword'].works) {
        const shouldHide = keywords.some(keyword => 
          configFile['hide-by-keyword'].keywords.includes(keyword)
        );
        
        if (shouldHide) {
          return false;
        }
      }
      
      // If we got here, at least one keyword is in the show list and none are in the hide list
      return true;
    }
    
    // If only hide-by-keyword is active
    if (configFile['hide-by-keyword'].works && keywords.length > 0) {
      // Check if ANY of the keywords is in the hide list
      return !keywords.some(keyword => 
        configFile['hide-by-keyword'].keywords.includes(keyword)
      );
    }
    
    // By default, show the log
    return true;
  }

  public log(level: LogLevel, message: string, context?: LoggerContext, keywordsStr?: string): void {
    if (!this.loggerConfig.logLevels.includes(level)) {
      return;
    }
    
    // Parse keywords and check if this log should be shown
    const keywords = this.parseKeywords(keywordsStr);
    if (!this.shouldShowLog(keywords)) {
      return;
    }

    // Handle styled logging for console
    const style = context?._style;
    
    // Create a copy of the context for logging
    let contextToLog: LoggerContext | undefined;
    if (context) {
      contextToLog = { ...context };
      
      // Handle special _path directive
      if (contextToLog._path === true) {
        contextToLog.path = this.getCallerPath();
      }
      
      // Remove special directives from output
      delete contextToLog._style;
      delete contextToLog._path;
      
      if (Object.keys(contextToLog).length === 0) {
        contextToLog = undefined;
      }
    }

    if (this.isTestMode && this.testLogger) {
      this.testLogger.log(level, message, contextToLog);
    } else if (this.prodLogger) {
      const logMessage = contextToLog ? `${message}\nContext: ${JSON.stringify(contextToLog)}` : message;
      
      if (style && this.loggerConfig.formats.includes('console')) {
        // Use styled logging only for console
        console[level](`%c${logMessage}`, style);
      } else {
        this.prodLogger.log(level, logMessage);
      }
    }
  }

  public error(message: string, context?: LoggerContext, keywordsStr?: string): void {
    this.log('error', message, context, keywordsStr);
  }

  public warn(message: string, context?: LoggerContext, keywordsStr?: string): void {
    this.log('warn', message, context, keywordsStr);
  }

  public info(message: string, context?: LoggerContext, keywordsStr?: string): void {
    this.log('info', message, context, keywordsStr);
  }

  public debug(message: string, context?: LoggerContext, keywordsStr?: string): void {
    this.log('debug', message, context, keywordsStr);
  }
  
  /**
   * Force reload of config file
   */
  public reloadConfig(): void {
    this.loggerConfig = getLoggerConfig();
  }
}

export const logger = Logger.getInstance();
export default logger;
