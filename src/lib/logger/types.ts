export type LogLevel = 'error' | 'warn' | 'info' | 'debug';
export type LogFormat = 'console' | 'file';

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

export interface LoggerConfigOptions {
  logLevels: LogLevel[];
  formats: LogFormat[];
  rotationConfig?: {
    maxSize: string;
    maxFiles: string;
    datePattern: string;
  };
  logDir?: string;
  configFile?: LoggerConfigFile;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LoggerContext;
  keywords?: string[];
}

export interface LogFormatter {
  format(entry: LogEntry): string;
}
