/**
 * Client-side logging implementation with support for styling, keywords, and configuration
 */

// Extend the Window interface to include our custom property
declare global {
  interface Window {
    turn_on_logs: () => Promise<string>;
  }
}

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

// Check if we're in a browser environment
const isBrowser = typeof window !== 'undefined';

// Make turn_on_logs available in window scope for browser environment only
if (isBrowser) {
  window.turn_on_logs = async (): Promise<string> => {
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

/**
 * Helper to safely access localStorage
 */
const safeLocalStorage = {
  getItem: (key: string): string | null => {
    if (!isBrowser) return null;
    try {
      return localStorage.getItem(key);
    } catch (e) {
      console.error('Error accessing localStorage:', e);
      return null;
    }
  },
  setItem: (key: string, value: string): void => {
    if (!isBrowser) return;
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.error('Error writing to localStorage:', e);
    }
  }
};

class ClientLogger {
  private configFile: LoggerConfigFile;
  private lastConfigRead = 0;
  private readonly CONFIG_CACHE_TTL = 5000; // 5 seconds
  private isServerSide: boolean;

  constructor() {
    // Check if we're in a server-side rendering context
    this.isServerSide = !isBrowser;
    this.configFile = this.getDefaultConfig();
    this.initializeConfig();
  }

  /**
   * Initialize the config by reading from localStorage if available
   */
  private initializeConfig(): void {
    try {
      // Skip localStorage in server environment
      if (this.isServerSide) {
        return;
      }

      // Try to get config from localStorage
      const storedConfig = safeLocalStorage.getItem('logger.config');
      if (storedConfig) {
        const parsedConfig = JSON.parse(storedConfig) as LoggerConfigFile;
        this.configFile = parsedConfig;
        this.lastConfigRead = Date.now();
      }
      
      // Initialize syncing mechanism (browser only)
      if (isBrowser) {
        import('./logger-config-sync').then(({ syncLoggerConfig }) => {
          syncLoggerConfig().catch(e => console.error('Failed initial logger config sync:', e));
        }).catch(e => console.error('Failed to import logger-config-sync:', e));
      }
    } catch (error) {
      console.error('Failed to initialize logger config:', error);
      // Default config is already set in constructor
    }
  }

  /**
   * Get default configuration based on environment
   */
  private getDefaultConfig(): LoggerConfigFile {
    const isDev = typeof process !== 'undefined' && 
                  process.env && 
                  process.env.NODE_ENV === 'development';

    return {
      'hide-all': !isDev, // Hide logs in production by default
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

  /**
   * Read the config from localStorage if available
   */
  private readConfig(): LoggerConfigFile {
    // In server environment, use default config
    if (this.isServerSide) {
      return this.getDefaultConfig();
    }

    const now = Date.now();
    
    // Use cached config if it exists and is not expired
    if (now - this.lastConfigRead < this.CONFIG_CACHE_TTL) {
      return this.configFile;
    }

    try {
      const storedConfig = safeLocalStorage.getItem('logger.config');
      if (storedConfig) {
        const parsedConfig = JSON.parse(storedConfig) as LoggerConfigFile;
        this.configFile = parsedConfig;
      }
      
      this.lastConfigRead = now;
      return this.configFile;
    } catch (error) {
      console.error('Failed to read logger config:', error);
      
      // Return default config on error
      return this.getDefaultConfig();
    }
  }

  /**
   * Check if the logger keywords match the config keyword
   * - If config keyword has no spaces: ANY match in logger keywords is sufficient
   * - If config keyword has spaces: ALL words in the config keyword must be in logger keywords
   */
  private keywordMatches(loggerKeywords: string[], configKeyword: string): boolean {
    // Check if the config keyword contains spaces
    if (configKeyword.includes(' ')) {
      // Multi-word case: ALL words must be present
      const configKeywordParts = configKeyword.split(/\s+/);
      return configKeywordParts.every(part => loggerKeywords.includes(part));
    } else {
      // Single-word case: match if present
      return loggerKeywords.includes(configKeyword);
    }
  }

  /**
   * Extract the calling file path from the stack trace
   */
  private getCallerPath(): string {
    // Don't try to get stack traces in server environment
    if (this.isServerSide) {
      return 'server';
    }

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
        const urlParts = fullPath.match(/(?:https?:\/\/[^/]+)?\/(.+)/);
        if (urlParts && urlParts[1]) {
          return urlParts[1];
        }
        
        return fullPath;
      }
      
      return 'unknown';
    } catch (e) {
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
    
    // On server side in production, hide all logs
    if (this.isServerSide && process.env.NODE_ENV !== 'development') {
      return false;
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
      
      // Check if ANY of the config keywords match
      const shouldShow = configFile['show-by-keyword'].keywords.some(configKeyword => 
        this.keywordMatches(keywords, configKeyword)
      );
      
      if (!shouldShow) {
        return false;
      }
      
      // Check if ANY of the config keywords in hide list match
      if (configFile['hide-by-keyword'].works) {
        const shouldHide = configFile['hide-by-keyword'].keywords.some(configKeyword => 
          this.keywordMatches(keywords, configKeyword)
        );
        
        if (shouldHide) {
          return false;
        }
      }
      
      // If we got here, at least one config keyword matches the show list and none match the hide list
      return true;
    }
    
    // If only hide-by-keyword is active
    if (configFile['hide-by-keyword'].works && keywords.length > 0) {
      // Check if ANY of the config keywords in hide list match
      return !configFile['hide-by-keyword'].keywords.some(configKeyword => 
        this.keywordMatches(keywords, configKeyword)
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

    // In SSR, use simple console logging without styles
    if (this.isServerSide) {
      console[level](formattedMessage);
      return;
    }

    // Browser-specific styled logging
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
    if (this.isServerSide) return;
    this.lastConfigRead = 0;
  }
}

export const logger = new ClientLogger();
