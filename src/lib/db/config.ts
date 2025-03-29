import { DatabaseConfig } from './types';
import mongoose from 'mongoose';

export const getDatabaseConfig = (): DatabaseConfig => {
  // Use the working connection URI (found by testing) as fallback
  const uri = process.env.MONGODB_URI || 'mongodb://admin:devpassword@mongodb:27017/ai_project_planner?authSource=admin';
  
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
