import {
  buildFooterMarkdown,
  buildHeaderMarkdown,
  buildPageMarkdown,
  buildSeoMarkdown,
  buildSolidaryMarkdown
} from "../../../../../features/site-draft/services/astro-builders";
import { buildSolidaryLinksFile } from "../../../../../features/site-draft/services/solidary-links";
import {
  buildSolidaryMetadataFile,
  parseSolidaryJson,
  resolveSolidaryMetadataImages
} from "../../../../../features/site-draft/services/solidary";
import { DEFAULT_SEO_SETTINGS, normalizeSeoLocale } from "../../../../../features/site-draft/seo";
import type { RepoFileSet } from "../../../../../features/site-draft/types";
import { RUNTIME_TEMPLATE_FILES } from "../../../../../../templates/site";
import {
  DEFAULT_OG_IMAGE_URL,
  FILE_KEYS,
  PAGE_PATH_PREFIX,
  TEMPLATE_RUNTIME_FILE_PATHS
} from "./constants";
import { resolveSettingsOgImagePath } from "./site-settings-images";
import { combineTokensAndStructureCss, toggleTokensImportInGlobalCss } from "./style-editor";
import type { BuilderPage, BuilderStyleSettings, FooterOptions, HeaderOptions } from "./types";
import { getPageSafeSlug } from "./utils";

type SiteSettingsInput = {
  siteTitle: string;
  siteDescription: string;
  siteUrl: string;
  headHtml?: string;
  locale?: string;
  twitter?: boolean;
  openGraph?: boolean;
  structuredData?: boolean;
  indexFollow?: boolean;
  header: HeaderOptions;
  footer: FooterOptions;
};

const footerModuleAlignmentFallback: Array<"left" | "center" | "right"> = [
  "left",
  "center",
  "right"
];
const SOLIDARY_MEDIA_PAGE_IMAGES_PATH_PREFIX = "/solidary-media/images/pages/";

const normalizeFooterModules = (modules: FooterOptions["modules"]) => {
  const normalized = modules
    .slice(0, 3)
    .map((module, index) => ({
      content: typeof module?.content === "string" ? module.content : "",
      alignment:
        module?.alignment === "left" || module?.alignment === "center" || module?.alignment === "right"
          ? module.alignment
          : (footerModuleAlignmentFallback[index] ?? "left")
    }));
  while (normalized.length < 3) {
    const alignment = footerModuleAlignmentFallback[normalized.length] ?? "left";
    normalized.push({
      content: "",
      alignment
    });
  }
  return normalized;
};

const getBasePathFromSiteUrl = (siteUrl: string) => {
  const trimmed = siteUrl.trim();
  if (!trimmed) return "";

  try {
    const pathname = new URL(trimmed).pathname.trim();
    if (!pathname || pathname === "/") return "";
    return `/${pathname.replace(/^\/+|\/+$/g, "")}`;
  } catch {
    return "";
  }
};

const rewriteUploadsForBasePath = (body: string, basePath: string) => {
  if (!basePath || !body.includes(SOLIDARY_MEDIA_PAGE_IMAGES_PATH_PREFIX)) {
    return body;
  }

  return body.replace(/((?:src|href)\s*=\s*["'])([^"']+)(["'])/gi, (_match, prefix, value, suffix) => {
    if (typeof value !== "string") return `${prefix}${value}${suffix}`;
    if (value.startsWith(`${basePath}${SOLIDARY_MEDIA_PAGE_IMAGES_PATH_PREFIX}`)) {
      return `${prefix}${value}${suffix}`;
    }
    if (!value.startsWith(SOLIDARY_MEDIA_PAGE_IMAGES_PATH_PREFIX)) {
      return `${prefix}${value}${suffix}`;
    }
    return `${prefix}${basePath}${value}${suffix}`;
  });
};

export const buildSettingsPayload = (
  input: SiteSettingsInput,
  imageUrl: string,
  urlOverride?: string
) => {
  const resolvedSiteUrl = (urlOverride ?? input.siteUrl).trim();

  return {
    title: input.siteTitle.trim(),
    description: input.siteDescription.trim(),
    siteUrl: resolvedSiteUrl,
    ogImage: resolveSettingsOgImagePath({
      siteUrl: resolvedSiteUrl,
      imageUrl: imageUrl.trim() || DEFAULT_OG_IMAGE_URL
    }),
    headHtml: typeof input.headHtml === "string" ? input.headHtml : "",
    locale: normalizeSeoLocale(input.locale),
    twitter: typeof input.twitter === "boolean" ? input.twitter : DEFAULT_SEO_SETTINGS.twitter,
    openGraph:
      typeof input.openGraph === "boolean" ? input.openGraph : DEFAULT_SEO_SETTINGS.openGraph,
    structuredData:
      typeof input.structuredData === "boolean"
        ? input.structuredData
        : DEFAULT_SEO_SETTINGS.structuredData,
    indexFollow:
      typeof input.indexFollow === "boolean"
        ? input.indexFollow
        : DEFAULT_SEO_SETTINGS.indexFollow,
    header: {
      disabled: input.header.disabled,
      fixed: input.header.fixed,
      brandText: input.header.brandText.trim() || input.siteTitle.trim(),
      disableBrand: input.header.disableBrand
    },
    footer: {
      disabled: input.footer.disabled,
      fixed: input.footer.fixed,
      modules: normalizeFooterModules(input.footer.modules)
    }
  };
};

