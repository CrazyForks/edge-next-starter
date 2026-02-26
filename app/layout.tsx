import type { Metadata } from 'next';
import { CookieConsent } from '@/components/gdpr/cookie-consent';
import { Toaster } from '@/components/ui/toaster';
import './globals.css';

export const runtime = 'edge';

export const metadata: Metadata = {
  title: {
    default: 'Edge Next Starter',
    template: '%s | Edge Next Starter',
  },
  description: 'A production-ready full-stack template with Edge Runtime, D1, R2, and better-auth.',
  metadataBase: new URL(process.env.SITE_URL || process.env.NEXTAUTH_URL || 'https://localhost'),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        {children}
        <Toaster />
        <CookieConsent />
      </body>
    </html>
  );
}
