'use client';

import React, { createContext, useContext, useRef, useState, useCallback } from 'react';
import { DialogOptions, NotificationOptions, InteractionContextType } from './types';
import { ConfirmationDialog } from './dialogs';
import { logger } from '@/lib/client/logger';
import { ErrorToast } from './notifications/ErrorToast';

// Create a local toast registry
interface ToastRegistryItem {
  id: string;
  element: React.ReactNode;
  timer?: NodeJS.Timeout;
}

const InteractionContext = createContext<InteractionContextType | undefined>(undefined);

export const InteractionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Use state for rendering triggers
  const [dialog, setDialog] = useState<DialogOptions | null>(null);
  
  // Use state for toasts
  const [toasts, setToasts] = useState<ToastRegistryItem[]>([]);
  
  // Use ref for stable references that shouldn't trigger rerenders
  const dialogPromiseRef = useRef<{ resolve: () => void; reject: (error: Error) => void } | null>(null);
  const toastIdCounter = useRef(0);
  
  // Add a toast to the registry
  const addToast = useCallback((element: React.ReactNode, duration = 5000) => {
    const id = `toast-${++toastIdCounter.current}`;
    
    // Create timer to remove toast after duration
    const timer = setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, duration);
    
    // Add toast to registry
    setToasts(prev => [...prev, { id, element, timer }]);
    
    return id;
  }, []);
  
  // Remove a toast from the registry
  const removeToast = useCallback((id: string) => {
    setToasts(prev => {
      // Find the toast to remove
      const toast = prev.find(t => t.id === id);
      
      // Clear its timer if it exists
      if (toast?.timer) {
        clearTimeout(toast.timer);
      }
      
      // Filter it out
      return prev.filter(t => t.id !== id);
    });
  }, []);

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
  }, []);  // Track recent error messages to prevent duplicates
  const recentErrorsRef = useRef(new Map<string, number>());
  
  const showError = useCallback((options: NotificationOptions) =>{
    const { title, message, duration = 7000 } = options;
    
    // Create a unique key for this error message
    const errorKey = `${title}:${message.substring(0, 40)}`;
    const now = Date.now();
    
    // Check for duplicate errors in the last 3 seconds
    const recentErrors = recentErrorsRef.current;
    if (recentErrors.has(errorKey)) {
      const lastShown = recentErrors.get(errorKey) || 0;
      if (now - lastShown < 3000) {
        logger.debug('Skipping duplicate error notification', { 
          title, 
          errorKey,
          timeSinceLast: now - lastShown
        }, 'interaction notification');
        return '';
      }
    }
    
    // Update the timestamp for this error
    recentErrors.set(errorKey, now);
    
    // Clean up old errors (older than 10 seconds)
    recentErrors.forEach((timestamp, key) => {
      if (now - timestamp > 10000) {
        recentErrors.delete(key);
      }
    });
    
    logger.error('Showing error notification', { 
      title, 
      message,
      duration
    }, 'interaction notification error');
    
    // Create a unique ID for this toast
    const toastId = `toast-${++toastIdCounter.current}`;
    
    // Create a close function that will remove this toast
    const closeToast = () =>{
      removeToast(toastId);
    };
    
    // Create the error toast component with its close handler
    const errorToast = (<ErrorToast
        title={title}
        message={message}
        onClose={closeToast}
      />);
    
    // Create timer to auto-dismiss
    const timer = setTimeout(closeToast, duration);
    
    // Add to toast registry
    setToasts(prev =>[...prev, { 
      id: toastId, 
      element: errorToast,
      timer 
    }]);
    
    // Return the toast ID
    return toastId;}, [removeToast]);

  const contextValue = {
    showConfirmation,
    showError
  };

  return (
    <InteractionContext.Provider value={contextValue}>
      {children}
      {dialog && <ConfirmationDialog {...dialog} />}
      
      {/* Toast container */}
      {toasts.length > 0 && (
        <div className="fixed flex flex-col gap-2 bottom-4 right-4 z-[9999] max-w-md pointer-events-auto">
          {toasts.map(({ id, element }) => (
            <div key={id} className="animate-in fade-in slide-in-from-bottom-4">
              {element}
            </div>
          ))}
        </div>
      )}
    </InteractionContext.Provider>
  );
};

export const useInteraction = () => {
  const context = useContext(InteractionContext);
  if (!context) {
    throw new Error('useInteraction must be used within InteractionProvider');
  }
  return context;
};
