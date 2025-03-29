'use client';

import { logger } from '@/lib/client/logger';

export type TaskEventType = 
  | 'expand' 
  | 'collapse' 
  | 'heightChange' 
  | 'split' 
  | 'splitComplete' 
  | 'regenerate'
  | 'regenerateComplete'
  | 'delete'
  | 'deleteComplete'
  | 'stateChange' 
  | 'animateConnection' 
  | 'reanimateConnection' 
  | 'error';

// This ensures the string literals like "splitComplete" are compatible with TaskEventType
// Prefixed with _ to indicate it's defined but not directly used
type _EnsuredTaskEventType = TaskEventType | `${Extract<TaskEventType, string>}Complete`;

export interface TaskEvent {
  taskId: string;
  type: TaskEventType;
  height?: number;
  data?: Record<string, unknown>;
}

export type TaskEventListener = (event: TaskEvent) =>void;

export class TaskEventEmitter {
  private static instance: TaskEventEmitter;
  private listeners: TaskEventListener[] = [];
  private debug: boolean = false;
  
  private constructor() {}
  
  static getInstance(): TaskEventEmitter {
    if (!TaskEventEmitter.instance) {
      TaskEventEmitter.instance = new TaskEventEmitter();
    }
    return TaskEventEmitter.instance;
  }
  
  /**
   * Sets debug mode for task events
   */
  setDebug(debug: boolean): void {
    this.debug = debug;
  }
  
  /**
   * Adds an event listener and returns a function to remove it
   */
  addListener(listener: TaskEventListener): () =>void {
    const wrappedListener = (event: TaskEvent) =>{
      try {
        listener(event);
      } catch (error) {
        logger.error('Error in task event listener:', {
          error: error instanceof Error ? error.message : String(error),
          eventType: event.type,
          taskId: event.taskId
        }, 'task-events listener-error');
      }
    };
    
    this.listeners.push(wrappedListener);
    return () =>{
      const index = this.listeners.indexOf(wrappedListener);
      if (index >-1) {
        this.listeners.splice(index, 1);
      }
    };
  }
  
  /**
   * Emits a task event to all listeners
   */
  emit(event: TaskEvent): void {
    if (this.debug) {
      logger.debug('Task event emitted', {
        type: event.type,
        taskId: event.taskId,
        hasData: !!event.data,
        height: event.height
      }, 'task-events emission');
    }
    
    // Special handling for task selection events from state restoration
    if (event.type === 'stateChange' && 
        event.data?.state === 'selected' && 
        event.data?.fromStateRestoration) {
      
      // Check if this is a split task
      const isSplitTask = event.taskId.includes('child-') || 
                         event.taskId.includes('split-') ||
                         event.taskId.includes('subtask-') ||
                         event.data?.wasSplitTask === true ||
                         document.body.hasAttribute(`data-split-task-${event.taskId}`);
      
      if (isSplitTask) {
        logger.info('Handling split task selection event from state restoration', {
          taskId: event.taskId
        }, 'task-events state-restoration split-task');
        
        // Track that this task ID was restored from state
        // This helps protect against task ID mismatch issues
        const trackingAttr = `data-restored-split-task-${event.taskId}`;
        document.body.setAttribute(trackingAttr, 'true');
        
        // Clean up after a while
        setTimeout(() => {
          document.body.removeAttribute(trackingAttr);
        }, 30000);
      }
    }
    
    this.listeners.forEach(listener => listener(event));
  }
  
  /**
   * Emits a sequence of related events with proper timing
   */
  emitSequence(events: TaskEvent[], intervalMs: number = 50): void {
    if (events.length === 0) return;
    
    // Emit first event immediately
    this.emit(events[0]);
    
    // Schedule remaining events with progressive delays
    events.slice(1).forEach((event, index) =>{
      setTimeout(() =>{
        this.emit(event);
      }, (index + 1) * intervalMs);
    });
  }
}
