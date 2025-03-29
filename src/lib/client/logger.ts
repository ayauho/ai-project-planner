/**
 * Client-side logging implementation with support for styling, keywords, and configuration
 */

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

export interface LoggerContext extends Record<string, unknown> {
  _style?: string;
  _path?: boolean;
}

export interface KeywordConfig {
  works: boolean;
  keywords: string[];
}

export interface LoggerConfigFile {
  'hide-all': boolean;
  'show-by-keyword': KeywordConfig;
  'hide-by-keyword': KeywordConfig;
}

// Global flag to force enable logs
let forceEnableLogs = false;

// Type definition for the window with our custom functions
declare global {
  interface Window {
    turn_on_logs?: () => Promise<string>;
  }
}

// Make turn_on_logs available in window scope for browser environment
if (typeof window !== 'undefined') {
  window.turn_on_logs = async () => {
    forceEnableLogs = true;
    
    // In non-development mode, fetch the latest config from server
    if (process.env.NODE_ENV !== 'development') {
      try {
        const { forceConfigSync } = await import('./logger-config-sync');
        await forceConfigSync();
        console.log('Logger config synced from server');
      } catch (error) {
        console.error('Failed to sync logger config from server:', error);
      }
    }
    
    console.log('Logs have been forcibly enabled');
    return 'Logs have been forcibly enabled';
  };
}

class ClientLogger {
  private configFile: LoggerConfigFile | null = null;
  private lastConfigRead = 0;
  private readonly CONFIG_CACHE_TTL = 5000; // 5 seconds

  constructor() {
    this.initializeConfig();
  }

