'use client';

// Export debug utilities for global access
export * from './debug/centering-debug';
export * from './debug/force-center';

// Add global initialization
import { forceProjectCentering } from './debug/force-center';
import { logger } from '@/lib/client/logger';

// Declare global window extension for debug tools
declare global {
  interface Window {
    forceProjectCentering?: typeof forceProjectCentering;
  }
}

// Add to window object for debugging
if (typeof window !== 'undefined') {
  window.forceProjectCentering = forceProjectCentering;
  
  // Log availability
  logger.info('Project Centering Debug Tools Available! Use window.forceProjectCentering() if needed', {
    _style: 'background:#2563eb;color:white;padding:4px 8px;border-radius:4px;font-weight:bold;'
  }, 'debug tools');
}
