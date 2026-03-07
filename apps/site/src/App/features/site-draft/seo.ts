export const DEFAULT_SEO_LOCALE = "en-US";

export const DEFAULT_SEO_SETTINGS = {
  locale: DEFAULT_SEO_LOCALE,
  twitter: true,
  openGraph: true,
  structuredData: true,
  indexFollow: true
} as const;

export const normalizeSeoLocale = (value: string | null | undefined): string => {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return DEFAULT_SEO_LOCALE;

  try {
    const [canonicalLocale] = Intl.getCanonicalLocales(trimmed.replaceAll("_", "-"));
    return canonicalLocale || DEFAULT_SEO_LOCALE;
  } catch {
    return DEFAULT_SEO_LOCALE;
  }
};