type BuildSolidaryFileInput = {
  templateSolidary: string;
  templateSolidaryLinks: string;
  siteId: string;
  settingsInput: SiteSettingsInput;
  urlOverride?: string;
  hasSiteImage?: boolean;
  previousSolidaryRaw?: string;
  previousSolidaryLinksRaw?: string;
};

export type BuiltWellKnownFiles = {
  solidaryFile: string;
  solidaryLinksFile: string;
};

export const buildWellKnownFiles = ({
  templateSolidary,
  templateSolidaryLinks,
  siteId,
  settingsInput,
  urlOverride,
  hasSiteImage,
  previousSolidaryRaw,
  previousSolidaryLinksRaw
}: BuildSolidaryFileInput) => {
  const siteUrl = (urlOverride ?? settingsInput.siteUrl).trim();
  const previousSolidary = parseSolidaryJson(previousSolidaryRaw ?? "");
  const { siteImageUrl, siteImageThumbUrl } = resolveSolidaryMetadataImages({
    siteUrl,
    hasSiteImage: hasSiteImage ?? Boolean(previousSolidary?.site_image?.trim())
  });
  return {
    solidaryFile: buildSolidaryMetadataFile({
      templateSolidary,
      siteId,
      siteUrl,
      title: settingsInput.siteTitle,
      siteImageUrl,
      siteImageThumbUrl,
      description: settingsInput.siteDescription
    }),
    solidaryLinksFile: buildSolidaryLinksFile({
      templateSolidaryLinks,
      siteId,
      siteUrl,
      previousSolidaryLinksRaw
    })
  };
};

type BuildFilesInput = {
  siteId: string;
  ogImageUrl: string;
  settingsInput: SiteSettingsInput;
  styles: BuilderStyleSettings;
  templateSolidary: string;
  templateSolidaryLinks: string;
  pages: BuilderPage[];
  defaultHomeContent: string;
  urlOverride?: string;
  hasSiteImage?: boolean;
  previousSolidaryRaw?: string;
  previousSolidaryLinksRaw?: string;
};

export const buildFiles = ({
  siteId,
  ogImageUrl,
  settingsInput,
  styles,
  templateSolidary,
  templateSolidaryLinks,
  pages,
  defaultHomeContent,
  urlOverride,
  hasSiteImage,
  previousSolidaryRaw,
  previousSolidaryLinksRaw
}: BuildFilesInput) => {
  const settings = buildSettingsPayload(settingsInput, ogImageUrl, urlOverride);
  const publishBasePath = getBasePathFromSiteUrl(settings.siteUrl);
  const tokensCss = styles.tokensCss;
  const baseStructureCss = styles.baseStructureCss.trim();
  const structureCss =
    styles.styleMode === "advanced"
      ? styles.advancedStructureCss.trim() || combineTokensAndStructureCss(tokensCss, baseStructureCss)
      : baseStructureCss;
  const globalCss = toggleTokensImportInGlobalCss(styles.baseGlobalCss, styles.styleMode !== "advanced");
  const runtimeTemplateFiles: RepoFileSet = {};
  TEMPLATE_RUNTIME_FILE_PATHS.forEach((path) => {
    const content = RUNTIME_TEMPLATE_FILES[path];
    if (!content) return;
    runtimeTemplateFiles[path] = content;
  });
  const { solidaryFile, solidaryLinksFile } = buildWellKnownFiles({
    templateSolidary,
    templateSolidaryLinks,
    siteId,
    settingsInput,
    urlOverride,
    hasSiteImage,
    previousSolidaryRaw,
    previousSolidaryLinksRaw
  });

  const files: RepoFileSet = {
    ...runtimeTemplateFiles,
    [FILE_KEYS.solidaryContent]: buildSolidaryMarkdown(settings),
    [FILE_KEYS.headerContent]: buildHeaderMarkdown(settings),
    [FILE_KEYS.footerContent]: buildFooterMarkdown(settings),
    [FILE_KEYS.seoContent]: buildSeoMarkdown(settings),
    [FILE_KEYS.tokens]: tokensCss,
    [FILE_KEYS.globalStyles]: `${globalCss.trimEnd()}\n`,
    [FILE_KEYS.structureStyles]: `${structureCss.trimEnd()}\n`,
    [FILE_KEYS.solidary]: solidaryFile,
    [FILE_KEYS.solidaryLinks]: solidaryLinksFile
  };

  pages.forEach((page, index) => {
    const safeSlug = getPageSafeSlug(page, index);
    const baseBody = page.isHome && !page.body?.trim() ? defaultHomeContent : page.body ?? "";
    const body = rewriteUploadsForBasePath(baseBody, publishBasePath);
    files[`${PAGE_PATH_PREFIX}${safeSlug}.md`] = buildPageMarkdown({
      ...page,
      slug: safeSlug,
      navOrder: index,
      body
    });
  });

  return files;
};
