'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ApiKeyManagerProps } from './types';
import { logger } from '@/lib/client/logger';
import { createApiKeyManager, defaultConfig, getUserApiKeyStorageKey } from '@/lib/ai/config';
import { apiKeyEvents } from '@/lib/events/apiKey';
import { authStorage } from '@/lib/client/auth/storage';
import './styles/api-key-manager.css';

const ApiKeyManager = ({ className = '' }: ApiKeyManagerProps) =>{
  const [isOpen, setIsOpen] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() =>{
    if (isOpen) {
      loadStoredKey();
    }
  }, [isOpen]);

  const loadStoredKey = async () =>{
    try {
      // Get user ID from session
      const session = await authStorage.getSession();
      const userId = session?.user?._id;
      
      logger.debug('[TRACE] Loading API key - user session data', {
        hasSession: !!session,
        sessionKeys: session ? Object.keys(session) : [],
        userKeys: session?.user ? Object.keys(session.user) : [],
        userId
      }, 'api-key storage debug');
      
      if (!userId) {
        logger.warn('No user ID available for loading API key', {}, 'api-key storage auth');
        return;
      }
      
      // Use user-specific storage key
      const storageKey = getUserApiKeyStorageKey(userId);
      const userConfig = {
        ...defaultConfig,
        storageKey: storageKey
      };
      
      logger.debug('[TRACE] Loading API key with storage key', { 
        storageKey,
        userId,
        defaultStorageKey: defaultConfig.storageKey
      }, 'api-key storage debug');
      
      const apiKeyManager = createApiKeyManager(userConfig);
      const storedKey = await apiKeyManager.getKey();
      
      logger.debug('[TRACE] Key retrieval result', {
        keyFound: !!storedKey,
        keyLength: storedKey ? storedKey.length : 0,
        storageKeyUsed: storageKey
      }, 'api-key storage debug');
      
      if (storedKey) {
        setApiKey(storedKey);
        logger.info('Loaded user-specific stored API key', { userId, storageKey }, 'api-key storage');
      } else {
        logger.warn('No stored API key found', { userId, storageKey }, 'api-key storage');
      }
    } catch (error) {
      logger.error('Failed to load stored API key', { error }, 'api-key storage error');
      setError('Failed to load stored API key');
    }
  };

  const validateAndSave = async () =>{
    try {
      setError('');
      setIsValidating(true);
      setIsSuccess(false);

      if (!apiKey) {
        setError('API key is required');
        return;
      }

      if (!apiKey.startsWith('sk-')) {
        setError('Invalid API key format');
        return;
      }
      
      // Get user ID from session
      const session = await authStorage.getSession();
      const userId = session?.user?._id;
      
      logger.debug('[TRACE] Saving API key - user session data', {
        hasSession: !!session,
        sessionKeys: session ? Object.keys(session) : [],
        userKeys: session?.user ? Object.keys(session.user) : [],
        userId
      }, 'api-key storage debug');
      
      if (!userId) {
        setError('You must be logged in to save an API key');
        return;
      }
      
      // Use user-specific storage key
      const storageKey = getUserApiKeyStorageKey(userId);
      const userConfig = {
        ...defaultConfig,
        storageKey: storageKey
      };
      
      logger.debug('[TRACE] Saving API key with storage key', { 
        storageKey,
        userId,
        defaultStorageKey: defaultConfig.storageKey
      }, 'api-key storage debug');

      const apiKeyManager = createApiKeyManager(userConfig);
      const isValid = await apiKeyManager.validateKey(apiKey);

      if (!isValid) {
        setError('Invalid API key. Please check and try again.');
        return;
      }

      await apiKeyManager.setKey(apiKey);
      
      // Verify key was actually saved for debugging
      const checkKey = await apiKeyManager.getKey();
      logger.debug('[TRACE] Verification of saved key', {
        keySaved: !!checkKey,
        keyLength: checkKey ? checkKey.length : 0,
        storageKeyUsed: storageKey
      }, 'api-key storage debug');
      
      setIsSuccess(true);
      logger.info('API key saved successfully for user', { userId, storageKey }, 'api-key storage security');
      
      // List localStorage keys for debugging
      const allKeys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.includes('api-key')) {
          allKeys.push(key);
        }
      }
      logger.debug('[TRACE] Available localStorage API keys after save', { keys: allKeys }, 'api-key storage debug');
      
      // Emit key change event
      apiKeyEvents.emit();
      
      setTimeout(() =>{
        setIsOpen(false);
        setIsSuccess(false);
      }, 1500);

    } catch (error) {
      logger.error('Failed to save API key', { error }, 'api-key storage error');
      setError('Failed to save API key. Please try again.');
    } finally {
      setIsValidating(false);
    }
  };

  const handleClear = async () =>{
    try {
      // Get user ID from session
      const session = await authStorage.getSession();
      const userId = session?.user?._id;
      
      if (!userId) {
        setError('You must be logged in to clear an API key');
        return;
      }
      
      // Use user-specific storage key
      const userConfig = {
        ...defaultConfig,
        storageKey: getUserApiKeyStorageKey(userId)
      };
      
      const apiKeyManager = createApiKeyManager(userConfig);
      await apiKeyManager.removeKey();
      setApiKey('');
      
      // Emit key change event
      apiKeyEvents.emit();
      logger.info('API key cleared for user', { userId }, 'api-key storage security');
    } catch (error) {
      logger.error('Failed to clear API key', { error }, 'api-key storage error');
      setError('Failed to clear API key');
    }
  };

  return (<div className={className}><Button
        onClick={() =>setIsOpen(true)}
        className="w-full"
      >Configure API Key</Button><Dialog open={isOpen} onOpenChange={setIsOpen}><DialogContent className="bg-white"><DialogHeader><DialogTitle className="text-gray-900">Configure OpenAI API Key</DialogTitle><DialogDescription className="text-gray-600">Enter your OpenAI API key to enable AI functionality.
              The key will be stored securely in your browser.</DialogDescription></DialogHeader><div className="space-y-4"><Input
              type="text"
              placeholder="Enter your OpenAI API key"
              value={apiKey}
              onChange={(e) =>setApiKey(e.target.value)}
              disabled={isValidating}
              className="bg-white text-gray-900 border-gray-300"
            />{error && (<Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>)}
            {isSuccess && (<Alert><AlertDescription>API key saved successfully!</AlertDescription></Alert>)}<div className="flex justify-end space-x-2">{apiKey && (<Button 
                  variant="outline" 
                  onClick={handleClear}
                  disabled={isValidating}
                  className="bg-white hover:bg-gray-50"
                >Clear Key</Button>)}<Button 
                variant="outline" 
                onClick={() =>setIsOpen(false)}
                disabled={isValidating}
                className="bg-white hover:bg-gray-50"
              >Cancel</Button><Button 
                onClick={validateAndSave}
                disabled={isValidating}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >{isValidating ? 'Validating...' : 'Save'}</Button></div></div></DialogContent></Dialog></div>);
};

export default ApiKeyManager;
