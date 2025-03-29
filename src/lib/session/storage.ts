/**
 * Local storage session management
 * Exports: SessionStorageManager class
 */
import { Session } from './types';

export class SessionStorageManager {
  private storageKey: string;

  constructor(storageKey: string) {
    this.storageKey = storageKey;
  }

  async saveSession(session: Session): Promise<void> {
    if (typeof window === 'undefined') return;
    
    try {
      const sessionData = JSON.stringify({
        ...session,
        expiresAt: session.expiresAt.toISOString()
      });
      localStorage.setItem(this.storageKey, sessionData);

      // Set cookie for server-side auth
      document.cookie = `auth_token=${session.token}; path=/; expires=${session.expiresAt.toUTCString()}; SameSite=Lax`;
    } catch (error) {
      console.error('Failed to save session:', error);
      throw error;
    }
  }

  async getSession(): Promise<Session | null> {
    if (typeof window === 'undefined') return null;
    
    try {
      const sessionData = localStorage.getItem(this.storageKey);
      if (!sessionData) return null;

      const parsedData = JSON.parse(sessionData);
      return {
        ...parsedData,
        expiresAt: new Date(parsedData.expiresAt)
      };
    } catch (error) {
      console.error('Failed to retrieve session:', error);
      return null;
    }
  }

  async clearSession(): Promise<void> {
    if (typeof window === 'undefined') return;
    
    try {
      localStorage.removeItem(this.storageKey);
      document.cookie = 'auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    } catch (error) {
      console.error('Failed to clear session:', error);
      throw error;
    }
  }
}
