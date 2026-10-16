import type { ReactNode } from "react";
import "./globals.css";
import { cookies } from "next/headers";
import { getDictionary, normalizeUiLocale, UI_LOCALE_COOKIE } from "../components/labels";
import { LocaleSelector } from "../components/ApprovalScreen";

export async function generateMetadata() {
  const locale = normalizeUiLocale((await cookies()).get(UI_LOCALE_COOKIE)?.value);
  return getDictionary(locale).metadata;
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = normalizeUiLocale((await cookies()).get(UI_LOCALE_COOKIE)?.value);
  return (
    <html lang={locale}>
      <body><LocaleSelector initialLocale={locale} />{children}</body>
    </html>
  );
}
