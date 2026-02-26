/**
 * User Registration API
 * Handles new user registration requests
 *
 * Security features:
 * - Rate limiting: 5 requests per hour to prevent abuse
 * - Password validation: Minimum 8 characters
 * - Email validation: RFC 5322 compliant
 */

import { NextRequest } from 'next/server';
import { hashPassword } from '@/lib/auth/password';
import { withRepositories, createdResponse, withRateLimit } from '@/lib/api';
import { createCacheClient } from '@/lib/cache/client';
import { ResourceAlreadyExistsError } from '@/lib/errors';
import { analytics, AnalyticsEventType } from '@/lib/analytics';
import { parseAndValidateBody, userRegistrationSchema } from '@/lib/validators';
import { prisma } from '@/lib/db/client';

// Use Edge runtime (compatible with Web Crypto API)
export const runtime = 'edge';

export async function POST(request: NextRequest) {
  // Apply strict rate limiting: 5 registrations per hour per IP
  // This prevents automated registration attacks
  return withRateLimit(
    request,
    async () => {
      return withRepositories(request, async repos => {
        // Parse and validate request body using shared validator
        const validatedData = await parseAndValidateBody(request, userRegistrationSchema);

        // Check if user already exists
        const exists = await repos.users.existsByEmail(validatedData.email);
        if (exists) {
          throw new ResourceAlreadyExistsError('User with this email');
        }

        const hashedPassword = await hashPassword(validatedData.password);
        const displayName = validatedData.name || validatedData.email.split('@')[0];

        const user = await repos.users.create({
          email: validatedData.email,
          name: displayName,
          password: hashedPassword,
        });

        // Create credential account entry for better-auth compatibility
        // better-auth expects passwords stored in the accounts table
        await prisma.account.create({
          data: {
            userId: user.id,
            type: 'credential',
            provider: 'credential',
            providerAccountId: validatedData.email,
            password: hashedPassword,
          },
        });

        // Clear cache
        const cache = createCacheClient();
        await cache?.delete('users:all');

        await analytics.trackBusinessEvent(AnalyticsEventType.USER_CREATED, {
          userId: user.id,
          email: user.email,
          source: 'register',
        });

        return createdResponse(
          {
            id: user.id,
            email: user.email,
            name: user.name,
            createdAt: new Date(user.createdAt * 1000).toISOString(),
          },
          'Registration successful'
        );
      });
    },
    // Strict rate limit: 5 registrations per hour per IP
    { maxRequests: 5, windowSeconds: 3600 }
  );
}
