'use client';

import { IntlProvider } from 'use-intl';

/**
 * Client-side IntlProvider wrapper
 *
 * Workaround for vinext RSC compatibility:
 * - next-intl's NextIntlClientProvider resolves to an async server version
 *   via conditional exports, which calls headers() — unsupported in vinext.
 * - Importing IntlProvider from use-intl directly causes "createContext is not
 *   a function" because vinext's RSC environment lacks client React APIs.
 * - This local 'use client' wrapper ensures vinext serializes it as a client
 *   reference, keeping createContext execution on the client side.
 */
export function ClientIntlProvider({
  locale,
  messages,
  children,
}: {
  locale: string;
  messages: Record<string, unknown>;
  children: React.ReactNode;
}) {
  return (
    <IntlProvider locale={locale} messages={messages as IntlMessages}>
      {children}
    </IntlProvider>
  );
}

// Re-export type for messages
type IntlMessages = Record<string, string | Record<string, unknown>>;
