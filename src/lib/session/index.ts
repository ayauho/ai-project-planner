/**
 * Session management main functionality
 * Exports: createSessionService, SessionManager class
 */
import { Session, SessionService, SessionConfig } from './types';
import { SessionStorageManager } from './storage';
import { TokenService } from './token';
import { getSessionConfig } from './config';
import { logger } from '@/lib/logger';
import { globalErrorHandler } from '@/lib/error';
export class SessionManager implements SessionService {
  private storage: SessionStorageManager;
  private tokenService: TokenService;
  private config: SessionConfig;
  constructor(config: SessionConfig = getSessionConfig()) {
    this.config = config;
    this.storage = new SessionStorageManager(config.storageKey);
    this.tokenService = new TokenService(config);
  }
  async createSession(userId: string): Promise<Session> {
    try {
      const session = await this.tokenService.generateToken(userId);
      await this.storage.saveSession(session);
      return session;
    } catch (error) {
      logger.error('Failed to create session', { error }, 'session authentication error');
      globalErrorHandler.handleError(error, {
        operation: 'createSession',
        userId
      });
      throw error;
    }
  }
  async validateSession(token: string): Promise<boolean> {
    try {
      return await this.tokenService.verifyToken(token);
    } catch (error) {
      logger.error('Session validation failed', { error }, 'session authentication error');
      globalErrorHandler.handleError(error, {
        operation: 'validateSession'
      });
      return false;
    }
  }
  async refreshSession(token: string): Promise<Session> {
    try {
      const decoded = await this.tokenService.decodeToken(token);
      if (!decoded) {
        throw new Error('Invalid token');
      }
      const session = await this.createSession(decoded.userId);
      return session;
    } catch (error) {
      logger.error('Failed to refresh session', { error }, 'session authentication error');
      globalErrorHandler.handleError(error, {
        operation: 'refreshSession'
      });
      throw error;
    }
  }
  async revokeSession(_token: string): Promise<void> {
    try {
      await this.storage.clearSession();
      logger.info('Session revoked successfully', {}, 'session authentication');
    } catch (error) {
      logger.error('Failed to revoke session', { error }, 'session authentication error');
      globalErrorHandler.handleError(error, {
        operation: 'revokeSession'
      });
      throw error;
    }
  }
}
export function createSessionService(config?: SessionConfig): SessionService {
  return new SessionManager(config);
}
export * from './types';
