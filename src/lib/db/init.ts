import mongoose from 'mongoose';
import { getDatabaseConfig } from './config';
import logger from '@/lib/logger';

// Interface for MongoDB errors to improve type safety
interface MongoDBError extends Error {
  code?: string | number;
  codeName?: string;
}

// Type guard to check if an error is a MongoDB error
function isMongoDBError(error: unknown): error is MongoDBError {
  return error instanceof Error && 
    ('code' in error || 'codeName' in error);
}

// Helper to safely extract error properties
function extractErrorDetails(error: unknown): Record<string, unknown> {
  if (isMongoDBError(error)) {
    return {
      errorName: error.name,
      errorMessage: error.message,
      errorCode: error.code,
      errorCodeName: error.codeName
    };
  } else if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessage: error.message
    };
  }
  return { errorType: typeof error };
}

export async function initializeDatabase() {
  const config = getDatabaseConfig();

  try {
    logger.info('Initializing database connection', {
      uri: config.uri/*.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')*/,
    }, 'database initialization');

    mongoose.set('strictQuery', true);

    mongoose.connection.on('connected', () => {
      logger.info('MongoDB connected successfully', {}, 'database initialization connection');
    });

    mongoose.connection.on('error', (error) => {
      const errorDetails = extractErrorDetails(error);
      logger.error('MongoDB connection error', { 
        error,
        ...errorDetails
      }, 'database initialization error');
    });

    mongoose.connection.on('disconnected', () => {
      logger.info('MongoDB disconnected', {}, 'database initialization disconnect');
    });

    // Connect using mongoose types
    await mongoose.connect(config.uri, config.options);

    // Test connection with detailed error handling
    const conn = mongoose.connection;
    try {
      await conn.db.admin().ping();
      logger.info('Database ping successful', {}, 'database initialization ping');
    } catch (pingError) {
      const errorDetails = extractErrorDetails(pingError);
      logger.error('Database ping failed', { 
        error: pingError,
        dbName: conn.db.databaseName,
        readyState: conn.readyState,
        ...errorDetails
      }, 'database initialization ping-error');
      throw pingError;
    }

    logger.info('Database initialized successfully', {}, 'database initialization');

    return conn;
  } catch (error) {
    const errorDetails = extractErrorDetails(error);
    logger.error('Failed to initialize database', { 
      error,
      ...errorDetails
    }, 'database initialization error');
    throw error;
  }
}