  /**
   * Initialize the config by reading from localStorage if available
   */
  private initializeConfig(): void {
    try {
      // Try to get config from localStorage
      const storedConfig = localStorage.getItem('logger.config');
      if (storedConfig) {
        this.configFile = JSON.parse(storedConfig);
        this.lastConfigRead = Date.now();
      } else {
        // Use different defaults based on environment
        if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'development') {
          this.configFile = {
            'hide-all': false,
            'show-by-keyword': {
              works: false,
              keywords: []
            },
            'hide-by-keyword': {
              works: false,
              keywords: []
            }
          };
        } else {
          // In production, default to hiding all logs
          this.configFile = {
            'hide-all': true,
            'show-by-keyword': {
              works: false,
              keywords: []
            },
            'hide-by-keyword': {
              works: false,
              keywords: []
            }
          };
        }
      }
      
      // Initialize syncing mechanism
      if (typeof window !== 'undefined') {
        import('./logger-config-sync').then(({ syncLoggerConfig }) => {
          syncLoggerConfig().catch(_e => console.error('Failed initial logger config sync'));
        }).catch(_e => console.error('Failed to import logger-config-sync'));
      }
    } catch (error) {
      console.error('Failed to initialize logger config:', error);
      // Default config on error
      this.configFile = {
        'hide-all': process.env.NODE_ENV !== 'development', // Hide in production
        'show-by-keyword': {
          works: false,
          keywords: []
        },
        'hide-by-keyword': {
          works: false,
          keywords: []
        }
      };
    }
  }

  /**
   * Read the config from localStorage if available
   */
  private readConfig(): LoggerConfigFile {
    const now = Date.now();
    
    // Default config to use if nothing else is available
    const defaultConfig: LoggerConfigFile = {
      'hide-all': false,
      'show-by-keyword': {
        works: false,
        keywords: []
      },
      'hide-by-keyword': {
        works: false,
        keywords: []
      }
    };
    
    // Use cached config if it exists and is not expired
    if (this.configFile && (now - this.lastConfigRead < this.CONFIG_CACHE_TTL)) {
      return this.configFile;
    }

    try {
      const storedConfig = localStorage.getItem('logger.config');
      if (storedConfig) {
        this.configFile = JSON.parse(storedConfig);
      } else {
        // Use default config if not found in localStorage
        this.configFile = { ...defaultConfig };
      }
      
      this.lastConfigRead = now;
      // Ensure we never return null
      return this.configFile || defaultConfig;
    } catch (error) {
      console.error('Failed to read logger config:', error);
      
      // Return default config on error
      return defaultConfig;
    }
  }

  /**
   * Extract the calling file path from the stack trace
   */
  private getCallerPath(): string {
    try {
      // Create an error to get the stack trace
      const err = new Error();
      
      // Get the stack as a string
      const stackLines = err.stack?.split('\n') || [];
      
      // Look for the first line that's not from this file
      // Typically we need to skip the first few lines (Error constructor, current function, log method)
      let callerLine = '';
      for (let i = 3; i < stackLines.length; i++) {
        const line = stackLines[i];
        // Skip lines from this file
        if (line.includes('logger.ts')) {
          continue;
        }
        callerLine = line;
        break;
      }
      
      // Extract the file path from the line
      // Browser stack trace format typically looks like:
      // at functionName (http://app.com/path/to/file.js:line:column)
      const matches = callerLine.match(/\(([^:]+\/[^:]+):/);
      if (matches && matches[1]) {
        // For browsers, we typically get a URL, so extract just the path part
        const fullPath = matches[1];
        
        // Extract the relative path by removing domain and protocol
        const urlParts = fullPath.match(/(?:https?:\/\/[^/]+)?\/(.*)/);
        if (urlParts && urlParts[1]) {
          return urlParts[1];
        }
        
        return fullPath;
      }
      
      return 'unknown';
    } catch {
      return 'unknown';
    }
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
   * Get the current timestamp
   */
  private getTimeString(): string {
    return new Date().toISOString();
  }

  /**
   * Format the log message
   */
  private formatMessage(level: LogLevel, message: string, context?: LoggerContext): string {
    const timestamp = this.getTimeString();
    
    // Create a copy of context without special directives
    let contextStr = '';
    if (context) {
      const contextForDisplay = { ...context };
      delete contextForDisplay._style;
      delete contextForDisplay._path;
      
      if (Object.keys(contextForDisplay).length > 0) {
        contextStr = ` ${JSON.stringify(contextForDisplay)}`;
      }
    }
    
    return `[${timestamp}] ${level.toUpperCase()}: ${message}${contextStr}`;
  }

  /**
   * Check if the current log should be shown based on config rules and environment
   */
  private shouldShowLog(keywords: string[]): boolean {
    // Force enable logs overrides everything
    if (forceEnableLogs) {
      return true;
    }
    
    // Check environment - only show logs in development
    if (typeof process !== 'undefined' && process.env && 
        process.env.NODE_ENV && process.env.NODE_ENV !== 'development') {
      return false;
    }
    
    // Read the latest config
    const configFile = this.readConfig();
    
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

  /**
   * Log method to handle all log levels
   */
  private log(level: LogLevel, message: string, context?: LoggerContext, keywordsStr?: string): void {
    // Parse keywords and check if this log should be shown
    const keywords = this.parseKeywords(keywordsStr);
    if (!this.shouldShowLog(keywords)) {
      return;
    }

    // Handle _path directive
    let contextToLog: LoggerContext | undefined;
    if (context) {
      contextToLog = { ...context };
      
      // Add path if requested
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

    const formattedMessage = this.formatMessage(level, message, contextToLog);
    const style = context?._style;

    if (style) {
      // Use styled logging
      console[level](`%c${message}`, style, contextToLog);
    } else {
      // Use regular logging
      console[level](formattedMessage);
    }
  }

  /**
   * Log an error message
   */
  error(message: string, context?: LoggerContext, keywordsStr?: string): void {
    this.log('error', message, context, keywordsStr);
  }

  /**
   * Log a warning message
   */
  warn(message: string, context?: LoggerContext, keywordsStr?: string): void {
    this.log('warn', message, context, keywordsStr);
  }

  /**
   * Log an info message
   */
  info(message: string, context?: LoggerContext, keywordsStr?: string): void {
    this.log('info', message, context, keywordsStr);
  }

  /**
   * Log a debug message
   */
  debug(message: string, context?: LoggerContext, keywordsStr?: string): void {
    this.log('debug', message, context, keywordsStr);
  }
  
  /**
   * Reset the config cache to force a fresh read from localStorage
   */
  resetConfigCache(): void {
    this.lastConfigRead = 0;
  }
}

export const logger = new ClientLogger();
