import type { Metadata } from 'next';
import { CookieConsent } from '@/components/gdpr/cookie-consent';
import { Toaster } from '@/components/ui/toaster';
import './globals.css';

export const runtime = 'edge';

export const metadata: Metadata = {
  title: {
    default: '{{SITE_NAME}} - Production-Ready Next.js + Cloudflare Starter',
    template: '%s | {{SITE_NAME}}',
  },
  description:
    '{{SITE_DESCRIPTION}} - A production-ready full-stack template with Edge Runtime, D1 database, R2 storage, KV cache, and better-auth authentication.',
  keywords: [
    'Next.js',
    'Cloudflare',
    'Edge Runtime',
    'D1',
    'R2',
    'Workers',
    'Full-Stack',
    'Template',
  ],
  authors: [{ name: '{{AUTHOR_NAME}}' }],
  creator: '{{AUTHOR_NAME}}',
  metadataBase: new URL(process.env.SITE_URL || process.env.NEXTAUTH_URL || 'https://localhost'),
  openGraph: {
    type: 'website',
    locale: 'en_US',
    siteName: '{{SITE_NAME}}',
    title: '{{SITE_NAME}} - Production-Ready Next.js + Cloudflare Starter',
    description:
      'A production-ready full-stack template with Edge Runtime, D1, R2, and better-auth.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: '{{SITE_NAME}}',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: '{{SITE_NAME}} - Production-Ready Next.js + Cloudflare Starter',
    description:
      'A production-ready full-stack template with Edge Runtime, D1, R2, and better-auth.',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  icons: {
    icon: '/favicon.ico',
    apple: '/icons/icon-192.png',
  },
  manifest: '/manifest.webmanifest',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  console.log('[RootLayout] rendering');
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
