import mongoose from 'mongoose';
import { getDatabaseConfig } from './config';
import logger from '@/lib/logger';

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
    
    // Try directly encoding the password
    try {
      // Parse the URI to get components
      const parsedUri = new URL(config.uri);
      const username = parsedUri.username;
      const password = parsedUri.password;
      const host = parsedUri.host;
      const path = parsedUri.pathname;
      const search = parsedUri.search;
      
      // Create a properly encoded URI
      const properlyEncodedUri = `${parsedUri.protocol}//${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}${path}${search}`;
      
      // Log both URIs for comparison (without masking)
      logger.info('DBLOG_MARKER: CONNECTION COMPARISON', {
        original: config.uri,
        encoded: properlyEncodedUri
      }, 'database-debug');
      
      // Connect with the properly encoded URI
      console.log('DBLOG_CONSOLE: Connecting with encoded URI');
      await mongoose.connect(properlyEncodedUri, config.options);
    } catch (encodeError) {
      // If encoding fails, try the original
      logger.error('DBLOG_MARKER: Encoding failed, using original', { encodeError }, 'database-debug');
      console.log('DBLOG_CONSOLE: Encoding failed, using original URI');
      await mongoose.connect(config.uri, config.options);
    }
    
    return mongoose;
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
