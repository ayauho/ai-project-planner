import { HealthCheckResult } from './types';
import DatabaseConnectionManager from './connection';
import logger from '@/lib/logger';

export class DatabaseHealthCheck {
  private static instance: DatabaseHealthCheck;
  private intervalId: NodeJS.Timeout | null = null;

  private constructor() {}

  public static getInstance(): DatabaseHealthCheck {
    if (!DatabaseHealthCheck.instance) {
      DatabaseHealthCheck.instance = new DatabaseHealthCheck();
    }
    return DatabaseHealthCheck.instance;
  }public async check(): Promise<HealthCheckResult> {
    const connectionManager = DatabaseConnectionManager.getInstance();
    try {
      const isConnected = await connectionManager.isConnected();
      if (!isConnected) {
        logger.warn('Health check failed: Database not connected', {}, 'database health-check');
        return {
          isHealthy: false,
          timestamp: new Date(),
          error: 'Database not connected'
        };
      }
      
      // Perform a basic operation to verify connection
      const connection = connectionManager.getConnection();
      const db = connection.db;
      await db.admin().ping();
      
      logger.debug('Health check passed', {}, 'database health-check');
      return {
        isHealthy: true,
        timestamp: new Date()
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Health check failed', { error }, 'database health-check error');
      return {
        isHealthy: false,
        timestamp: new Date(),
        error: errorMessage
      };
    }}

  public startMonitoring(interval: number = 30000): void {
    if (this.intervalId) {
      return;
    }

    this.intervalId = setInterval(async () => {
      try {
        await this.check();
      } catch (error) {
        logger.error('Health check monitoring failed', { error }, 'database health-check error');
      }
    }, interval);

    logger.info('Started database health monitoring', {}, 'database health-check monitoring');
  }

  public stopMonitoring(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('Stopped database health monitoring', {}, 'database health-check monitoring');
    }
  }
}

export default DatabaseHealthCheck;
