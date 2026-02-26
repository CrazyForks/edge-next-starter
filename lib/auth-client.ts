/**
 * Better-Auth Client
 * Used in client components for authentication operations
 * (sign in, sign out, session management)
 */

import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient();

// Export commonly used hooks and methods
export const { signIn, signUp, signOut, useSession } = authClient;
