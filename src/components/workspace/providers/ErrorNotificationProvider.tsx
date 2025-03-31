'use client';

import React, { useEffect } from 'react';
import { useErrorNotification } from '@/lib/hooks/useErrorNotification';
import { ApiKeyControlsVisibilityManager } from '@/components/workspace/api-key-visibility/ApiKeyControlsVisibilityManager';
import { InteractionProvider } from '@/components/workspace/interaction/context';
import { logger } from '@/lib/client/logger';

/**
 * Provider component that sets up error notifications and visibility management
 */
export const ErrorNotificationProvider: React.FC<{ children?: React.ReactNode }> = ({ 
  children 
}) => {
  return (
    <InteractionProvider>
      <div className="relative">
        {/* API Key Visibility Manager */}
        <ApiKeyControlsVisibilityManager />
        
        {/* Error notification hook */}
        <ErrorNotificationHook />
        
        {/* Child components */}
        {children}
      </div>
    </InteractionProvider>
  );
};

// Separate component to use hooks
const ErrorNotificationHook: React.FC = () => {
  // Initialize error notification system
  useErrorNotification();
  
  // For debugging - add logs for mount/unmount
  useEffect(() => {
    logger.debug('ErrorNotificationHook mounted', {}, 'error-notification');
    return () => {
      logger.debug('ErrorNotificationHook unmounted', {}, 'error-notification');
    };
  }, []);
  
  return null;
};

export default ErrorNotificationProvider;
