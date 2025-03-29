import { logger } from '@/lib/logger';
import { UpdateEvent } from '../types';
import { ConflictError } from '../errors';

export async function resolveConflict<T>(event: UpdateEvent<T>): Promise<boolean> {
  try {
    logger.debug('Resolving conflict', { event }, 'realtime conflict-resolution');
    
    // Basic timestamp-based resolution
    const currentTime = Date.now();
    const updateAge = currentTime - event.timestamp;
    
    // Check for invalid timestamp
    if (!Number.isFinite(updateAge)) {
      throw new ConflictError('Invalid timestamp', { updateAge });
    }
    
    if (updateAge > 5000) { // 5 seconds threshold
      logger.warn('Update too old, rejected', { event, updateAge }, 'realtime conflict-resolution warning');
      throw new ConflictError('Update too old', { updateAge });
    }
    
    return true;
  } catch (error) {
    logger.error('Conflict resolution failed', { error, event }, 'realtime conflict-resolution error');
    return false;
  }
}
