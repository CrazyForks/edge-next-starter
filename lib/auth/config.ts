/**
 * NextAuth Authentication Configuration
 * Supports credentials login (email + password) and Google OAuth
 *
 * Security features:
 * - Constant-time password verification to prevent user enumeration
 * - JWT session strategy for Edge Runtime compatibility
 * - Secure password hashing with PBKDF2
 */

import NextAuth from 'next-auth';
import type { NextAuthConfig } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import { verifyPassword, hashPassword } from '@/lib/auth/password';
import { prisma } from '@/lib/db/client';
import { PrismaAdapter } from '@/lib/auth/adapter';

/**
 * Dummy password hash used for constant-time verification
 * This prevents user enumeration by ensuring the same amount of time
 * is spent whether a user exists or not
 */
const DUMMY_PASSWORD_HASH = await hashPassword('dummy_password_for_timing_attack_prevention');

export const authConfig: NextAuthConfig = {
  adapter: PrismaAdapter(prisma),

  // Session strategy: Use JWT (suitable for Edge Runtime)
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },

  // Custom page paths
  pages: {
    signIn: '/login',
    error: '/login',
  },

  // Authentication providers configuration
  providers: [
    // Google OAuth login
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      // Google authorization scopes
      authorization: {
        params: {
          prompt: 'consent',
          access_type: 'offline',
          response_type: 'code',
        },
      },
    }),

    // Credentials login (email + password)
    // Security: Uses constant-time verification to prevent user enumeration
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Please provide email and password');
        }

        // Fetch user from database
        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        });

        // SECURITY: Always perform password verification to prevent timing attacks
        // This ensures consistent response time regardless of whether user exists
        let isValid = false;

        if (user?.password) {
          // User exists and has a password - verify it
          try {
            isValid = await verifyPassword(credentials.password as string, user.password);
          } catch {
            // Password verification failed (e.g., invalid hash format)
            isValid = false;
          }
        } else {
          // User doesn't exist or has no password
          // Still perform verification against dummy hash to maintain constant time
          try {
            await verifyPassword(credentials.password as string, DUMMY_PASSWORD_HASH);
          } catch {
            // Expected to fail, just consuming time
          }
          isValid = false;
        }

        // Return appropriate response
        if (!isValid || !user) {
          throw new Error('Invalid email or password');
        }

        return {
          id: user.id.toString(),
          email: user.email,
          name: user.name,
          image: user.image,
        };
      },
    }),
  ],

  // Callback functions configuration
  callbacks: {
    async jwt({ token, user }) {
      // On first login, add user information to token
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.name = user.name;
        token.picture = user.image;
      }
      return token;
    },

    async session({ session, token }) {
      // Pass token information to session
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.email = token.email as string;
        session.user.name = token.name as string;
        session.user.image = token.picture as string;
      }
      return session;
    },
  },

  // Debug mode (should be false in production)
  debug: process.env.NODE_ENV === 'development',
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
