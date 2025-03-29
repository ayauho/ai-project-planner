/**
 * JWT token handling implementation
 * Exports: TokenService class
 */

import jwt, { SignOptions, Secret } from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { Session, SessionConfig } from './types';
import { logger } from '@/lib/logger';
import { globalErrorHandler } from '@/lib/error';

export class TokenService {
  private config: SessionConfig;

  constructor(config: SessionConfig) {
    this.config = config;
  }

  async generateToken(userId: string): Promise<Session> {
    try {
      const sessionId = uuidv4();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      const signOptions: SignOptions = {
        expiresIn: Math.floor(7 * 24 * 60 * 60) // 7 days in seconds
      };

      const token = jwt.sign(
        { userId, sessionId },
        this.config.tokenSecret as Secret,
        signOptions
      );

      const session: Session = {
        id: sessionId,
        userId,
        token,
        expiresAt,
      };

      logger.info('Token generated successfully', { sessionId }, 'session token');
      return session;
    } catch (error) {
      logger.error('Failed to generate token', { error }, 'session token error');
      globalErrorHandler.handleError(error, { 
        operation: 'generateToken',
        userId 
      });
      throw error;
    }
  }

  async verifyToken(token: string): Promise<boolean> {
    try {
      jwt.verify(token, this.config.tokenSecret as Secret);
      return true;
    } catch (error) {
      logger.warn('Token verification failed', { error }, 'session token warning');
      return false;
    }
  }

  async decodeToken(token: string): Promise<{ userId: string; sessionId: string } | null> {
    try {
      const decoded = jwt.verify(token, this.config.tokenSecret as Secret) as { userId: string; sessionId: string };
      return decoded;
    } catch (error) {
      logger.warn('Token decode failed', { error }, 'session token warning');
      return null;
    }
  }
}
