import { NextResponse } from 'next/server';
import { handleSignUp } from '@/lib/auth/handlers/signUpHandler';
import { logger } from '@/lib/logger';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const result = await handleSignUp(body);
    return NextResponse.json(result);
  } catch (error) {
    logger.error('Sign up API error', { error }, 'auth api');
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Sign up failed' },
      { status: 400 }
    );
  }
}
