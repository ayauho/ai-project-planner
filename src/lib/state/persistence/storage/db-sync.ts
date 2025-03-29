/**
 * Database synchronization implementation
 */

import { DatabaseSync, StorageItem } from '../types';
import { SyncError } from '../errors';
import { logger } from '@/lib/logger';
import mongoose from 'mongoose';
import { DatabaseConnectionManager } from '@/lib/db';

// Define interface for the document
interface IStateSync extends mongoose.Document {
  key: string;
  value: unknown;
  timestamp: number;
}

// Define a schema for state sync items
const StateSyncSchema = new mongoose.Schema<IStateSync>({
  key: { type: String, required: true, unique: true },
  value: { type: mongoose.Schema.Types.Mixed, required: true },
  timestamp: { type: Number, default: Date.now },
}, { 
  collection: 'state_sync',
  timestamps: false 
});

// Create a model
const StateSyncModel = mongoose.model<IStateSync>('StateSync', StateSyncSchema);

export class DatabaseSyncManager implements DatabaseSync {
  private connectionManager = DatabaseConnectionManager.getInstance();

  async syncToDb(item: StorageItem): Promise<void> {
    try {
      // Ensure connection
      await this.connectionManager.connect();
      
      // Upsert using Mongoose
      await StateSyncModel.findOneAndUpdate(
        { key: item.key },
        { 
          key: item.key,
          value: item.value,
          timestamp: item.timestamp
        },
        { 
          upsert: true, 
          new: true,
          setDefaultsOnInsert: true 
        }
      );
      
      logger.debug('Synced item to database', { key: item.key }, 'database-sync persistence');
    } catch (error) {
      logger.error('Failed to sync item to database', { item, error }, 'database-sync persistence error');
      throw new SyncError('Failed to sync to database', { error });
    }
  }

  async syncFromDb(key: string): Promise<StorageItem | null> {
    try {
      // Ensure connection
      await this.connectionManager.connect();
      
      // Find using Mongoose
      const item = await StateSyncModel.findOne({ key });
      
      if (!item) {
        logger.debug('Item not found in database', { key }, 'database-sync persistence');
        return null;
      }
      
      logger.debug('Retrieved item from database', { key }, 'database-sync persistence');
      return {
        key: item.key,
        value: item.value,
        timestamp: item.timestamp
      };
    } catch (error) {
      logger.error('Failed to sync from database', { key, error }, 'database-sync persistence error');
      throw new SyncError('Failed to sync from database', { error });
    }
  }

  async validateSync(key: string): Promise<boolean> {
    try {
      // Ensure connection
      await this.connectionManager.connect();
      
      // Check existence using Mongoose
      const item = await StateSyncModel.exists({ key });
      const exists = !!item;
      
      logger.debug('Validated sync status', { key, exists }, 'database-sync persistence');
      return exists;
    } catch (error) {
      logger.error('Failed to validate sync', { key, error }, 'database-sync persistence error');
      throw new SyncError('Failed to validate sync', { error });
    }
  }
}

export const dbSyncManager = new DatabaseSyncManager();
