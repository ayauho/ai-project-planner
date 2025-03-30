import { DatabaseConfig } from './types';
import mongoose from 'mongoose';
import logger from '@/lib/logger';

export const getDatabaseConfig = (): DatabaseConfig => {
  // Log environment variables for debugging
  console.log('DBLOG_CONSOLE: Environment Variables:');
  console.log('MONGODB_URI:', process.env.MONGODB_URI ? 'SET' : 'NOT SET');
  console.log('MONGO_USER:', process.env.MONGO_USER);
  console.log('MONGO_PASSWORD:', process.env.MONGO_PASSWORD ? 'SET (length: ' + process.env.MONGO_PASSWORD.length + ')' : 'NOT SET');
  
  // Use the working connection URI (found by testing) as fallback
  let uri = process.env.MONGODB_URI || 'mongodb://admin:devpassword@mongodb:27017/ai_project_planner?authSource=admin';
  
  // If MONGODB_URI isn't set but MONGO_USER and MONGO_PASSWORD are, construct it
  if (!process.env.MONGODB_URI && process.env.MONGO_USER && process.env.MONGO_PASSWORD) {
    console.log('DBLOG_CONSOLE: Constructing URI from components');
    
    // Encode credentials manually
    const encodedUser = encodeURIComponent(process.env.MONGO_USER);
    const encodedPassword = encodeURIComponent(process.env.MONGO_PASSWORD);
    
    uri = `mongodb://${encodedUser}:${encodedPassword}@mongodb:27017/ai_project_planner?authSource=admin`;
    console.log('DBLOG_CONSOLE: Constructed URI (safe version):', uri.replace(/\/\/[^:]+:[^@]+@/, '//USER:PASS@'));
  }
  
  // Log the full connection details
  logger.info('DBLOG_MARKER: Database config loaded', {
    hasUri: !!uri,
    uriLength: uri.length,
    constructedFromEnv: !process.env.MONGODB_URI && process.env.MONGO_USER && process.env.MONGO_PASSWORD,
    unmaskedUri: uri
  }, 'database-config');
  
  return {
    uri,
    options: {
      maxPoolSize: 10,
      minPoolSize: 2,
      serverSelectionTimeoutMS: 20000,
      socketTimeoutMS: 45000,
      heartbeatFrequencyMS: 2000,
      writeConcern: {
        w: 'majority',
        j: true
      },
      readPreference: 'primary',
      readConcern: { level: 'majority' }
    } as mongoose.ConnectOptions,
    maxConnections: 10,
    retryAttempts: 5,
    retryDelay: 2000,
    healthCheckInterval: 30000,
  };
};
