/**
 * Authentication Server Actions
 * Server-side actions for authentication operations
 */

'use server';

import { auth } from '@/lib/auth';
import { headers } from 'next/headers';

/**
 * Sign out the current user
 * Redirects to home page after successful sign out
 */
export async function handleSignOut() {
  await auth.api.signOut({ headers: await headers() });
}
