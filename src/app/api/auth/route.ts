import { NextRequest, NextResponse } from 'next/server';
import { handleSignUp } from '@/lib/auth/handlers/signUpHandler';
import { handleSignIn } from '@/lib/auth/handlers/signInHandler';
import { createSessionService } from '@/lib/session';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    const { action, ...data } = await request.json();
    const sessionService = createSessionService();
    let result;

    if (action === 'signup') {
      result = await handleSignUp(data);
    } else if (action === 'signin') {
      result = await handleSignIn(data);
    } else {
      return NextResponse.json(
        { error: 'Invalid action' },
        { status: 400 }
      );
    }

    if (!result.user._id) {
      logger.error('Auth successful but _id is missing', {}, 'auth security');
      return NextResponse.json(
        { error: 'Invalid user data' },
        { status: 500 }
      );
    }

    const session = await sessionService.createSession(result.user._id.toString());
    
    return NextResponse.json({
      success: true,
      user: result.user,
      token: session.token,
      expiresAt: session.expiresAt
    });
  } catch (error) {
    logger.error('Auth failed', { error }, 'auth security');
    // Return the specific error message
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Authentication failed' },
      { status: 409 }  // Conflict status for duplicate entries
    );
  }
}
