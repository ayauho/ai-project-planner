import { logger } from '@/lib/logger';
import { UpdateEvent, UpdateProcessor } from '../types';
import { UpdateError } from '../errors';
import { resolveConflict } from './conflict-resolver';

export class ChangeProcessor implements UpdateProcessor {
  private readonly validators: Map<string, (payload: unknown) => Promise<boolean>>;

  constructor() {
    this.validators = new Map();
  }

  async processUpdate<T>(event: UpdateEvent<T>): Promise<void> {
    try {
      logger.debug('Processing update', { event }, 'realtime state-update');

      if (await this.validateUpdate(event)) {
        const conflictResolved = await resolveConflict(event);
        if (conflictResolved) {
          logger.info('Update processed successfully', { event }, 'realtime state-update');
        } else {
          throw new UpdateError('Update conflict could not be resolved', 'UPDATE_CONFLICT');
        }
      } else {
        throw new UpdateError('Update validation failed', 'UPDATE_INVALID');
      }
    } catch (error) {
      logger.error('Update processing failed', { error, event }, 'realtime state-update error');
      throw error;
    }
  }

  async validateUpdate<T>(event: UpdateEvent<T>): Promise<boolean> {
    try {
      const validator = this.validators.get(`${event.scope}:${event.type}`);
      if (!validator) {
        logger.warn('No validator found for update type', { event }, 'realtime state-update warning');
        return true;
      }

      return await validator(event.payload);
    } catch (error) {
      logger.error('Update validation failed', { error, event }, 'realtime state-update error');
      return false;
    }
  }

  registerValidator(
    scope: string,
    type: string,
    validator: (payload: unknown) => Promise<boolean>
  ): void {
    this.validators.set(`${scope}:${type}`, validator);
    logger.debug('Validator registered', { scope, type }, 'realtime state-update');
  }
}
