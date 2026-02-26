/**
 * Proxy (formerly middleware.ts, renamed for Next.js 16+ compatibility)
 * Combines next-intl i18n routing, better-auth authentication,
 * CORS, and CSRF protection
 *
 * Strategy: Default-protected - all routes require authentication unless explicitly public
 */

import { auth } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { routing } from '@/i18n/routing';
import { isPreflightRequest, handlePreflight, applyCorsHeaders } from '@/lib/security/cors';
import { validateCsrfToken, ensureCsrfToken, csrfErrorResponse } from '@/lib/security/csrf';

/**
 * Simple i18n routing handler (replaces next-intl createIntlMiddleware)
 *
 * next-intl's createIntlMiddleware mutates NextURL.port which throws in
 * vinext's Workers runtime (getter-only property). This lightweight handler
 * provides equivalent functionality:
 * - Detects locale from URL path
 * - Redirects bare paths to default locale (e.g., / → /en)
 * - Passes through paths that already have a locale prefix
 */
function handleI18nRouting(req: NextRequest): NextResponse {
  const { locales, defaultLocale } = routing;
  const pathname = req.nextUrl.pathname;

  // Check if pathname already has a locale prefix
  const hasLocale = locales.some(
    locale => pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`
  );

  if (hasLocale) {
    // Path already has locale, continue processing
    return NextResponse.next();
  }

  // Detect preferred locale from Accept-Language header
  const acceptLanguage = req.headers.get('accept-language') || '';
  let detectedLocale = defaultLocale;
  for (const locale of locales) {
    if (acceptLanguage.toLowerCase().includes(locale)) {
      detectedLocale = locale;
      break;
    }
  }

  // Redirect to localized path using plain URL to avoid NextURL setter issues
  const url = new URL(req.url);
  url.pathname = `/${detectedLocale}${pathname}`;
  return NextResponse.redirect(url);
}

/**
 * Public paths that don't require authentication
 * These are checked WITHOUT locale prefix (the locale is stripped first)
 */
const publicPaths = [
  '/', // Home page
  '/privacy', // Privacy policy page
  '/terms', // Terms of service page
  '/login', // Login page
  '/register', // Register page
  '/pricing', // Pricing page
  '/checkout/cancel', // Checkout cancel page
];

/**
 * Auth-only pages (redirect away if already authenticated)
 */
const authPages = ['/login', '/register'];

/**
 * Strip locale prefix from pathname to get the actual route
 */
function stripLocale(pathname: string): string {
  const locales = routing.locales;
  for (const locale of locales) {
    if (pathname.startsWith(`/${locale}/`)) {
      return pathname.slice(`/${locale}`.length) || '/';
    }
    if (pathname === `/${locale}`) {
      return '/';
    }
  }
  return pathname;
}

export async function proxy(req: NextRequest) {
  try {
    const pathname = req.nextUrl.pathname;

    // Skip i18n for API routes - handle directly
    if (pathname.startsWith('/api/')) {
      // Handle CORS preflight
      if (isPreflightRequest(req)) {
        return handlePreflight(req);
      }
      // Validate CSRF for unsafe methods
      if (!validateCsrfToken(req)) {
        return csrfErrorResponse();
      }
      const response = NextResponse.next();
      return ensureCsrfToken(req, applyCorsHeaders(req, response));
    }

    // Handle CORS preflight for non-API routes
    if (isPreflightRequest(req)) {
      return handlePreflight(req);
    }

    // Validate CSRF token for unsafe methods on page routes
    if (!validateCsrfToken(req)) {
      return csrfErrorResponse();
    }

    // Apply i18n routing first
    const i18nResponse = handleI18nRouting(req as unknown as NextRequest);

    // Get the actual path without locale prefix for auth checks
    const actualPath = stripLocale(pathname);

    // Check authentication via better-auth session
    let isAuthenticated = false;
    try {
      const session = await auth.api.getSession({ headers: req.headers });
      isAuthenticated = !!session;
    } catch {
      // Session check failed — treat as unauthenticated and continue
      // This prevents auth errors from blocking public page access
    }

    const isPublicPath = publicPaths.some(
      path => actualPath === path || actualPath.startsWith(path + '/')
    );
    const isAuthPage = authPages.some(
      path => actualPath === path || actualPath.startsWith(path + '/')
    );

    // Also allow API-like public paths at root level
    const isApiPublicPath = [
      '/api/auth',
      '/api/health',
      '/api/register',
      '/api/stripe/webhook',
      '/api/monitoring',
    ].some(path => pathname.startsWith(path));

    // If user is authenticated and trying to access auth pages, redirect to home
    if (isAuthenticated && isAuthPage) {
      const response = NextResponse.redirect(new URL('/', req.url));
      return ensureCsrfToken(req, applyCorsHeaders(req, response));
    }

    // If not authenticated and not public, redirect to login
    if (!isAuthenticated && !isPublicPath && !isApiPublicPath) {
      const loginUrl = new URL('/login', req.url);
      loginUrl.searchParams.set('callbackUrl', pathname);
      const response = NextResponse.redirect(loginUrl);
      return ensureCsrfToken(req, applyCorsHeaders(req, response));
    }

    // Apply CORS and CSRF token to i18n response
    return ensureCsrfToken(req, applyCorsHeaders(req, i18nResponse));
  } catch (error) {
    // Log the error for Workers log inspection and return a diagnostic response
    console.error('[proxy] Unhandled error:', error);
    return new Response(
      JSON.stringify({
        error: 'Proxy error',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// Configure routes where proxy should run
// NOTE: vinext's matchMiddlewarePath uses .replace(/\./g, "\\.") which corrupts
// Next.js regex matchers. Use `:param` syntax instead, which vinext transforms
// correctly via .replace(/:(\w+)\*/g, "(?:.*)") → "^/(?:.*)$".
// In Cloudflare Workers, static assets are served by the CDN before hitting
// the worker, so the _next/static exclusion pattern is not needed.
export const config = {
  matcher: ['/:path*'],
};
