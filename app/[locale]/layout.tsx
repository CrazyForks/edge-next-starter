import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { routing } from '@/i18n/routing';

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  // vinext may re-render the layout with undefined params during error recovery.
  // notFound() is NOT supported in vinext (throws unhandled RSC error), so we
  // fall back to the default locale instead of calling notFound().
  const resolvedParams = await params;
  let locale = resolvedParams?.locale;

  if (!locale || !hasLocale(routing.locales, locale)) {
    locale = routing.defaultLocale;
  }

  const messages = (await import(`../../messages/${locale}.json`)).default;

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}
