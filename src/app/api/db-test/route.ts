import { NextRequest, NextResponse } from 'next/server';
import DatabaseConnectionManager from '@/lib/db/connection';
import logger from '@/lib/logger';

export async function GET(_request: NextRequest) {
  try {
    logger.info('Testing database connection from API route', {}, 'database api');
    
    const dbManager = DatabaseConnectionManager.getInstance();
    const isConnected = await dbManager.isConnected();
    
    if (isConnected) {
      logger.info('Database is already connected', {}, 'database');
    } else {
      logger.info('Database not connected, attempting to connect', {}, 'database');
      await dbManager.connect();
      logger.info('Database connection successful from API route', {}, 'database api');
    }
    
    const connection = dbManager.getConnection();
    await connection.db.admin().ping();
    
    logger.info('Database ping test successful', {
      readyState: connection.readyState,
      databaseName: connection.db.databaseName
    }, 'database api');
    
    return NextResponse.json({ 
      status: 'Connected',
      readyState: connection.readyState,
      database: connection.db.databaseName
    });
  } catch (error) {
    logger.error('Database test failed', { 
      error,
      errorDetails: error instanceof Error ? error.message : String(error)
    }, 'database api');
    
    return NextResponse.json({ 
      error: 'Database connection failed',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}
