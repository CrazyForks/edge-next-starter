import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { withRepositories, successResponse } from '@/lib/api';
import { LoggerFactory } from '@/lib/logger';

const logger = LoggerFactory.getLogger('gdpr:delete');

export const runtime = 'edge';

/**
 * DELETE /api/gdpr/delete
 * Soft-delete user account (GDPR Art. 17 - Right to Erasure)
 * Anonymizes user data rather than hard-deleting to maintain referential integrity
 */
export async function DELETE(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, error: { type: 'AUTHENTICATION_ERROR', message: 'Not authenticated' } },
      { status: 401 }
    );
  }

  const userId = Number(session.user.id);

  return withRepositories(request, async repos => {
    logger.info('GDPR account deletion requested', { userId });

    // Anonymize user data (soft delete)
    await repos.users.update(userId, {
      email: `deleted-${userId}@deleted.local`,
      name: 'Deleted User',
      password: null,
      image: null,
    });

    // Delete user posts
    const posts = await repos.posts.findByUserId(userId);
    for (const post of posts) {
      await repos.posts.delete(post.id);
    }

    logger.info('GDPR account deletion completed', {
      userId,
      postsDeleted: posts.length,
    });

    return successResponse(
      { deleted: true, anonymizedAt: new Date().toISOString() },
      'Account data has been anonymized and content deleted'
    );
  });
}
