/**
 * Utility for syncing logger configuration between server and client
 */

// Check if we're in a browser environment
const isBrowser = typeof window !== 'undefined';

/**
 * Check if we're in development environment
 */
const isDevelopment = (): boolean => {
  return process.env.NODE_ENV === 'development';
};

/**
 * Fetch logger config from server
 */
const fetchConfigFromServer = async (): Promise<any> => {
  if (!isBrowser) return null;
  
  try {
    const response = await fetch('/api/logger-config');
    if (response.ok) {
      const config = await response.json();
      localStorage.setItem('logger.config', JSON.stringify(config));
      return config;
    }
  } catch (error) {
    console.error('Failed to sync logger config:', error);
  }
  return null;
};

/**
 * Helper to safely check localStorage
 */
const safeLocalStorage = {
  hasItem: (key: string): boolean => {
    if (!isBrowser) return false;
    try {
      return localStorage.getItem(key) !== null;
    } catch (e) {
      return false;
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

// On client-side startup, check if logger.config.json exists on the server
// and sync it to localStorage only if in development mode
export const syncLoggerConfig = async (): Promise<void> => {
  // Skip in SSR
  if (!isBrowser) return;
  
  // In development, always sync with server
  if (isDevelopment()) {
    await fetchConfigFromServer();
  } else {
    // In production, only use localStorage if it exists
    if (!safeLocalStorage.hasItem('logger.config')) {
      // Set default production config with all logs disabled
      const defaultConfig = {
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
      safeLocalStorage.setItem('logger.config', JSON.stringify(defaultConfig));
    }
  }
};

// For client-side updates to logger config that need to be persisted
export const updateLoggerConfig = async (config: any): Promise<boolean> => {
  // Skip in SSR
  if (!isBrowser) return false;
  
  try {
    // In development, also update server config
    if (isDevelopment()) {
      const response = await fetch('/api/logger-config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config),
      });
      
      if (!response.ok) {
        console.error('Failed to update server logger config');
        return false;
      }
    }
    
    // Always update localStorage
    safeLocalStorage.setItem('logger.config', JSON.stringify(config));
    return true;
  } catch (error) {
    console.error('Failed to update logger config:', error);
    return false;
  }
};

// Fetch the latest config from server (used by turn_on_logs())
export const forceConfigSync = async (): Promise<void> => {
  // Skip in SSR
  if (!isBrowser) return;
  
  await fetchConfigFromServer();
};
