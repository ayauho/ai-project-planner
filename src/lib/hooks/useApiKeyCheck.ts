'use client';

import { useCallback, useEffect, useState } from 'react';
import { createApiKeyManager, defaultConfig, getUserApiKeyStorageKey } from '@/lib/ai/config';
import { logger } from '@/lib/client/logger';
import { apiKeyEvents } from '@/lib/events/apiKey';
import { authStorage } from '@/lib/client/auth/storage';

export function useApiKeyCheck() {
  const [hasKey, setHasKey] = useState<boolean>(false);
  const [userId, setUserId] = useState<string | null>(null);

  // Get current user ID from auth session
  const getUserId = useCallback(async () => {
    try {
      const session = await authStorage.getSession();
      return session?.user?._id || null;
    } catch (error) {
      logger.error('Error getting user ID for API key check', { error }, 'api-key authentication');
      return null;
    }
  }, []);

  const checkKey = useCallback(async () => {
    try {
      // Get current user ID
      const currentUserId = await getUserId();
      setUserId(currentUserId);

      if (!currentUserId) {
        logger.debug('No user ID available for API key check', {}, 'api-key authentication');
        setHasKey(false);
        return;
      }

      // Create user-specific API key manager
      const userConfig = {
        ...defaultConfig,
        storageKey: getUserApiKeyStorageKey(currentUserId)
      };
      
      const apiKeyManager = createApiKeyManager(userConfig);
      const key = await apiKeyManager.getKey();
      
      setHasKey(!!key);
      logger.debug('User-specific API key check completed', { 
        userId: currentUserId,
        exists: !!key 
      }, 'api-key authentication');
    } catch (error) {
      logger.error('Failed to check API key', { error }, 'api-key authentication error');
      setHasKey(false);
    }
  }, [getUserId]);

  useEffect(() => {
    // Initial check
    checkKey();

    // Subscribe to API key changes
    const unsubscribe = apiKeyEvents.subscribe(() => {
      logger.debug('API key change detected, rechecking', {}, 'api-key authentication');
      checkKey();
    });

    // Also check when user might have changed
    const checkInterval = setInterval(async () => {
      const newUserId = await getUserId();
      if (newUserId !== userId) {
        logger.info('User ID changed, rechecking API key', {
          oldUserId: userId,
          newUserId
        }, 'api-key authentication');
        checkKey();
      }
    }, 2000);

    return () => {
      unsubscribe();
      clearInterval(checkInterval);
    };
  }, [checkKey, getUserId, userId]);

  return hasKey;
}
