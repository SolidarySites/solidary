export type RepoFileSet = Record<string, string>;

export type AstroSiteFeatures = {
  dynamicImageLoading: boolean;
};

export const DEFAULT_ASTRO_SITE_FEATURES: AstroSiteFeatures = {
  dynamicImageLoading: true
};

export const normalizeAstroSiteFeatures = (
  value: Partial<AstroSiteFeatures> | null | undefined
): AstroSiteFeatures => ({
  dynamicImageLoading:
    typeof value?.dynamicImageLoading === "boolean"
      ? value.dynamicImageLoading
      : DEFAULT_ASTRO_SITE_FEATURES.dynamicImageLoading
});

export type AstroSeoSettings = {
  headHtml: string;
  locale: string;
  twitter: boolean;
  openGraph: boolean;
  structuredData: boolean;
  indexFollow: boolean;
};

export type AstroHeader = {
  disabled: boolean;
  fixed: boolean;
  brandText: string;
  disableBrand: boolean;
};

export type AstroFooter = {
  disabled: boolean;
  fixed: boolean;
  modules: Array<{
    content: string;
    alignment: "left" | "center" | "right";
  }>;
};

export type AstroSettings = {
  title: string;
  description: string;
  siteUrl: string;
  ogImage: string;
  features: AstroSiteFeatures;
  headHtml: string;
  locale: string;
  twitter: boolean;
  openGraph: boolean;
  structuredData: boolean;
  indexFollow: boolean;
  header: AstroHeader;
  footer: AstroFooter;
};

export type AstroPageDraft = {
  title: string;
  slug: string;
  body: string;
  javascript?: string;
  showInNav: boolean;
  navOrder?: number;
};
