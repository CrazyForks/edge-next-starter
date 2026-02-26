import { hasLocale } from 'next-intl';
import { routing } from '@/i18n/routing';
import { ClientIntlProvider } from './intl-provider';

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const resolvedParams = await params;
  let locale = resolvedParams?.locale;

  if (!locale || !hasLocale(routing.locales, locale)) {
    locale = routing.defaultLocale;
  }

  const messages = (await import(`../../messages/${locale}.json`)).default;

  return (
    <ClientIntlProvider locale={locale} messages={messages}>
      {children}
    </ClientIntlProvider>
  );
}
