'use client';

import React, { createContext, useContext, useRef, useState, useCallback } from 'react';
import { DialogOptions, NotificationOptions, InteractionContextType } from './types';
import { ConfirmationDialog } from './dialogs';
import { ErrorNotification } from './notifications';
import { ToastProvider, ToastViewport } from '@/components/ui/toast';
import { logger } from '@/lib/client/logger';

const InteractionContext = createContext<InteractionContextType | undefined>(undefined);

export const InteractionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Use state for rendering triggers
  const [dialog, setDialog] = useState<DialogOptions | null>(null);
  const [notification, setNotification] = useState<NotificationOptions | null>(null);
  
  // Use ref for stable references that shouldn't trigger rerenders
  const dialogPromiseRef = useRef<{ resolve: () => void; reject: (error: Error) => void } | null>(null);

  const showConfirmation = useCallback(async (options: DialogOptions) => {
    logger.info('Showing confirmation dialog', { title: options.title }, 'interaction dialog ui');

    return new Promise<void>((resolve, reject) => {
      const originalConfirm = options.onConfirm;
      
      // Store promise handlers
      dialogPromiseRef.current = { resolve, reject };

      // Wrap the onConfirm to handle promise resolution
      const wrappedConfirm = async () => {
        try {
          await originalConfirm();
          dialogPromiseRef.current?.resolve();
        } catch (error) {
          logger.error('Error in confirmation action', { error: String(error) }, 'interaction dialog error');
          dialogPromiseRef.current?.reject(error instanceof Error ? error : new Error(String(error)));
        } finally {
          setDialog(null);
          dialogPromiseRef.current = null;
        }
      };

      // Set dialog options with wrapped confirm
      const wrappedOptions = {
        ...options,
        onConfirm: wrappedConfirm,
        onCancel: () => {
          setDialog(null);
          dialogPromiseRef.current?.resolve();
        }
      };

      setDialog(wrappedOptions);
    });
  }, []);

  const showError = useCallback((options: NotificationOptions) => {
    logger.error('Showing error notification', { 
      title: options.title, 
      message: options.message 
    }, 'interaction notification error');
    
    setNotification(options);
    
    // Auto-dismiss notification
    setTimeout(() => {
      setNotification(prev => prev === options ? null : prev);
    }, options.duration || 5000);
  }, []);

  const handleNotificationClose = useCallback(() => {
    setNotification(null);
  }, []);

  const contextValue = {
    showConfirmation,
    showError
  };

  return (
    <ToastProvider>
      <InteractionContext.Provider value={contextValue}>
        {children}
        {dialog && <ConfirmationDialog {...dialog} />}
        {notification && (
          <ErrorNotification 
            {...notification} 
            onClose={handleNotificationClose}
          />
        )}
        <ToastViewport />
      </InteractionContext.Provider>
    </ToastProvider>
  );
};

export const useInteraction = () => {
  const context = useContext(InteractionContext);
  if (!context) {
    throw new Error('useInteraction must be used within InteractionProvider');
  }
  return context;
};
