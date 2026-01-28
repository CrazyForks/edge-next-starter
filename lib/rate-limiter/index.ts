/**
 * Rate Limiter using Cloudflare KV
 * Prevents abuse by limiting the number of requests per time window
 *
 * This module re-exports from lib/api/rate-limit.ts and provides
 * convenience functions for common rate limiting use cases.
 */

import { createCacheClient } from '@/lib/cache/client';

// Re-export the main rate limiter from api module
export { withRateLimit, getRateLimitStatus } from '@/lib/api/rate-limit';

// =============================================================================
// Types
// =============================================================================

export interface RateLimitConfig {
  /**
   * Maximum number of requests allowed in the time window
   */
  maxRequests: number;

  /**
   * Time window in seconds
   */
  windowSeconds: number;

  /**
   * Key prefix for KV storage
   */
  keyPrefix: string;
}

export interface RateLimitResult {
  /**
   * Whether the request is allowed
   */
  allowed: boolean;

  /**
   * Number of requests made in the current window
   */
  current: number;

  /**
   * Maximum requests allowed
   */
  limit: number;

  /**
   * Remaining requests in the current window
   */
  remaining: number;

  /**
   * Time when the limit will reset (Unix timestamp in seconds)
   */
  resetAt: number;
}

// =============================================================================
// Core Rate Limiting Function
// =============================================================================

/**
 * Check rate limit for a given identifier
 * Uses a counter-based sliding window algorithm for efficiency
 *
 * @param identifier - Unique identifier (user ID, IP address, etc.)
 * @param config - Rate limit configuration
 * @returns Rate limit result
 */
export async function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const cache = createCacheClient();

  if (!cache) {
    // If KV is not available, allow the request (fail open)
    const now = Math.floor(Date.now() / 1000);
    return {
      allowed: true,
      current: 0,
      limit: config.maxRequests,
      remaining: config.maxRequests,
      resetAt: now + config.windowSeconds,
    };
  }

  const key = `${config.keyPrefix}:${identifier}`;
  const now = Date.now();
  const nowSeconds = Math.floor(now / 1000);
  const windowMs = config.windowSeconds * 1000;

  try {
    // Get current count
    const currentData = await cache.get(key);
    let count = 0;
    let firstRequestTime = now;

    if (currentData) {
      try {
        const parsed = JSON.parse(currentData);
        count = parsed.count || 0;
        firstRequestTime = parsed.firstRequestTime || now;
      } catch {
        // If parsing fails, reset counter
        count = 0;
        firstRequestTime = now;
      }
    }

    // Check whether time window expired
    if (now - firstRequestTime > windowMs) {
      // Window expired; reset counter
      count = 0;
      firstRequestTime = now;
    }

    // Check whether over the limit
    const allowed = count < config.maxRequests;

    if (allowed) {
      // Increment counter
      count++;
      await cache.put(key, JSON.stringify({ count, firstRequestTime }), {
        expirationTtl: config.windowSeconds,
      });
    }

    const resetAtSeconds = Math.floor(firstRequestTime / 1000) + config.windowSeconds;

    return {
      allowed,
      current: count,
      limit: config.maxRequests,
      remaining: Math.max(0, config.maxRequests - count),
      resetAt: resetAtSeconds,
    };
  } catch (error) {
    console.error('Rate limit check error:', error);
    // On error, allow request to pass (fail open)
    return {
      allowed: true,
      current: 0,
      limit: config.maxRequests,
      remaining: config.maxRequests,
      resetAt: nowSeconds + config.windowSeconds,
    };
  }
}

// =============================================================================
// Pre-configured Rate Limiters
// =============================================================================

/**
 * Upload rate limiter: 5 uploads per minute per user
 * Used for file upload endpoints
 */
export async function checkUploadRateLimit(userId: string): Promise<RateLimitResult> {
  return checkRateLimit(userId, {
    maxRequests: 5,
    windowSeconds: 60,
    keyPrefix: 'rate-limit:upload',
  });
}

/**
 * Download rate limiter: 30 downloads per minute per IP
 * Used for file download endpoints
 */
export async function checkDownloadRateLimit(ipAddress: string): Promise<RateLimitResult> {
  return checkRateLimit(ipAddress, {
    maxRequests: 30,
    windowSeconds: 60,
    keyPrefix: 'rate-limit:download',
  });
}

/**
 * Registration rate limiter: 5 registrations per hour per IP
 * Prevents automated registration attacks
 */
export async function checkRegistrationRateLimit(ipAddress: string): Promise<RateLimitResult> {
  return checkRateLimit(ipAddress, {
    maxRequests: 5,
    windowSeconds: 3600,
    keyPrefix: 'rate-limit:register',
  });
}

/**
 * Login rate limiter: 5 attempts per 15 minutes per IP
 * Prevents brute force password attacks
 */
export async function checkLoginRateLimit(ipAddress: string): Promise<RateLimitResult> {
  return checkRateLimit(ipAddress, {
    maxRequests: 5,
    windowSeconds: 900,
    keyPrefix: 'rate-limit:login',
  });
}

/**
 * Password reset rate limiter: 3 requests per hour per email
 * Prevents password reset abuse
 */
export async function checkPasswordResetRateLimit(email: string): Promise<RateLimitResult> {
  return checkRateLimit(email.toLowerCase(), {
    maxRequests: 3,
    windowSeconds: 3600,
    keyPrefix: 'rate-limit:password-reset',
  });
}

/**
 * API rate limiter: 300 requests per minute per IP
 * General API rate limiting
 */
export async function checkApiRateLimit(ipAddress: string): Promise<RateLimitResult> {
  return checkRateLimit(ipAddress, {
    maxRequests: 300,
    windowSeconds: 60,
    keyPrefix: 'rate-limit:api',
  });
}
