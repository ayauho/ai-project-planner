'use client';

import { useEffect } from 'react';
import { aiErrorConnector } from '@/lib/client/error-connector';
import { useInteraction } from '@/components/workspace/interaction/context';
import { logger } from '@/lib/client/logger';import React from 'react';

/**
 * Custom hook to connect AI errors to the notification system
 */
export function useErrorNotification() {
  const { showError } = useInteraction();
  
  // Use ref to track the last time an error was shown for each operation
  const lastShownErrors = React.useRef<Record<string, { time: number, message: string }>>({});

  useEffect(() =>{
    // Initialize the error connector
    aiErrorConnector.initialize();

    logger.debug('Error notification hook initialized', {}, 'error-notification');

    // Register a handler for error events
    const removeHandler = aiErrorConnector.registerErrorHandler((errorMessage, operation) =>{
      // Check for duplicate error messages
      const now = Date.now();
      const lastError = lastShownErrors.current[operation];
      
      // If we've shown this exact error message for this operation in the last 3 seconds, skip it
      if (lastError && 
          lastError.message === errorMessage && 
          now - lastError.time < 3000) {
        logger.debug('Skipping duplicate error notification', { 
          operation,
          errorMessage,
          timeSinceLast: now - lastError.time
        }, 'error-notification');
        return;
      }
      
      // Update last shown time for this operation
      lastShownErrors.current[operation] = { 
        time: now,
        message: errorMessage
      };
      
      logger.warn('Showing AI error notification', { 
        operation,
        errorMessage
      }, 'error-notification');

      // Format the operation name for display
      let operationDisplay = operation;
      switch (operation) {
        case 'split':
          operationDisplay = 'Task Split';
          break;
        case 'regenerate':
          operationDisplay = 'Task Regeneration';
          break;
        case 'decompose':
          operationDisplay = 'Project Creation';
          break;
        default:
          operationDisplay = operation.charAt(0).toUpperCase() + operation.slice(1);
      }

      // Show the error notification with a specific timeout
      showError({
        title: `${operationDisplay} Failed`,
        message: errorMessage,
        duration: 7000 // Show for 7 seconds
      });
    });

    // Cleanup the handler when the component unmounts
    return () =>{
      removeHandler();
      logger.debug('Error notification hook cleanup', {}, 'error-notification');
    };
  }, [showError]);

  return null;
}