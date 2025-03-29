import { NextResponse } from 'next/server';
import { handleSignIn } from '@/lib/auth/handlers/signInHandler';
import { logger } from '@/lib/logger';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const result = await handleSignIn(body);
    return NextResponse.json(result);
  } catch (error) {
    logger.error('Sign in API error', { error }, 'auth api');
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Sign in failed' },
      { status: 400 }
    );
  }
}
