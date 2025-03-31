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
  const getUserId = useCallback(async () =>{
    try {
      const session = await authStorage.getSession();
      return session?.user?._id || null;
    } catch (error) {
      logger.error('Error getting user ID for API key check', { error }, 'api-key authentication');
      return null;
    }
  }, []);

  const checkKey = useCallback(async () =>{
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

  useEffect(() =>{
    // Initial check
    checkKey();

    // Subscribe to API key changes
    const unsubscribe = apiKeyEvents.subscribe(() =>{
      logger.debug('API key change detected, rechecking', {}, 'api-key authentication');
      checkKey();
    });

    // Also check when user might have changed
    const checkInterval = setInterval(async () =>{
      const newUserId = await getUserId();
      if (newUserId !== userId) {
        logger.info('User ID changed, rechecking API key', {
          oldUserId: userId,
          newUserId
        }, 'api-key authentication');
        checkKey();
      }
    }, 2000);

    return () =>{
      unsubscribe();
      clearInterval(checkInterval);
    };
  }, [checkKey, getUserId, userId]);
  
  // Update body classes based on API key state
  useEffect(() =>{
    if (hasKey) {
      document.body.classList.add('has-api-key');
      document.body.classList.remove('no-api-key');
      document.body.setAttribute('data-has-api-key', 'true');
      document.body.removeAttribute('data-no-api-key');
      logger.debug('Added has-api-key class to body', {}, 'api-key authentication');
      
      // Dispatch a custom event to notify components
      window.dispatchEvent(new CustomEvent('api-key-status-change', { 
        detail: { hasApiKey: true }
      }));
    } else {
      document.body.classList.remove('has-api-key');
      document.body.classList.add('no-api-key');
      document.body.removeAttribute('data-has-api-key');
      document.body.setAttribute('data-no-api-key', 'true');
      logger.debug('Added no-api-key class to body', {}, 'api-key authentication');
      
      // Dispatch a custom event to notify components
      window.dispatchEvent(new CustomEvent('api-key-status-change', { 
        detail: { hasApiKey: false }
      }));
      
      // Hide only control elements immediately in DOM, not task rectangles
      try {
        document.querySelectorAll(
          '.task-split-button, g.task-split-button, g[data-control-type], [data-control-requires-api-key="true"]'
        ).forEach(element =>{
          if (element instanceof HTMLElement || element instanceof SVGElement) {
            element.style.setProperty('display', 'none', 'important');
            element.style.setProperty('visibility', 'hidden', 'important');
            element.style.setProperty('opacity', '0', 'important');
            element.style.setProperty('pointer-events', 'none', 'important');
            element.classList.add('force-hidden-element');
          }
        });
        
        // Ensure task rectangles remain visible
        document.querySelectorAll('.task-group, g.task-group, [id^="task-"]').forEach(taskRect => {
          if (taskRect instanceof HTMLElement || taskRect instanceof SVGElement) {
            taskRect.style.setProperty('display', 'block', 'important');
            taskRect.style.setProperty('visibility', 'visible', 'important');
            taskRect.style.setProperty('opacity', '1', 'important');
            taskRect.style.setProperty('pointer-events', 'auto', 'important');
          }
        });
      } catch (error) {
        logger.warn('Error managing visibility on API key change', { error }, 'api-key authentication');
      }
    }
  }, [hasKey]);

  return hasKey;
}
