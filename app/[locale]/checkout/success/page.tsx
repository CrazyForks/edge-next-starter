/**
 * Checkout Success Page
 * Displayed after successful payment
 */

import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

interface SuccessPageProps {
  searchParams: Promise<{ session_id?: string }>;
}

export default async function CheckoutSuccessPage({ searchParams }: SuccessPageProps) {
  const session = await auth.api.getSession({ headers: await headers() });
  const params = await searchParams;

  if (!session?.user) {
    redirect('/login');
  }

  const sessionId = params.session_id;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
            <svg
              className="w-8 h-8 text-green-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <CardTitle className="text-2xl">Payment Successful!</CardTitle>
          <CardDescription>
            Thank you for your purchase. Your subscription is now active.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {sessionId && (
            <div className="bg-muted p-3 rounded-lg">
              <p className="text-sm text-muted-foreground">
                <span className="font-medium">Session ID:</span>{' '}
                <code className="text-xs">{sessionId.slice(0, 20)}...</code>
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Button className="w-full" asChild>
              <Link href="/billing">Manage Subscription</Link>
            </Button>
            <Button variant="outline" className="w-full" asChild>
              <Link href="/dashboard">Go to Dashboard</Link>
            </Button>
          </div>

          <p className="text-sm text-center text-muted-foreground">
            A confirmation email has been sent to {session.user.email}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
