'use client';

import io from 'socket.io-client';
import { logger } from '@/lib/client/logger';
import { SocketEvent } from '../types';

export class SocketManager {
  private socket: ReturnType<typeof io> | null = null;
  private readonly url: string;
  
  constructor(url: string) {
    this.url = url;
  }

  async connect(): Promise<void> {
    try {
      this.socket = io(this.url, {
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: 5
      });

      return new Promise((resolve, reject) => {
        if (!this.socket) {
          reject(new Error('Socket initialization failed'));
          return;
        }

        this.socket.on('connect', () => {
          logger.info('Socket connected', { socketId: this.socket?.id }, 'socket realtime');
          resolve();
        });

        this.socket.on('connect_error', (error: Error) => {
          logger.error('Socket connection error', { error }, 'socket realtime error');
          reject(error);
        });
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Unknown socket error');
      logger.error('Socket connection failed', { error: err }, 'socket realtime error');
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.socket) {
        this.socket.disconnect();
        this.socket = null;
        logger.info('Socket disconnected', {}, 'socket realtime');
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Unknown socket error');
      logger.error('Socket disconnection error', { error: err }, 'socket realtime error');
      throw err;
    }
  }

  emit(event: SocketEvent): void {
    if (!this.socket?.connected) {
      logger.warn('Socket not connected, cannot emit event', { event }, 'socket realtime warning');
      return;
    }

    try {
      this.socket.emit(event.type, event);
      logger.debug('Event emitted', { event }, 'socket realtime');
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Socket emit error');
      logger.error('Socket emit error', { error: err, event }, 'socket realtime error');
      throw err;
    }
  }

  on(eventType: string, callback: (event: SocketEvent) => void): void {
    if (!this.socket) {
      logger.warn('Socket not initialized, cannot add listener', { eventType }, 'socket realtime warning');
      return;
    }

    this.socket.on(eventType, callback);
    logger.debug('Event listener added', { eventType }, 'socket realtime');
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }
}
