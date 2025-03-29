import { DatabaseConnectionManager, DatabaseHealthCheck } from '@/lib/db';
import { logger } from '@/lib/logger';

export async function initializeDatabase() {
  try {
    const dbManager = DatabaseConnectionManager.getInstance();
    const healthCheck = DatabaseHealthCheck.getInstance();

    // Start health monitoring
    healthCheck.startMonitoring();

    // Initial connection
    await dbManager.connect();
    
    logger.info('Database initialized successfully', {}, 'database initialization');
  } catch (error) {
    logger.error('Failed to initialize database', { error }, 'database initialization error');
    throw error;
  }
}
