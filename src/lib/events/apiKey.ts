'use client';

import { logger } from '@/lib/client/logger';

const API_KEY_CHANGE_EVENT = 'api-key-change';

export const apiKeyEvents = {
  emit: () => {
    try {
      const event = new CustomEvent(API_KEY_CHANGE_EVENT);
      window.dispatchEvent(event);
      logger.debug('API key change event emitted', {}, 'api-key events');
    } catch (error) {
      logger.error('Failed to emit API key change event', { error }, 'api-key events error');
    }
  },
  subscribe: (callback: () => void) => {
    if (typeof window === 'undefined') return () => {};
    
    window.addEventListener(API_KEY_CHANGE_EVENT, callback);
    return () => window.removeEventListener(API_KEY_CHANGE_EVENT, callback);
  }
};
