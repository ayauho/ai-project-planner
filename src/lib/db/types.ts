import mongoose from 'mongoose';

export interface HealthCheckResult {
  isHealthy: boolean;
  timestamp: Date;
  error?: string;
}

export interface DatabaseConfig {
  uri: string;
  options: mongoose.ConnectOptions;
  maxConnections: number;
  retryAttempts: number;
  retryDelay: number;
  healthCheckInterval: number;
}

export interface ConnectionManager {
  connect(): Promise<typeof mongoose>;
  disconnect(): Promise<void>;
  isConnected(): Promise<boolean>;
  getConnection(): mongoose.Connection;
}
