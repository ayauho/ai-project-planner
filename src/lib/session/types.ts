/**
 * Session management types and interfaces
 * Exports: Session, SessionConfig, SessionService interfaces
 */

export interface Session {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
}

export interface SessionConfig {
  tokenSecret: string;
  tokenExpiry: string;
  storageKey: string;
  refreshThreshold: number;
}

export interface SessionService {
  createSession(userId: string): Promise<Session>;
  validateSession(token: string): Promise<boolean>;
  refreshSession(token: string): Promise<Session>;
  revokeSession(token: string): Promise<void>;
}
