import type { SessionConfig } from './types';

export function getSessionConfig(): SessionConfig {
  return {
    tokenSecret: process.env.JWT_SECRET || 'your-jwt-secret-key',
    tokenExpiry: '7d',
    storageKey: 'user_session',
    refreshThreshold: 24 * 60 * 60 * 1000 // 24 hours in milliseconds
  };
}
