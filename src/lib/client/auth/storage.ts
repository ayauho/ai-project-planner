'use client';

import { logger } from '@/lib/client/logger';

interface AuthSession {
  token: string;
  user: {
    _id: string;
    nickname: string;
    email: string;
  };
  expiresAt: string;
}

class AuthStorage {
  private readonly storageKey = 'auth_session';
  private readonly cookieName = 'auth_token';

  constructor() {
    // Initialize only in browser environment
    if (this.isBrowser()) {
      this.syncSessionWithCookie();
    }
  }

  private isBrowser(): boolean {
    return typeof window !== 'undefined' && typeof document !== 'undefined';
  }

  private safeLocalStorageGet(key: string): string | null {
    if (!this.isBrowser()) return null;
    try {
      return localStorage.getItem(key);
    } catch (error) {
      logger.error('localStorage get error', { error: String(error), key }, 'auth storage-error');
      return null;
    }
  }

  private safeLocalStorageSet(key: string, value: string): void {
    if (!this.isBrowser()) return;
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      logger.error('localStorage set error', { error: String(error), key }, 'auth storage-error');
    }
  }

  private safeLocalStorageRemove(key: string): void {
    if (!this.isBrowser()) return;
    try {
      localStorage.removeItem(key);
    } catch (error) {
      logger.error('localStorage remove error', { error: String(error), key }, 'auth storage-error');
    }
  }

  private setCookie(name: string, value: string, days: number) {
    if (!this.isBrowser()) return;
    
    const date = new Date();
    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
    const expires = `expires=${date.toUTCString()}`;
    document.cookie = `${name}=${value};${expires};path=/;SameSite=Strict`;
  }

  private getCookie(name: string): string | null {
    if (!this.isBrowser()) return null;
    
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) {
      return parts.pop()?.split(';').shift() || null;
    }
    return null;
  }

  private deleteCookie(name: string) {
    if (!this.isBrowser()) return;
    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
  }

  private syncSessionWithCookie() {
    if (!this.isBrowser()) return;

    try {
      const session = this.safeLocalStorageGet(this.storageKey);
      if (session) {
        const { token } = JSON.parse(session) as AuthSession;
        const currentCookie = this.getCookie(this.cookieName);
        
        if (!currentCookie) {
          // If we have a session but no cookie, set the cookie
          this.setCookie(this.cookieName, token, 7); // 7 days
          logger.debug('Synchronized cookie from localStorage session', {}, 'auth storage');
        }
      }
    } catch (error) {
      const errorContext = error instanceof Error ? { message: error.message } : { error };
      logger.error('Failed to sync session with cookie', errorContext, 'auth storage-error');
    }
  }

  async getSession(): Promise<AuthSession | null>{
    // Prevent server-side execution
    if (!this.isBrowser()) {
      logger.debug('Attempted to get session in non-browser environment', {}, 'auth storage');
      return null;
    }

    try {
      const data = this.safeLocalStorageGet(this.storageKey);
      if (!data) {
        logger.debug('No session found in storage', {}, 'auth storage');
        return null;
      }

      const session = JSON.parse(data) as AuthSession;
      logger.debug('Retrieved session', {
        userId: session.user._id,
        nickname: session.user.nickname,
        expiresAt: session.expiresAt,
        hasToken: !!session.token
      }, 'auth session');

      if (new Date(session.expiresAt)< new Date()) {
        logger.debug('Session expired', { expiresAt: session.expiresAt }, 'auth session');
        await this.clearSession();
        return null;
      }

      // Verify cookie exists
      const cookieToken = this.getCookie(this.cookieName);
      if (!cookieToken) {
        logger.debug('Cookie missing, resetting', {}, 'auth storage');
        this.setCookie(this.cookieName, session.token, 7);
      }

      return session;
    } catch (error) {
      const errorContext = error instanceof Error ? { message: error.message } : { error };
      logger.error('Failed to get session', errorContext, 'auth storage-error');
      return null;
    }
  }

  async setSession(session: AuthSession): Promise<void>{
    // Prevent server-side execution
    if (!this.isBrowser()) {
      logger.debug('Attempted to set session in non-browser environment', {}, 'auth storage');
      return;
    }

    try {
      // Get previous session to check for user changes
      let previousUserId: string | null = null;
      try {
        const previousSession = await this.getSession();
        previousUserId = previousSession?.user?._id || null;
      } catch (prevError) {
        logger.warn('Error getting previous session', { 
          error: String(prevError) 
        }, 'auth storage-error');
      }
      
      // Set the new session
      this.safeLocalStorageSet(this.storageKey, JSON.stringify(session));
      this.setCookie(this.cookieName, session.token, 7);

      logger.debug('Session stored', {
        userId: session.user._id,
        nickname: session.user.nickname,
        expiresAt: session.expiresAt,
        hasToken: !!session.token
      }, 'auth storage');
      
      // Check if user changed
      const newUserId = session.user._id;
      if (previousUserId && newUserId !== previousUserId) {
        logger.info('User changed, cleaning up previous user data', {
          previousUserId,
          newUserId
        }, 'auth session');
        
        // Clean up any data from previous user
        await this.cleanupPreviousUserData(previousUserId, newUserId);
      }
    } catch (error) {
      const errorContext = error instanceof Error ? { message: error.message } : { error };
      logger.error('Failed to set session', errorContext, 'auth storage-error');
      throw error;
    }
  }
  
  /**
   * Clean up data from previous user when a new user logs in
   */
  private async cleanupPreviousUserData(previousUserId: string, newUserId: string): Promise<void> {
    if (!this.isBrowser() || !previousUserId || !newUserId) {
      return;
    }
    
    try {
      // Clean up previous user's API key
      try {
        // Dynamically import to avoid circular dependencies
        const { getUserApiKeyStorageKey } = await import('@/lib/ai/config');
        const previousUserApiKeyKey = getUserApiKeyStorageKey(previousUserId);
        localStorage.removeItem(previousUserApiKeyKey);
        logger.debug('Removed previous user API key', { previousUserId }, 'auth cleanup');
      } catch (apiKeyError) {
        logger.error('Error clearing previous user API key', {
          previousUserId,
          error: String(apiKeyError)
        }, 'auth cleanup-error');
      }
      
      // Clean up previous user's workspace state
      try {
        // Dynamically import to avoid circular dependencies
        const { getUserStorageKey, getUserStorageKeyBase } = await import('@/lib/workspace/persistence/constants');
        const previousUserStateBaseKey = getUserStorageKeyBase(previousUserId);
        const previousUserMainStateKey = getUserStorageKey(previousUserId);
        
        // Remove main state key
        localStorage.removeItem(previousUserMainStateKey);
        
        // Find and remove all keys for previous user
        const previousUserKeys = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith(previousUserStateBaseKey)) {
            previousUserKeys.push(key);
          }
        }
        
        // Remove all found keys
        for (const key of previousUserKeys) {
          localStorage.removeItem(key);
        }
        
        logger.debug('Removed previous user workspace state', { 
          previousUserId, 
          keyCount: previousUserKeys.length + 1 // +1 for main state key
        }, 'auth cleanup');
      } catch (stateError) {
        logger.error('Error clearing previous user workspace state', {
          previousUserId,
          error: String(stateError)
        }, 'auth cleanup-error');
      }
      
      // Create custom event to notify about user change
      const event = new CustomEvent('user-changed', {
        detail: {
          previousUserId,
          newUserId,
          timestamp: Date.now()
        }
      });
      window.dispatchEvent(event);
      
      logger.info('User change cleanup completed', {
        previousUserId,
        newUserId
      }, 'auth cleanup');
    } catch (error) {
      logger.error('Error during previous user data cleanup', {
        previousUserId,
        newUserId,
        error: String(error)
      }, 'auth cleanup-error');
    }
  }

  async clearSession(): Promise<void>{
    // Prevent server-side execution
    if (!this.isBrowser()) {
      logger.debug('Attempted to clear session in non-browser environment', {}, 'auth storage');
      return;
    }

    try {
      // Get current user ID before clearing session
      const currentSession = await this.getSession();
      const userId = currentSession?.user?._id;
      
      // Clear authentication session
      this.safeLocalStorageRemove(this.storageKey);
      this.deleteCookie(this.cookieName);
      logger.debug('Session cleared', {}, 'auth session');
      
      // If we had a user ID, clean up user-specific data
      if (userId) {
        logger.info('Cleaning up user-specific data on logout', { userId }, 'auth cleanup');
        
        // Clear user-specific API key
        try {
          // Dynamically import to avoid circular dependencies
          const { getUserApiKeyStorageKey } = await import('@/lib/ai/config');
          const userApiKeyKey = getUserApiKeyStorageKey(userId);
          localStorage.removeItem(userApiKeyKey);
          logger.debug('Removed user-specific API key', { userId }, 'auth cleanup');
        } catch (apiKeyError) {
          logger.error('Error clearing user API key', {
            userId,
            error: String(apiKeyError)
          }, 'auth cleanup-error');
        }
        
        // Clear user-specific workspace state
        try {
          // Dynamically import to avoid circular dependencies
          const { getUserStorageKey, getUserStorageKeyBase } = await import('@/lib/workspace/persistence/constants');
          const userStateBaseKey = getUserStorageKeyBase(userId);
          const userMainStateKey = getUserStorageKey(userId);
          
          // Remove main user state
          localStorage.removeItem(userMainStateKey);
          
          // Find and remove all user-specific state keys
          const userKeys = [];
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(userStateBaseKey)) {
              userKeys.push(key);
            }
          }
          
          // Remove all found keys
          for (const key of userKeys) {
            localStorage.removeItem(key);
          }
          
          logger.debug('Removed user-specific workspace state', { 
            userId, 
            keyCount: userKeys.length + 1 // +1 for main state key
          }, 'auth cleanup');
        } catch (stateError) {
          logger.error('Error clearing user workspace state', {
            userId,
            error: String(stateError)
          }, 'auth cleanup-error');
        }
      }
    } catch (error) {
      const errorContext = error instanceof Error ? { message: error.message } : { error };
      logger.error('Failed to clear session', errorContext, 'auth storage-error');
    }
  }

  async isAuthenticated(): Promise<boolean>{
    // Prevent server-side execution
    if (!this.isBrowser()) {
      logger.debug('Attempted to check auth in non-browser environment', {}, 'auth storage');
      return false;
    }

    const session = await this.getSession();
    const cookieExists = !!this.getCookie(this.cookieName);
    const isAuth = session !== null && cookieExists;
    logger.debug('Auth check', { isAuth, hasCookie: cookieExists }, 'auth session');
    return isAuth;
  }
}

export const authStorage = new AuthStorage();
