/**
 * Login Page
 * Provides email/password login and OAuth login functionality
 */

'use client';

import { useState } from 'react';
import { signIn } from '@/lib/auth-client';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button, Input, Label, FormError, OrDivider } from '@/components/ui';
import { AuthLayout } from '@/components/layout';
import { GoogleIcon } from '@/components/icons';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/';
  const [isLoading, setIsLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setError('');

    const formData = new FormData(event.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    try {
      await signIn.email(
        {
          email,
          password,
          callbackURL: callbackUrl,
        },
        {
          onSuccess: () => {
            router.push(callbackUrl);
          },
          onError: ctx => {
            setError(ctx.error.message || 'Invalid email or password');
          },
        }
      );
    } catch (err) {
      setError('Login failed, please try again later');
      console.error('Login error:', err);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleOAuthSignIn(provider: 'google') {
    setOauthLoading(provider);
    setError('');
    try {
      await signIn.social({
        provider,
        callbackURL: callbackUrl,
      });
    } catch (err) {
      setError('Google login failed');
      console.error('OAuth login error:', err);
      setOauthLoading(null);
    }
  }

  return (
    <AuthLayout
      title="Login"
      description="Enter your email and password to login to your account"
      footer={
        <>
          <Button type="submit" form="login-form" className="w-full" disabled={isLoading}>
            {isLoading ? 'Logging in...' : 'Login'}
          </Button>

          <OrDivider />

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => handleOAuthSignIn('google')}
            disabled={isLoading || oauthLoading !== null}
          >
            {oauthLoading === 'google' ? (
              'Loading...'
            ) : (
              <>
                <GoogleIcon className="mr-2 h-4 w-4" />
                Sign in with Google
              </>
            )}
          </Button>

          <div className="text-sm text-muted-foreground text-center">
            Don&apos;t have an account?{' '}
            <Link href="/register" className="text-primary hover:underline">
              Sign up now
            </Link>
          </div>
        </>
      }
    >
      <form id="login-form" onSubmit={onSubmit} className="space-y-4">
        <FormError message={error} />
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="your@email.com"
            required
            disabled={isLoading}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" required disabled={isLoading} />
        </div>
      </form>
    </AuthLayout>
  );
}
