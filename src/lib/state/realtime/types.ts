// Types for real-time state updates and synchronization

export type UpdateScope = 'project' | 'task' | 'workspace' | 'ui';

export interface SocketEvent {
  type: string;
  payload: unknown;
  timestamp: number;
}

export interface UpdateEvent<T = unknown> {
  scope: UpdateScope;
  type: string;
  payload: T;
  timestamp: number;
  userId: string;
}

export interface SyncOptions {
  retryAttempts?: number;
  retryDelay?: number;
  validateUpdates?: boolean;
}

export interface UpdateProcessor {
  processUpdate<T>(event: UpdateEvent<T>): Promise<void>;
  validateUpdate<T>(event: UpdateEvent<T>): Promise<boolean>;
}

export interface StateSync {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  sendUpdate<T>(event: UpdateEvent<T>): Promise<void>;
  onUpdate<T>(callback: (event: UpdateEvent<T>) => void): void;
}
