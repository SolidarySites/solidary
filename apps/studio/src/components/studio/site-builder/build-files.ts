import { buildPageMarkdown, buildSiteTs } from "../../../studio/astro";
import type { RepoFileSet } from "../../../studio/types";
import { FILE_KEYS, PAGE_PATH_PREFIX } from "./constants";
import type { BuilderPage, FooterOptions, HeaderOptions } from "./types";
import { getPageSafeSlug } from "./utils";

type SiteSettingsInput = {
  siteTitle: string;
  siteDescription: string;
  siteUrl: string;
  header: HeaderOptions;
  footer: FooterOptions;
};

const footerModuleAlignmentFallback: Array<"left" | "center" | "right"> = [
  "left",
  "center",
  "right"
];
const SOLIDARY_MEDIA_UPLOADS_PATH_PREFIX = "/solidary-media/images/uploads/";
const LEGACY_UPLOADS_PATH_PREFIX = "/images/uploads/";

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
  if (!basePath || (!body.includes(SOLIDARY_MEDIA_UPLOADS_PATH_PREFIX) && !body.includes(LEGACY_UPLOADS_PATH_PREFIX))) {
    return body;
  }

  return body.replace(/((?:src|href)\s*=\s*["'])([^"']+)(["'])/gi, (_match, prefix, value, suffix) => {
    if (typeof value !== "string") return `${prefix}${value}${suffix}`;
    if (value.startsWith(`${basePath}${SOLIDARY_MEDIA_UPLOADS_PATH_PREFIX}`)) return `${prefix}${value}${suffix}`;
    if (value.startsWith(`${basePath}${LEGACY_UPLOADS_PATH_PREFIX}`)) return `${prefix}${value}${suffix}`;
    if (!value.startsWith(SOLIDARY_MEDIA_UPLOADS_PATH_PREFIX) && !value.startsWith(LEGACY_UPLOADS_PATH_PREFIX)) {
      return `${prefix}${value}${suffix}`;
    }
    return `${prefix}${basePath}${value}${suffix}`;
  });
};

export const buildSettingsPayload = (
  input: SiteSettingsInput,
  imageUrl: string,
  urlOverride?: string
) => ({
  title: input.siteTitle.trim(),
  description: input.siteDescription.trim(),
  siteUrl: (urlOverride ?? input.siteUrl).trim(),
  ogImage: imageUrl,
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
});

type BuildSolidaryFileInput = {
  templateSolidary: string;
  siteId: string;
  imageUrl: string;
  settingsInput: SiteSettingsInput;
  urlOverride?: string;
};

export const buildSolidaryFile = ({
  templateSolidary,
  siteId,
  imageUrl,
  settingsInput,
  urlOverride
}: BuildSolidaryFileInput) => {
  const settings = buildSettingsPayload(settingsInput, imageUrl, urlOverride);
  return templateSolidary
    .replaceAll("{{SITE_ID}}", siteId)
    .replaceAll("{{TITLE}}", settings.title)
    .replaceAll("{{DESCRIPTION}}", settings.description)
    .replaceAll("{{SITE_URL}}", settings.siteUrl)
    .replaceAll("{{IMAGE_URL}}", imageUrl);
};

type BuildFilesInput = {
  siteId: string;
  imageUrl: string;
  settingsInput: SiteSettingsInput;
  tokensCss: string;
  templateSolidary: string;
  pages: BuilderPage[];
  defaultHomeContent: string;
  urlOverride?: string;
};

export const buildFiles = ({
  siteId,
  imageUrl,
  settingsInput,
  tokensCss,
  templateSolidary,
  pages,
  defaultHomeContent,
  urlOverride
}: BuildFilesInput) => {
  const settings = buildSettingsPayload(settingsInput, imageUrl, urlOverride);
  const publishBasePath = getBasePathFromSiteUrl(settings.siteUrl);
  const files: RepoFileSet = {
    [FILE_KEYS.site]: buildSiteTs(settings),
    [FILE_KEYS.tokens]: tokensCss,
    [FILE_KEYS.solidary]: buildSolidaryFile({
      templateSolidary,
      siteId,
      imageUrl,
      settingsInput,
      urlOverride
    })
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
