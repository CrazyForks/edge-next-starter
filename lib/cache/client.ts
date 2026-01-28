import { getCloudflareEnv } from '@/lib/db/client';
import { analytics } from '@/lib/analytics';

// =============================================================================
// Cache Keys - Centralized key management for consistency
// =============================================================================

/**
 * Cache key generators for consistent key naming across the application
 */
export const CACHE_KEYS = {
  // User cache keys
  USERS_ALL: 'users:all',
  USER: (id: number) => `user:${id}`,
  USER_BY_EMAIL: (email: string) => `user:email:${email.toLowerCase()}`,

  // Post cache keys
  POSTS_ALL: 'posts:all',
  POSTS_PAGE: (page: number, limit: number) => `posts:page:${page}:${limit}`,
  POSTS_BY_USER: (userId: number) => `posts:user:${userId}`,
  POST: (id: number) => `post:${id}`,

  // Subscription cache keys
  SUBSCRIPTION: (userId: number) => `subscription:user:${userId}`,
  SUBSCRIPTION_STATUS: (customerId: number) => `subscription:status:${customerId}`,

  // Customer cache keys
  CUSTOMER: (userId: number) => `customer:user:${userId}`,
  CUSTOMER_BY_STRIPE: (stripeCustomerId: string) => `customer:stripe:${stripeCustomerId}`,
} as const;

/**
 * Cache TTL values (in seconds)
 */
export const CACHE_TTL = {
  // Short-lived cache for frequently changing data
  SHORT: 30, // 30 seconds

  // Medium-lived cache for moderately changing data
  MEDIUM: 60, // 1 minute

  // Long-lived cache for relatively static data
  LONG: 300, // 5 minutes

  // Very long-lived cache for rarely changing data
  EXTENDED: 3600, // 1 hour

  // Specific TTLs
  USER_LIST: 60, // 1 minute
  USER_SINGLE: 300, // 5 minutes
  POSTS_LIST: 120, // 2 minutes
  POST_SINGLE: 300, // 5 minutes
  SUBSCRIPTION: 30, // 30 seconds - sensitive data, short TTL
} as const;

/**
 * Get KV namespace instance
 */
export function getKVNamespace(): KVNamespace | null {
  const env = getCloudflareEnv();
  return env?.KV || null;
}

/**
 * KV cache client
 */
export class CacheClient {
  private kv: KVNamespace;

  constructor(kv: KVNamespace) {
    this.kv = kv;
  }

  /**
   * Set cache
   */
  async set(
    key: string,
    value: string | ArrayBuffer | ReadableStream,
    options?: KVNamespacePutOptions
  ): Promise<void> {
    try {
      await this.kv.put(key, value, options);
    } catch (error) {
      console.error('KV set error:', error);
    }
  }

  /**
   * Set cache (alias, KV API compatible)
   */
  async put(
    key: string,
    value: string | ArrayBuffer | ReadableStream,
    options?: KVNamespacePutOptions
  ): Promise<void> {
    return this.set(key, value, options);
  }

  /**
   * Get cache
   */
  async get(key: string, type?: 'text'): Promise<string | null>;
  async get(key: string, type: 'arrayBuffer'): Promise<ArrayBuffer | null>;
  async get(key: string, type: 'stream'): Promise<ReadableStream | null>;
  async get(
    key: string,
    type: 'text' | 'arrayBuffer' | 'stream' = 'text'
  ): Promise<string | ArrayBuffer | ReadableStream | null> {
    try {
      // Use string overloads to match tests and KV type signatures
      if (type === 'arrayBuffer') {
        return await this.kv.get(key, 'arrayBuffer');
      }
      if (type === 'stream') {
        return await this.kv.get(key, 'stream');
      }
      return await this.kv.get(key, 'text');
    } catch (error) {
      console.error('KV get error:', error);
      return null;
    }
  }

  /**
   * Delete cache
   */
  async delete(key: string): Promise<void> {
    try {
      await this.kv.delete(key);
    } catch (error) {
      console.error('KV delete error:', error);
    }
  }

