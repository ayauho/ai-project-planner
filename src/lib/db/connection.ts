import mongoose from 'mongoose';
import { DatabaseConfig, ConnectionManager } from './types';
import { getDatabaseConfig } from './config';
import { initializeDatabase } from './init';
import logger from '@/lib/logger';

class DatabaseConnectionManager implements ConnectionManager {
  private static instance: DatabaseConnectionManager;
  private config: DatabaseConfig;
  private connecting: boolean = false;
  private retryCount: number = 0;
  private backoffDelay: number = 1000; // Start with 1 second

  private constructor() {
    this.config = getDatabaseConfig();
  }

  public static getInstance(): DatabaseConnectionManager {
    if (!DatabaseConnectionManager.instance) {
      DatabaseConnectionManager.instance = new DatabaseConnectionManager();
    }
    return DatabaseConnectionManager.instance;
  }

  private calculateBackoff(): number {
    // Exponential backoff with max of 30 seconds
    const delay = Math.min(this.backoffDelay * Math.pow(2, this.retryCount), 30000);
    return delay;
  }

  public async connect(): Promise<typeof mongoose> {
    if (mongoose.connection.readyState === 1) {
      return mongoose;
    }

    if (this.connecting) {
      logger.warn('Connection attempt already in progress', {
        retryCount: this.retryCount
      }, 'database connection-management');
      throw new Error('Connection attempt already in progress');
    }

    this.connecting = true;    try {
      // Log connection details securely (with masked password)
      logger.info('Attempting to connect to MongoDB', {
        uri: this.config.uri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@'),
        attempt: this.retryCount + 1
      }, 'database connection-management');
      
      // For debugging - detailed connection info
      const parsedUri = new URL(this.config.uri);
      logger.debug('Connection details (debugging)', {
        protocol: parsedUri.protocol,
        username: parsedUri.username,
        passwordLength: parsedUri.password?.length,
        hostname: parsedUri.hostname,
        port: parsedUri.port,
        pathname: parsedUri.pathname,
        searchParams: Object.fromEntries(parsedUri.searchParams),
        fullOptions: this.config.options
      }, 'database connection-debug');
      
      // Create a test connection using URL constructor to simulate what mongoose does
      try {
        const testUri = `${parsedUri.protocol}//${encodeURIComponent(parsedUri.username)}:${encodeURIComponent(parsedUri.password)}@${parsedUri.host}${parsedUri.pathname}${parsedUri.search}`;
        logger.debug('Re-encoded URI', {
          reEncodedUri: testUri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')
        }, 'database connection-debug');
      } catch (parseError) {
        logger.error('Error parsing connection URI', { parseError }, 'database connection-error');
      }
      
      const _connection = await initializeDatabase();// Reset counters on successful connection
      this.retryCount = 0;
      this.backoffDelay = 1000;
      
      logger.info('Successfully connected to MongoDB', {}, 'database connection-management');
      return mongoose;
    } catch (error) {
      logger.error('Failed to connect to MongoDB', { error }, 'database connection-management error');
      
      if (this.retryCount < this.config.retryAttempts) {
        this.retryCount++;
        const delay = this.calculateBackoff();
        
        logger.info(`Retrying connection in ${delay}ms, attempt ${this.retryCount}`, {}, 'database connection-retry');
        this.connecting = false;
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.connect();
      }
      
      throw error;
    } finally {
      this.connecting = false;
    }
  }

  public async disconnect(): Promise<void> {
    if (mongoose.connection.readyState !== 0) {
      try {
        await mongoose.disconnect();
        logger.info('Disconnected from MongoDB', {}, 'database connection-management');
      } catch (error) {
        logger.error('Error disconnecting from MongoDB', { error }, 'database connection-management error');
        throw error;
      }
    }
  }

  public async isConnected(): Promise<boolean> {
    return mongoose.connection.readyState === 1;
  }

  public getConnection(): mongoose.Connection {
    return mongoose.connection;
  }
}

export default DatabaseConnectionManager;
