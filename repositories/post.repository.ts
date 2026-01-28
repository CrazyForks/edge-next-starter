import { PrismaClient, Prisma } from '@prisma/client';
import { DatabaseError, DatabaseQueryError } from '@/lib/errors';
import { analytics } from '@/lib/analytics';

/**
 * User select fields for include queries
 * Reusable across multiple methods to ensure consistency
 */
const USER_SELECT = {
  id: true,
  email: true,
  name: true,
} as const;

/**
 * Post with user relation type
 */
export type PostWithUser = Prisma.PostGetPayload<{
  include: { user: { select: typeof USER_SELECT } };
}>;

/**
 * Post without user relation type
 */
export type PostWithoutUser = Prisma.PostGetPayload<object>;

/**
 * Post Repository
 * Responsible only for database operations; no business logic
 */
export class PostRepository {
  constructor(private prisma: PrismaClient) {}

  /**
   * Query all posts (supports filters and pagination)
   * @param options.includeUser - Set to true to include user data (default: false to avoid N+1)
   */
  async findAll(options?: {
    userId?: number;
    published?: boolean;
    skip?: number;
    take?: number;
    includeUser?: boolean;
  }): Promise<PostWithUser[] | PostWithoutUser[]> {
    try {
      const where: {
        userId?: number;
        published?: boolean;
      } = {};

      if (options?.userId !== undefined) {
        where.userId = options.userId;
      }

      if (options?.published !== undefined) {
        where.published = options.published;
      }

      const start = Date.now();

      // Conditionally include user data to avoid N+1 queries
      const includeConfig = options?.includeUser ? { user: { select: USER_SELECT } } : undefined;

      const posts = await this.prisma.post.findMany({
        where,
        include: includeConfig,
        orderBy: { createdAt: 'desc' },
        skip: options?.skip,
        take: options?.take,
      });
      await analytics.trackDatabaseQuery('post.findAll', 'posts', Date.now() - start, {
        ...where,
        includeUser: options?.includeUser ?? false,
      });
      return posts;
    } catch (error) {
      throw new DatabaseQueryError('Failed to fetch posts', error);
    }
  }

  /**
   * Count posts (supports filters)
   */
  async count(options?: { userId?: number; published?: boolean }) {
    try {
      const where: {
        userId?: number;
        published?: boolean;
      } = {};

      if (options?.userId !== undefined) {
        where.userId = options.userId;
      }

      if (options?.published !== undefined) {
        where.published = options.published;
      }

      const start = Date.now();
      const total = await this.prisma.post.count({ where });
      await analytics.trackDatabaseQuery('post.count', 'posts', Date.now() - start, where);
      return total;
    } catch (error) {
      throw new DatabaseQueryError('Failed to count posts', error);
    }
  }

  /**
   * Find post by ID
   * @param id - Post ID
   * @param includeUser - Set to true to include user data (default: true for single post queries)
   */
  async findById(id: number, includeUser = true): Promise<PostWithUser | PostWithoutUser | null> {
    try {
      const start = Date.now();

      const includeConfig = includeUser ? { user: { select: USER_SELECT } } : undefined;

      const post = await this.prisma.post.findUnique({
        where: { id },
        include: includeConfig,
      });
      await analytics.trackDatabaseQuery('post.findById', 'posts', Date.now() - start, {
        id,
        includeUser,
      });
      return post;
    } catch (error) {
      throw new DatabaseQueryError(`Failed to fetch post with id ${id}`, error);
    }
  }

  /**
   * Find posts by user ID
   */
  async findByUserId(userId: number, options?: { published?: boolean; limit?: number }) {
    try {
      const where: { userId: number; published?: boolean } = { userId };

      if (options?.published !== undefined) {
        where.published = options.published;
      }

      const start = Date.now();
      const posts = await this.prisma.post.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: options?.limit,
      });
      await analytics.trackDatabaseQuery('post.findByUserId', 'posts', Date.now() - start, where);
      return posts;
    } catch (error) {
      throw new DatabaseQueryError(`Failed to fetch posts for user ${userId}`, error);
    }
  }

  /**
   * Create post
   * @param data - Post data
   * @param includeUser - Set to true to include user data in response (default: true)
   */
  async create(
    data: {
      userId: number;
      title: string;
      content?: string | null;
      published?: boolean;
    },
    includeUser = true
  ): Promise<PostWithUser | PostWithoutUser> {
    try {
      const start = Date.now();

      const includeConfig = includeUser ? { user: { select: USER_SELECT } } : undefined;

      const post = await this.prisma.post.create({
        data: {
          userId: data.userId,
          title: data.title,
          content: data.content || null,
          published: data.published ?? false,
        },
        include: includeConfig,
      });
      await analytics.trackDatabaseQuery('post.create', 'posts', Date.now() - start, {
        userId: data.userId,
        includeUser,
      });
      return post;
    } catch (error) {
      throw new DatabaseError('Failed to create post', error);
    }
  }

  /**
   * Update post
   * @param id - Post ID
   * @param data - Update data
   * @param includeUser - Set to true to include user data in response (default: true)
   */
  async update(
    id: number,
    data: {
      title?: string;
      content?: string | null;
      published?: boolean;
    },
    includeUser = true
  ): Promise<PostWithUser | PostWithoutUser> {
    try {
      const start = Date.now();

      const includeConfig = includeUser ? { user: { select: USER_SELECT } } : undefined;

      const post = await this.prisma.post.update({
        where: { id },
        data,
        include: includeConfig,
      });
      await analytics.trackDatabaseQuery('post.update', 'posts', Date.now() - start, {
        id,
        includeUser,
      });
      return post;
    } catch (error) {
      throw new DatabaseError(`Failed to update post with id ${id}`, error);
    }
  }

  /**
   * Delete post
   */
  async delete(id: number) {
    try {
      const start = Date.now();
      const deleted = await this.prisma.post.delete({
        where: { id },
      });
      await analytics.trackDatabaseQuery('post.delete', 'posts', Date.now() - start, { id });
      return deleted;
    } catch (error) {
      throw new DatabaseError(`Failed to delete post with id ${id}`, error);
    }
  }

  /**
   * Check if post exists
   */
  async exists(id: number): Promise<boolean> {
    try {
      const start = Date.now();
      const count = await this.prisma.post.count({
        where: { id },
      });
      await analytics.trackDatabaseQuery('post.exists', 'posts', Date.now() - start, { id });
      return count > 0;
    } catch (error) {
      throw new DatabaseQueryError(`Failed to check post existence: ${id}`, error);
    }
  }

  /**
   * Publish post
   */
  async publish(id: number) {
    try {
      const start = Date.now();
      const post = await this.prisma.post.update({
        where: { id },
        data: { published: true },
      });
      await analytics.trackDatabaseQuery('post.publish', 'posts', Date.now() - start, { id });
      return post;
    } catch (error) {
      throw new DatabaseError(`Failed to publish post with id ${id}`, error);
    }
  }

  /**
   * Unpublish post
   */
  async unpublish(id: number) {
    try {
      const start = Date.now();
      const post = await this.prisma.post.update({
        where: { id },
        data: { published: false },
      });
      await analytics.trackDatabaseQuery('post.unpublish', 'posts', Date.now() - start, { id });
      return post;
    } catch (error) {
      throw new DatabaseError(`Failed to unpublish post with id ${id}`, error);
    }
  }
}
