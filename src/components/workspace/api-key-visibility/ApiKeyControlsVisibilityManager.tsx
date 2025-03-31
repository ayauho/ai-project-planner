'use client';

import React, { useEffect, useState } from 'react';
import { createApiKeyManager, defaultConfig, getUserApiKeyStorageKey } from '@/lib/ai/config';
import { authStorage } from '@/lib/client/auth/storage';
import { logger } from '@/lib/client/logger';

/**
 * Component that manages visibility of task controls based on API key presence
 * This component doesn't render anything visible, it just manages classes and attributes
 */
export const ApiKeyControlsVisibilityManager: React.FC = () => {
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  const checkApiKey = async () => {
    try {
      // First check for existing body classes for quick response
      if (document.body.classList.contains('has-api-key')) {
        setHasApiKey(true);
        return true;
      }
      
      if (document.body.classList.contains('no-api-key')) {
        setHasApiKey(false);
        return false;
      }
      
      // Get user ID from session
      const session = await authStorage.getSession();
      const userId = session?.user?._id;
      
      if (!userId) {
        logger.warn('No user ID available for API key check', {}, 'api-key-visibility');
        setHasApiKey(false);
        return false;
      }
      
      // Use user-specific storage key
      const userConfig = {
        ...defaultConfig,
        storageKey: getUserApiKeyStorageKey(userId)
      };
      
      const apiKeyManager = createApiKeyManager(userConfig);
      const apiKey = await apiKeyManager.getKey();
      
      const keyExists = !!apiKey;
      setHasApiKey(keyExists);
      
      return keyExists;
    } catch (error) {
      logger.error('Error checking API key', { 
        error: error instanceof Error ? error.message : String(error) 
      }, 'api-key-visibility');
      setHasApiKey(false);
      return false;
    }
  };

  // Initial check on mount
  useEffect(() => {
    // Add initializing class to prevent elements from showing during check
    document.body.classList.add('initializing-api-key-state');
    
    checkApiKey().then(keyExists => {
      // Update body classes
      if (keyExists) {
        document.body.classList.add('has-api-key');
        document.body.classList.remove('no-api-key');
        document.body.setAttribute('data-has-api-key', 'true');
        document.body.removeAttribute('data-no-api-key');
      } else {
        document.body.classList.remove('has-api-key');
        document.body.classList.add('no-api-key');
        document.body.removeAttribute('data-has-api-key');
        document.body.setAttribute('data-no-api-key', 'true');
      }
      
      // Remove initializing class after a delay to ensure CSS transitions work
      setTimeout(() => {
        document.body.classList.remove('initializing-api-key-state');
        setIsInitializing(false);
      }, 300);
    });
    
    // Listen for API key changes
    const handleApiKeyChange = () => {
      logger.debug('API key change detected, updating control visibility', {}, 'api-key-visibility');
      checkApiKey().then(keyExists => {
        // Update body classes
        if (keyExists) {
          document.body.classList.add('has-api-key');
          document.body.classList.remove('no-api-key');
          document.body.setAttribute('data-has-api-key', 'true');
          document.body.removeAttribute('data-no-api-key');
        } else {
          document.body.classList.remove('has-api-key');
          document.body.classList.add('no-api-key');
          document.body.removeAttribute('data-has-api-key');
          document.body.setAttribute('data-no-api-key', 'true');
        }
      });
    };
    
    window.addEventListener('api-key-changed', handleApiKeyChange);
    
    return () => {
      window.removeEventListener('api-key-changed', handleApiKeyChange);
    };
  }, []);

  return null;
};

export default ApiKeyControlsVisibilityManager;