  /**
   * List all keys
   */
  async list(options?: KVNamespaceListOptions): Promise<KVNamespaceListResult<unknown>> {
    return await this.kv.list(options);
  }

  /**
   * Get raw KV instance
   */
  get raw(): KVNamespace {
    return this.kv;
  }
}

/**
 * Create cache client instance
 */
export function createCacheClient(): CacheClient | null {
  const kv = getKVNamespace();
  if (!kv) {
    return null;
  }
  return new CacheClient(kv);
}

/**
 * Cache wrapper - functional caching pattern
 */
export async function withCache<T>(
  key: string,
  fn: () => Promise<T>,
  ttl: number = 3600 // Default: 1 hour
): Promise<T> {
  const cache = createCacheClient();

  // If no cache client, execute function directly
  if (!cache) {
    return await fn();
  }

  // Try to get from cache
  const cached = await cache.get(key);
  if (cached) {
    try {
      await analytics.trackCacheAccess(key, true);
      return JSON.parse(cached) as T;
    } catch {
      // If parsing fails, delete cache and re-fetch
      await cache.delete(key);
    }
  }

  // Execute function and cache the result
  const result = await fn();
  await cache.set(key, JSON.stringify(result), {
    expirationTtl: ttl,
  });

  await analytics.trackCacheAccess(key, false);

  return result;
}

// =============================================================================
// Cache Invalidation Utilities
// =============================================================================

/**
 * Invalidate user-related cache entries
 * @param userId - User ID to invalidate cache for
 */
export async function invalidateUserCache(userId?: number): Promise<void> {
  const cache = createCacheClient();
  if (!cache) return;

  // Always invalidate the all users list
  await cache.delete(CACHE_KEYS.USERS_ALL);

  // If userId is provided, invalidate specific user cache
  if (userId !== undefined) {
    await cache.delete(CACHE_KEYS.USER(userId));
    await cache.delete(CACHE_KEYS.POSTS_BY_USER(userId));
  }
}

/**
 * Invalidate post-related cache entries
 * @param postId - Post ID to invalidate
 * @param userId - User ID who owns the post
 */
export async function invalidatePostCache(postId?: number, userId?: number): Promise<void> {
  const cache = createCacheClient();
  if (!cache) return;

  // Invalidate all posts list
  await cache.delete(CACHE_KEYS.POSTS_ALL);

  // Invalidate specific post cache
  if (postId !== undefined) {
    await cache.delete(CACHE_KEYS.POST(postId));
  }

  // Invalidate user's posts cache
  if (userId !== undefined) {
    await cache.delete(CACHE_KEYS.POSTS_BY_USER(userId));
  }

  // Invalidate paginated cache (first few pages)
  // Note: This is a simple approach; for production, consider using cache tags
  for (let page = 1; page <= 5; page++) {
    await cache.delete(CACHE_KEYS.POSTS_PAGE(page, 10));
    await cache.delete(CACHE_KEYS.POSTS_PAGE(page, 20));
  }
}

/**
 * Invalidate subscription-related cache entries
 * @param userId - User ID to invalidate subscription cache for
 * @param customerId - Customer ID to invalidate cache for
 */
export async function invalidateSubscriptionCache(
  userId?: number,
  customerId?: number
): Promise<void> {
  const cache = createCacheClient();
  if (!cache) return;

  if (userId !== undefined) {
    await cache.delete(CACHE_KEYS.SUBSCRIPTION(userId));
    await cache.delete(CACHE_KEYS.CUSTOMER(userId));
  }

  if (customerId !== undefined) {
    await cache.delete(CACHE_KEYS.SUBSCRIPTION_STATUS(customerId));
  }
}

/**
 * Invalidate multiple cache keys at once
 * @param keys - Array of cache keys to invalidate
 */
export async function invalidateCacheKeys(keys: string[]): Promise<void> {
  const cache = createCacheClient();
  if (!cache) return;

  await Promise.all(keys.map(key => cache.delete(key)));
}
