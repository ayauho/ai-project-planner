import { Session, SessionService } from './types';
import { logger } from '../logger';
import { v4 as uuidv4 } from 'uuid';

// Define a type for JWT payloads
interface JwtPayload {
  exp: number;
  iat?: number;
  sub?: string;
  userId?: string;
  [key: string]: unknown;
}

class ClientSessionService implements SessionService {
  constructor() {
    // Client-side initialization if needed
  }

  parseJwt(token: string): JwtPayload | null {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        atob(base64).split('').map(c => 
          '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
        ).join('')
      );
      return JSON.parse(jsonPayload) as JwtPayload;
    } catch {
      return null;
    }
  }

  async validateSession(token: string): Promise<boolean> {
    try {
      const payload = this.parseJwt(token);
      if (!payload) return false;
      
      const expiryTime = payload.exp * 1000; // Convert to milliseconds
      return Date.now() < expiryTime;
    } catch (error) {
      logger.error('Token validation failed', { error: String(error) }, 'session-management auth-validation error');
      return false;
    }
  }

  async refreshSession(token: string): Promise<Session> {
    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Session refresh failed');
      }

      const session = await response.json();
      return {
        ...session,
        expiresAt: new Date(session.expiresAt)
      };
    } catch (error) {
      logger.error('Failed to refresh session', { error: String(error) }, 'session-management auth-refresh error');
      throw error;
    }
  }

  async revokeSession(token: string): Promise<void> {
    try {
      await fetch('/api/auth/revoke', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      localStorage.removeItem('auth_token');
    } catch (error) {
      logger.error('Failed to revoke session', { error: String(error) }, 'session-management auth-revoke error');
      throw error;
    }
  }
  async createSession(userId: string): Promise<Session> {
    try {
      // Generate a simple token (in a real-world scenario, use a more secure method)
      const tokenId = uuidv4();
      const token = `${userId}.${tokenId}`;
      
      // Calculate expiry (7 days from now)
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      
      const session: Session = {
        id: tokenId,
        userId,
        token,
        expiresAt
      };
      
      // In a client-side context, store in localStorage
      localStorage.setItem('session', JSON.stringify(session));
      
      logger.info('Session created successfully', { userId }, 'session-management auth-creation');
      
      return session;
    } catch (error) {
      logger.error('Failed to create session', { 
        userId, 
        error: String(error) 
      }, 'session-management auth-creation error');
      throw error;
    }
  }  
}

export const createSessionService = (): SessionService => {
  return new ClientSessionService();
};

export type { Session, SessionService };
