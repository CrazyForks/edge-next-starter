import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { withRepositories } from '@/lib/api';
import { exportUserData } from '@/lib/gdpr/data-exporter';

export const runtime = 'edge';

/**
 * GET /api/gdpr/export
 * Export all data belonging to the authenticated user (GDPR Art. 20)
 */
export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, error: { type: 'AUTHENTICATION_ERROR', message: 'Not authenticated' } },
      { status: 401 }
    );
  }

  return withRepositories(request, async repos => {
    const data = await exportUserData(Number(session.user!.id), repos);

    return new NextResponse(JSON.stringify(data, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="user-data-export-${Date.now()}.json"`,
      },
    });
  });
}
