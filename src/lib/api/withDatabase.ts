import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { initializeDatabase } from '@/lib/db/init';
import logger from '@/lib/logger';

type ApiHandler = (req: NextRequest) => Promise<NextResponse>;

export function withDatabase(handler: ApiHandler): ApiHandler {
  return async (req: NextRequest) => {
    try {
      // Check if already connected
      if (mongoose.connection.readyState !== 1) {
        logger.info('Initializing database connection', {}, 'database middleware');
        await initializeDatabase();
      }

      return await handler(req);
    } catch (error) {
      logger.error('Database error in API route', { error }, 'database error');
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  };
}
