import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import userRepository from '@/lib/user/schema';
import { createSessionService } from '@/lib/session';
import type { Session } from '@/lib/session/types';
import logger from '@/lib/logger';
import mongoose from 'mongoose';

export interface AuthenticatedRequest extends NextRequest {
  user?: {
    id: string;
    email: string;
  };
  session?: Session;
}

export const authenticateRequest = async (request: NextRequest): Promise<AuthenticatedRequest> => {
  try {
    // Get cookies
    const cookieStore = await cookies();
    const authCookie = cookieStore.get('auth_token');
    
    logger.info('Checking authentication cookie', {
      hasCookie: !!authCookie,
      cookieValue: authCookie?.value ? 'present' : 'missing'
    }, 'auth middleware');

    if (!authCookie?.value) {
      throw new Error('No authentication token in cookies');
    }

    // Create session service
    const sessionService = createSessionService();

    // Validate token
    const isValid = await sessionService.validateSession(authCookie.value);
    if (!isValid) {
      logger.error('Session validation failed', {}, 'auth middleware');
      throw new Error('Invalid session token');
    }

    // Get session data
    const session = await sessionService.refreshSession(authCookie.value);
    logger.info('Session refreshed', { 
      sessionId: session.id,
      userId: session.userId 
    }, 'auth middleware');

    // Validate userId format
    if (!mongoose.Types.ObjectId.isValid(session.userId)) {
      logger.error('Invalid userId format in session', { 
        userId: session.userId 
      }, 'auth validation');
      throw new Error('Invalid user ID format');
    }

    // Get user data
    const user = await userRepository.findById(session.userId);
    if (!user) {
      logger.error('Failed to find user by id', { 
        userId: session.userId 
      }, 'auth validation');
      throw new Error('User not found');
    }

    // Extra type checking for user._id
    if (!user._id) {
      logger.error('User found but has no _id', { 
        userId: session.userId 
      }, 'auth validation');
      throw new Error('Invalid user data');
    }

    const authenticatedRequest = request as AuthenticatedRequest;
    authenticatedRequest.user = {
      id: user._id.toString(),
      email: user.email
    };
    authenticatedRequest.session = session;

    logger.info('Authentication successful', { 
      userId: user._id.toString(),
      email: user.email,
      sessionId: session.id
    }, 'auth middleware');

    return authenticatedRequest;
  } catch (error) {
    logger.error('Authentication failed', { 
      error,
      cookies: await cookies()
    }, 'auth middleware error');
    throw error;
  }
};
