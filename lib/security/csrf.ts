import { NextRequest, NextResponse } from 'next/server';

/**
 * CSRF Protection using Double Submit Cookie pattern
 * Compatible with Edge Runtime (no Node.js crypto dependency)
 */

const CSRF_COOKIE_NAME = '__csrf_token';
const CSRF_HEADER_NAME = 'x-csrf-token';
const TOKEN_LENGTH = 32;

/**
 * Generate a random CSRF token using Web Crypto API (Edge-compatible)
 */
function generateToken(): string {
  const array = new Uint8Array(TOKEN_LENGTH);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Routes exempt from CSRF validation
 */
const CSRF_EXEMPT_PATHS = [
  '/api/auth/', // better-auth handles its own CSRF
  '/api/stripe/webhook', // Stripe webhook uses signature verification
  '/api/health', // Health check endpoint
  '/api/monitoring/', // Monitoring endpoints
];

/**
 * Check if path is exempt from CSRF validation
 */
function isExemptPath(pathname: string): boolean {
  return CSRF_EXEMPT_PATHS.some(path => pathname.startsWith(path));
}

/**
 * Check if request method requires CSRF validation
 */
function isUnsafeMethod(method: string): boolean {
  return ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method.toUpperCase());
}

/**
 * Validate CSRF token from request
 * Compares cookie token with header token (Double Submit Cookie pattern)
 */
export function validateCsrfToken(request: NextRequest): boolean {
  const pathname = request.nextUrl.pathname;

  // Skip validation for safe methods and exempt paths
  if (!isUnsafeMethod(request.method) || isExemptPath(pathname)) {
    return true;
  }

  const cookieToken = request.cookies.get(CSRF_COOKIE_NAME)?.value;
  const headerToken = request.headers.get(CSRF_HEADER_NAME);

  if (!cookieToken || !headerToken) {
    return false;
  }

  // Constant-time comparison to prevent timing attacks
  return timingSafeEqual(cookieToken, headerToken);
}

/**
 * Timing-safe string comparison (Edge-compatible)
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Set CSRF cookie on response if not already present
 */
export function ensureCsrfToken(request: NextRequest, response: NextResponse): NextResponse {
  const existingToken = request.cookies.get(CSRF_COOKIE_NAME)?.value;

  if (!existingToken) {
    const token = generateToken();
    response.cookies.set(CSRF_COOKIE_NAME, token, {
      httpOnly: false, // Must be readable by JS for header submission
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 60 * 60 * 24, // 24 hours
    });
  }

  return response;
}

/**
 * Create CSRF validation error response
 */
export function csrfErrorResponse(): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: {
        type: 'CSRF_ERROR',
        message: 'Invalid or missing CSRF token',
      },
    },
    { status: 403 }
  );
}
