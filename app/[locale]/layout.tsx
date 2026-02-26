import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  console.log('[LocaleLayout] start');
  // vinext may re-render the layout with undefined params during error recovery
  const resolvedParams = await params;
  const locale = resolvedParams?.locale;
  console.log('[LocaleLayout] locale:', locale);

  if (!locale || !hasLocale(routing.locales, locale)) {
    console.log('[LocaleLayout] invalid locale, calling notFound()');
    notFound();
  }

  const messages = (await import(`../../messages/${locale}.json`)).default;
  console.log('[LocaleLayout] messages loaded, rendering JSX');

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}
