import mongoose from 'mongoose';
import { getDatabaseConfig } from './config';
import logger from '@/lib/logger';
import { encodeMongoDBUri } from '@/lib/utils/mongodb/url-encoder';

/**
 * Initialize the database connection
 */
export const initializeDatabase = async (): Promise<typeof mongoose> => {
  const config = getDatabaseConfig();
  
  try {
    mongoose.connection.on('connected', () => {
      logger.info('DBLOG_MARKER: MongoDB connected', {}, 'database initialization');
    });
    
    mongoose.connection.on('disconnected', () => {
      logger.info('DBLOG_MARKER: MongoDB disconnected', {}, 'database initialization');
    });
    
    mongoose.connection.on('error', (err) => {
      logger.error('DBLOG_MARKER: MongoDB connection error', { error: err }, 'database initialization');
    });
    
    // Special debug logging to track the exact connection details
    console.log('DBLOG_CONSOLE: About to connect with URI:', config.uri);
    
    // Log the exact connection string being used (for debugging only)
    logger.info('DBLOG_MARKER: EXACT CONNECTION STRING', {
      exactUri: config.uri,
      uriType: typeof config.uri,
      defaultUri: 'mongodb://admin:devpassword@mongodb:27017/ai_project_planner?authSource=admin'
    }, 'database-debug');
    
    // Double-check encoding to ensure it's properly encoded
    // This guarantees that even if the config URI wasn't properly encoded,
    // we'll still use a properly encoded URI for the actual connection
    const properlyEncodedUri = encodeMongoDBUri(config.uri);
    
    // Log both URIs for comparison
    logger.info('DBLOG_MARKER: CONNECTION COMPARISON', {
      original: config.uri,
      encoded: properlyEncodedUri
    }, 'database-debug');
    
    // Always connect with the properly encoded URI
    console.log('DBLOG_CONSOLE: Connecting with encoded URI');
    return await mongoose.connect(properlyEncodedUri, config.options);
  } catch (error) {
    console.error('DBLOG_CONSOLE: Database connection failed:', error);
    logger.error('DBLOG_MARKER: Failed to initialize database', { 
      error, 
      errorDetails: JSON.stringify(error),
      errorMessage: error.message,
      errorStack: error.stack
    }, 'database initialization');
    throw error;
  }
};
