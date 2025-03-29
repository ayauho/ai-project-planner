import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Simplified middleware that only handles routing
export function middleware(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api/auth|_next/static|_next/image|favicon.ico).*)'
  ]
};
