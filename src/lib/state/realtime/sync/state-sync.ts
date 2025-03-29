'use client';

import { logger } from '@/lib/client/logger';
import { SocketManager } from './socket';
import { StateSync, UpdateEvent, SyncOptions } from '../types';
import { SyncError } from '../errors';

const UPDATE_EVENT = 'state:update';

export class StateSyncManager implements StateSync {
  private readonly socket: SocketManager;
  private readonly options: Required<SyncOptions>;

  constructor(socketUrl: string, options: SyncOptions = {}) {
    this.socket = new SocketManager(socketUrl);
    this.options = {
      retryAttempts: options.retryAttempts ?? 3,
      retryDelay: options.retryDelay ?? 1000,
      validateUpdates: options.validateUpdates ?? true
    };
  }

  async connect(): Promise<void> {
    try {
      await this.socket.connect();
      logger.info('State sync connected', {}, 'state-sync realtime');
    } catch (error) {
      logger.error('State sync connection failed', { error }, 'state-sync realtime error');
      throw new SyncError('Failed to connect state sync', 'SYNC_CONNECT_ERROR');
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.socket.disconnect();
      logger.info('State sync disconnected', {}, 'state-sync realtime');
    } catch (error) {
      logger.error('State sync disconnection failed', { error }, 'state-sync realtime error');
      throw new SyncError('Failed to disconnect state sync', 'SYNC_DISCONNECT_ERROR');
    }
  }

  async sendUpdate<T>(event: UpdateEvent<T>): Promise<void> {
    try {
      if (!this.socket.isConnected()) {
        throw new SyncError('Socket not connected', 'SYNC_NOT_CONNECTED');
      }

      this.socket.emit({
        type: UPDATE_EVENT,
        payload: event,
        timestamp: Date.now()
      });

      logger.debug('Update sent', { event }, 'state-sync realtime');
    } catch (error) {
      logger.error('Failed to send update', { error, event }, 'state-sync realtime error');
      throw new SyncError('Failed to send update', 'SYNC_SEND_ERROR');
    }
  }

  onUpdate<T>(callback: (event: UpdateEvent<T>) => void): void {
    try {
      if (!this.socket.isConnected()) {
        throw new SyncError('Socket not connected', 'SYNC_NOT_CONNECTED');
      }

      if (typeof callback !== 'function') {
        throw new SyncError('Invalid callback provided', 'SYNC_INVALID_CALLBACK');
      }

      this.socket.on(UPDATE_EVENT, (socketEvent) => {
        logger.debug('Update received', { socketEvent }, 'state-sync realtime');
        callback(socketEvent.payload as UpdateEvent<T>);
      });

    } catch (error) {
      logger.error('Failed to register update handler', { error }, 'state-sync realtime error');
      throw new SyncError('Failed to register update handler', 'SYNC_HANDLER_ERROR');
    }
  }
}
