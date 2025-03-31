'use client';

import { TaskEvent, TaskEventEmitter } from '@/lib/client/visual/task/events';
import { logger } from '@/lib/client/logger';

/**
 * Connects task error events to the UI notification system
 */
class AIErrorConnector {
  private static instance: AIErrorConnector;
  private errorHandlers: Array<(error: string, operation: string) =>void>= [];
  private initialized = false;
  // Track recently reported errors to prevent duplicates
  private recentErrors: Map<string, number> = new Map();

  private constructor() {
    // Private constructor for singleton
  }

  public static getInstance(): AIErrorConnector {
    if (!AIErrorConnector.instance) {
      AIErrorConnector.instance = new AIErrorConnector();
    }
    return AIErrorConnector.instance;
  }

  /**
   * Initializes the error connector with the task event emitter
   */
  public initialize(): void {
    if (this.initialized) return;

    try {
      const taskEventEmitter = TaskEventEmitter.getInstance();
      
      // Add listener for error events
      taskEventEmitter.addListener(this.handleTaskEvent.bind(this));
      
      this.initialized = true;
      logger.info('AI Error Connector initialized', {}, 'error-connector');
    } catch (error) {
      logger.error('Failed to initialize AI Error Connector', { 
        error: error instanceof Error ? error.message : String(error) 
      }, 'error-connector');
    }
  }

  /**
   * Registers an error handler function
   * @param handler Function to be called when an error occurs
   * @returns Function to remove the handler
   */
  public registerErrorHandler(handler: (error: string, operation: string) =>void): () =>void {
    this.errorHandlers.push(handler);
    logger.debug('Error handler registered', {}, 'error-connector');
    
    // Return a function to remove this handler
    return () =>{
      this.errorHandlers = this.errorHandlers.filter(h =>h !== handler);
      logger.debug('Error handler removed', {}, 'error-connector');
    };
  }

  /**
   * Processes a task event for potential errors
   */
  private handleTaskEvent(event: TaskEvent): void {
    if (event.type === 'error' && event.data) {
      try {
        const errorData = event.data as { 
          error: string | Error; 
          operation: string;
        };

        // Extract the error message
        const errorMessage = typeof errorData.error === 'string' 
          ? errorData.error 
          : errorData.error instanceof Error 
            ? errorData.error.message 
            : 'Unknown error';
        
        // Extract the operation type
        const operation = errorData.operation || 'unknown operation';
        
        logger.warn('Task error event detected', { 
          taskId: event.taskId,
          operation,
          error: errorMessage
        }, 'error-connector');
        
        // Call all registered error handlers
        this.errorHandlers.forEach(handler =>{
          try {
            handler(errorMessage, operation);
          } catch (handlerError) {
            logger.error('Error handler failed', { 
              handlerError: handlerError instanceof Error ? handlerError.message : String(handlerError) 
            }, 'error-connector');
          }
        });
      } catch (parseError) {
        logger.error('Failed to parse error event', { 
          eventType: event.type,
          parseError: parseError instanceof Error ? parseError.message : String(parseError)
        }, 'error-connector');
      }
    }
  }

  /**
   * Manually report an AI-related error to trigger notifications
   * @param error The error to report
   * @param operation The operation that caused the error
   */
  public reportAIError(error: string | Error, operation: string): void {
    try {
      const errorMessage = typeof error === 'string' ? error : error.message;
      
      // Create a key for deduplication - combine operation and truncated error message
      // Using just the first 40 chars of error message to handle small variations in similar errors
      const errorKey = `${operation}:${errorMessage.substring(0, 40)}`;
      const now = Date.now();
      
      // Check for recent duplicate errors (within last 3 seconds)
      if (this.recentErrors.has(errorKey)) {
        const lastReported = this.recentErrors.get(errorKey) || 0;
        if (now - lastReported < 3000) {
          logger.debug('Skipping duplicate error notification', { 
            operation,
            errorKey,
            timeSinceLast: now - lastReported
          }, 'error-connector');
          return;
        }
      }
      
      // Update the timestamp for this error
      this.recentErrors.set(errorKey, now);
      
      // Clean up old errors (older than 10 seconds)
      this.recentErrors.forEach((timestamp, key) => {
        if (now - timestamp > 10000) {
          this.recentErrors.delete(key);
        }
      });
      
      logger.warn('AI error reported', { 
        operation,
        error: errorMessage
      }, 'error-connector');
      
      // Call all registered error handlers
      this.errorHandlers.forEach(handler =>{
        try {
          handler(errorMessage, operation);
        } catch (handlerError) {
          logger.error('Error handler failed', { 
            handlerError: handlerError instanceof Error ? handlerError.message : String(handlerError)
          }, 'error-connector');
        }
      });
      
      // Don't emit task events here - this centralizes error reporting through handlers only
    } catch (reportError) {
      logger.error('Failed to report AI error', { 
        reportError: reportError instanceof Error ? reportError.message : String(reportError)
      }, 'error-connector');
    }
  }
}

export const aiErrorConnector = AIErrorConnector.getInstance();
