import { LogLevel, LogFormat, LoggerConfigOptions, LoggerConfigFile } from './types';
import fs from 'fs';
import path from 'path';

let configFileCache: LoggerConfigFile | null = null;
let lastConfigRead = 0;
const CONFIG_CACHE_TTL = 5000; // 5 seconds

/**
 * Default configuration when file doesn't exist or has errors
 */
export const getDefaultLoggerConfig = (): LoggerConfigFile => {
  return {
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
};

/**
 * Read the logger.config.json file and cache the result
 */
export const readConfigFile = (forceReload = false): LoggerConfigFile => {
  const now = Date.now();
  
  // Use cached config if it exists, is not expired, and forceReload is false
  if (!forceReload && configFileCache && (now - lastConfigRead < CONFIG_CACHE_TTL)) {
    return configFileCache;
  }
  
  try {
    const filePath = path.join(process.cwd(), 'logger.config.json');
    
    if (fs.existsSync(filePath)) {
      const fileContent = fs.readFileSync(filePath, 'utf8');
      configFileCache = JSON.parse(fileContent) as LoggerConfigFile;
    } else {
      // Default config if file doesn't exist
      configFileCache = getDefaultLoggerConfig();
    }
    
    lastConfigRead = now;
    return configFileCache;
  } catch (error) {
    console.error('Failed to read logger config file:', error);
    
    // Return default config on error
    return getDefaultLoggerConfig();
  }
};

export const getLoggerConfig = (): LoggerConfigOptions => {
  const configFile = readConfigFile();
  
  return {
    logLevels: ['error', 'warn', 'info', 'debug'] as LogLevel[],
    formats: ['console'] as LogFormat[],
    configFile
  };
};
