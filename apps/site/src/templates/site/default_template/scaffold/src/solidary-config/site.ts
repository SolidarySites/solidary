import { z } from "astro:content";

export const pageSchema = z.object({
  title: z.string(),
  navLabel: z.string(),
  description: z.string().optional(),
  javascript: z.string().optional(),
  showInNav: z.boolean(),
  navOrder: z.number().int()
});

export type PageFrontmatter = z.infer<typeof pageSchema>;

export type SolidaryFrontmatter = {
  title: string;
  description: string;
  url: string;
  ogImage?: string;
  features?: SiteFeatures;
  robots: string;
};

export type SiteFeatures = {
  dynamicImageLoading: boolean;
};

export type HeaderFrontmatter = {
  disabled: boolean;
  fixed: boolean;
  brandText: string;
  disableBrand: boolean;
};

export type FooterModuleAlignment = "left" | "center" | "right";

export type FooterModule = {
  content: string;
  alignment: FooterModuleAlignment;
};

export type FooterFrontmatter = {
  disabled: boolean;
  fixed: boolean;
  modules: FooterModule[];
};

export const DEFAULT_SEO_LOCALE = "en-US";
export const DEFAULT_SITE_FEATURES: SiteFeatures = {
  dynamicImageLoading: true
};

export type SeoFrontmatter = {
  headHtml: string;
  locale: string;
  twitter: boolean;
  openGraph: boolean;
  structuredData: boolean;
  indexFollow: boolean;
};

export type SiteContentGraph = {
  solidary: SolidaryFrontmatter;
  header: HeaderFrontmatter;
  footer: FooterFrontmatter;
  seo: SeoFrontmatter;
  pages: PageFrontmatter[];
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const readString = (value: unknown, fallback = "") => (typeof value === "string" ? value : fallback);
const readBoolean = (value: unknown, fallback = false) =>
  typeof value === "boolean" ? value : fallback;

const isFooterModuleAlignment = (value: unknown): value is FooterModuleAlignment =>
  value === "left" || value === "center" || value === "right";

export const normalizeSeoLocale = (
  value: unknown,
  fallback = DEFAULT_SEO_LOCALE
): string => {
  const text = readString(value, fallback).trim() || fallback;
  try {
    const [canonicalLocale] = Intl.getCanonicalLocales(text.replaceAll("_", "-"));
    return canonicalLocale || fallback;
  } catch {
    return fallback;
  }
};

export const toOpenGraphLocale = (value: string): string =>
  normalizeSeoLocale(value).replaceAll("-", "_");

export const parseSiteFeatures = (value: unknown): SiteFeatures => {
  const record = asRecord(value);
  return {
    dynamicImageLoading: readBoolean(
      record.dynamicImageLoading,
      DEFAULT_SITE_FEATURES.dynamicImageLoading
    )
  };
};

export const parseSolidaryFrontmatter = (value: unknown): SolidaryFrontmatter => {
  const record = asRecord(value);
  const robots = readString(record.robots, "index,follow");
  return {
    title: readString(record.title),
    description: readString(record.description),
    url: readString(record.url),
    ogImage: readString(record.ogImage) || undefined,
    features: parseSiteFeatures(record.features),
    robots
  };
};

export const parseHeaderFrontmatter = (value: unknown): HeaderFrontmatter => {
  const record = asRecord(value);
  return {
    disabled: readBoolean(record.disabled),
    fixed: readBoolean(record.fixed),
    brandText: readString(record.brandText),
    disableBrand: readBoolean(record.disableBrand)
  };
};

export const parseFooterFrontmatter = (value: unknown): FooterFrontmatter => {
  const record = asRecord(value);
  const modules = Array.isArray(record.modules)
    ? record.modules
        .map((entry) => {
          const moduleRecord = asRecord(entry);
          const alignment = isFooterModuleAlignment(moduleRecord.alignment)
            ? moduleRecord.alignment
            : "left";
          return {
            content: readString(moduleRecord.content),
            alignment
          };
        })
        .slice(0, 3)
    : [];

  return {
    disabled: readBoolean(record.disabled),
    fixed: readBoolean(record.fixed),
    modules
  };
};

export const parseSeoFrontmatter = (value: unknown): SeoFrontmatter => {
  const record = asRecord(value);
  return {
    headHtml: readString(record.headHtml),
    locale: normalizeSeoLocale(record.locale),
    twitter: readBoolean(record.twitter, true),
    openGraph: readBoolean(record.openGraph, true),
    structuredData: readBoolean(record.structuredData, true),
    indexFollow: readBoolean(record.indexFollow, true)
  };
};
