/**
 * Logger formatting utilities
 * Exports: formatLogEntry
 */

import { LogEntry } from './types';

export const formatLogEntry = (entry: LogEntry): string => {
  const baseMsg = `[${entry.timestamp}] ${entry.level.toUpperCase()}: ${entry.message}`;
  
  if (entry.context && Object.keys(entry.context).length > 0) {
    // Create a copy of context without _style
    const contextForDisplay = { ...entry.context };
    delete contextForDisplay._style;
    
    if (Object.keys(contextForDisplay).length > 0) {
      return `${baseMsg}\nContext: ${JSON.stringify(contextForDisplay, null, 2)}`;
    }
  }
  
  return baseMsg;
};
