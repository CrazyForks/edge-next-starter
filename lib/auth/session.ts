/**
 * Safe session retrieval utilities for Server Components.
 *
 * Wraps better-auth's getSession in error handling to prevent
 * BetterAuthError (e.g., missing secret, DB issues) from crashing
 * the entire RSC render pipeline.
 */

import { auth } from '@/lib/auth';
import { headers } from 'next/headers';

/**
 * Get the current session safely in Server Components.
 * Returns null instead of throwing on auth errors.
 */
export async function getSessionSafe() {
  try {
    return await auth.api.getSession({ headers: await headers() });
  } catch (e) {
    console.error('[auth] Failed to get session:', e);
    return null;
  }
}
