/**
 * Better-Auth Server Configuration
 * Supports credentials login (email + password) and Google OAuth
 *
 * Security features:
 * - Edge-compatible PBKDF2 password hashing via Web Crypto API
 * - Database-backed sessions with configurable expiration
 * - Field mapping to existing NextAuth-era DB schema
 */

import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { nextCookies } from 'better-auth/next-js';
import { env as cloudflareEnv } from 'cloudflare:workers';
import { prisma } from '@/lib/db/client';
import { hashPassword, verifyPassword } from '@/lib/auth/password';

/**
 * Resolve auth secret from Cloudflare env bindings or process.env fallback.
 * Secrets set via `wrangler secret put` are only accessible through the
 * `cloudflare:workers` env binding, NOT via `process.env`.
 */
function getAuthSecret(): string | undefined {
  // Cloudflare Workers: secrets are in env bindings
  const cfEnv = cloudflareEnv as Record<string, unknown>;
  if (cfEnv?.BETTER_AUTH_SECRET) return String(cfEnv.BETTER_AUTH_SECRET);
  if (cfEnv?.NEXTAUTH_SECRET) return String(cfEnv.NEXTAUTH_SECRET);
  // Fallback: process.env (local dev / Node.js)
  return process.env.BETTER_AUTH_SECRET || process.env.NEXTAUTH_SECRET;
}

export const auth = betterAuth({
  secret: getAuthSecret(),

  database: prismaAdapter(prisma, {
    provider: 'sqlite',
  }),

  emailAndPassword: {
    enabled: true,
    password: {
      hash: (password: string) => hashPassword(password),
      verify: (data: { hash: string; password: string }) =>
        verifyPassword(data.password, data.hash),
    },
  },

  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },

  plugins: [nextCookies()],

  // Field mapping to match existing DB schema (NextAuth-era column names)
  // The session key combines session settings AND model mapping
  user: {
    modelName: 'User',
    fields: {
      emailVerified: 'emailVerified',
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
    },
  },
  account: {
    modelName: 'Account',
    fields: {
      accountId: 'providerAccountId',
      providerId: 'provider',
      userId: 'userId',
      accessToken: 'accessToken',
      refreshToken: 'refreshToken',
      idToken: 'idToken',
      accessTokenExpiresAt: 'expiresAt',
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
    },
  },
  session: {
    // Session settings
    expiresIn: 30 * 24 * 60 * 60, // 30 days
    updateAge: 24 * 60 * 60, // Update session every 24 hours
    // Model mapping
    modelName: 'Session',
    fields: {
      token: 'sessionToken',
      expiresAt: 'expires',
      userId: 'userId',
      ipAddress: 'ipAddress',
      userAgent: 'userAgent',
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
    },
  },
  verification: {
    modelName: 'VerificationToken',
    fields: {
      identifier: 'identifier',
      value: 'token',
      expiresAt: 'expires',
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
    },
  },

  advanced: {
    database: {
      // Use autoincrement integer IDs to match existing schema
      generateId: false,
    },
  },

  // Debug mode (development only)
  ...(process.env.NODE_ENV === 'development' ? { logger: { level: 'debug' } } : {}),
});

// Re-export auth type for type inference
export type Auth = typeof auth;
