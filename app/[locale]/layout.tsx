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
  let locale: string;

  try {
    const resolvedParams = await params;
    console.log('[LocaleLayout] params:', JSON.stringify(resolvedParams));
    locale = resolvedParams.locale;
  } catch (e) {
    console.error('[LocaleLayout] Failed to resolve params:', e);
    throw e;
  }

  if (!hasLocale(routing.locales, locale)) {
    console.error('[LocaleLayout] Invalid locale, calling notFound:', locale);
    notFound();
  }

  let messages;
  try {
    messages = (await import(`../../messages/${locale}.json`)).default;
    console.log(
      '[LocaleLayout] Messages loaded for',
      locale,
      '- keys:',
      Object.keys(messages).length
    );
  } catch (e) {
    console.error('[LocaleLayout] Failed to load messages for', locale, ':', e);
    throw e;
  }

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}
