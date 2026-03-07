import { DEFAULT_SEO_LOCALE, normalizeSeoLocale } from "../../../../../features/site-draft/seo";

const SEO_LOCALE_CODES = [
  "af-ZA",
  "am-ET",
  "ar-AE",
  "ar-EG",
  "ar-JO",
  "ar-MA",
  "ar-QA",
  "ar-SA",
  "be-BY",
  "bg-BG",
  "ca-AD",
  "ca-ES",
  "ca-FR",
  "ca-IT",
  "cs-CZ",
  "da-DK",
  "de-AT",
  "de-CH",
  "de-DE",
  "el-GR",
  "en-AU",
  "en-CA",
  "en-GB",
  "en-HK",
  "en-IE",
  "en-IN",
  "en-NZ",
  "en-PH",
  "en-SG",
  "en-US",
  "en-ZA",
  "es-AR",
  "es-CR",
  "es-ES",
  "es-MX",
  "et-EE",
  "eu-ES",
  "fa-AF",
  "fa-IR",
  "fi-FI",
  "fr-BE",
  "fr-CA",
  "fr-CH",
  "fr-FR",
  "ga-IE",
  "he-IL",
  "hi-IN",
  "hr-HR",
  "hu-HU",
  "hy-AM",
  "is-IS",
  "it-CH",
  "it-IT",
  "ja-JP",
  "kk-KZ",
  "ko-KR",
  "lt-LT",
  "lv-LV",
  "mn-MN",
  "nb-NO",
  "nl-BE",
  "nl-NL",
  "nn-NO",
  "no-NO",
  "pl-PL",
  "pt-BR",
  "pt-PT",
  "ro-RO",
  "ru-RU",
  "se-FI",
  "se-NO",
  "sk-SK",
  "sl-SI",
  "sr-RS",
  "sv-FI",
  "sv-SE",
  "tr-TR",
  "uk-UA",
  "zh-CN",
  "zh-HK",
  "zh-TW"
] as const;

const displayLocale =
  typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().locale || "en" : "en";
const languageDisplayNames =
  typeof Intl !== "undefined" && typeof Intl.DisplayNames === "function"
    ? new Intl.DisplayNames([displayLocale], { type: "language" })
    : null;

const getLocaleLabel = (locale: string) => languageDisplayNames?.of(locale) ?? locale;

export const SEO_LOCALE_OPTIONS = [...new Set([DEFAULT_SEO_LOCALE, ...SEO_LOCALE_CODES])]
  .map((locale) => normalizeSeoLocale(locale))
  .filter((locale, index, allLocales) => allLocales.indexOf(locale) === index)
  .map((locale) => ({
    value: locale,
    label: getLocaleLabel(locale)
  }))
  .sort((left, right) => left.label.localeCompare(right.label) || left.value.localeCompare(right.value));
