import {
  buildFooterMarkdown,
  buildHeaderMarkdown,
  buildPageMarkdown,
  buildSolidaryMarkdown
} from "../../../../../features/site-draft/services/astro-builders";
import type { RepoFileSet } from "../../../../../features/site-draft/types";
import { RUNTIME_TEMPLATE_FILES } from "../../../../../../templates/astro/runtime-files";
import { FILE_KEYS, PAGE_PATH_PREFIX, TEMPLATE_RUNTIME_FILE_PATHS } from "./constants";
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
  previousSolidaryRaw?: string;
};

const parseSolidaryManifestObject = (raw: string): Record<string, unknown> | null => {
  if (!raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
};

export const buildSolidaryFile = ({
  templateSolidary,
  siteId,
  imageUrl,
  settingsInput,
  urlOverride,
  previousSolidaryRaw
}: BuildSolidaryFileInput) => {
  const settings = buildSettingsPayload(settingsInput, imageUrl, urlOverride);

  const templateRendered = templateSolidary
    .replaceAll("{{SITE_ID}}", siteId)
    .replaceAll("{{TITLE}}", settings.title)
    .replaceAll("{{DESCRIPTION}}", settings.description)
    .replaceAll("{{SITE_URL}}", settings.siteUrl)
    .replaceAll("{{IMAGE_URL}}", imageUrl);

  const baseManifest = parseSolidaryManifestObject(templateRendered) ?? {};
  const previousManifest = parseSolidaryManifestObject(previousSolidaryRaw ?? "");

  const metadataManifest = {
    ...baseManifest,
    protocol_version: "1.0",
    site_id: siteId,
    site_url: settings.siteUrl,
    title: settings.title,
    image_url: imageUrl,
    description: settings.description
  };

  const nextManifest =
    previousManifest && Object.keys(previousManifest).length
      ? {
          ...previousManifest,
          ...metadataManifest
        }
      : metadataManifest;

  return `${JSON.stringify(nextManifest, null, 2)}\n`;
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
  previousSolidaryRaw?: string;
};

export const buildFiles = ({
  siteId,
  imageUrl,
  settingsInput,
  tokensCss,
  templateSolidary,
  pages,
  defaultHomeContent,
  urlOverride,
  previousSolidaryRaw
}: BuildFilesInput) => {
  const settings = buildSettingsPayload(settingsInput, imageUrl, urlOverride);
  const publishBasePath = getBasePathFromSiteUrl(settings.siteUrl);
  const runtimeTemplateFiles: RepoFileSet = {};
  TEMPLATE_RUNTIME_FILE_PATHS.forEach((path) => {
    const content = RUNTIME_TEMPLATE_FILES[path];
    if (!content) return;
    runtimeTemplateFiles[path] = content;
  });

  const files: RepoFileSet = {
    ...runtimeTemplateFiles,
    [FILE_KEYS.solidaryContent]: buildSolidaryMarkdown(settings),
    [FILE_KEYS.headerContent]: buildHeaderMarkdown(settings),
    [FILE_KEYS.footerContent]: buildFooterMarkdown(settings),
    [FILE_KEYS.tokens]: tokensCss,
    [FILE_KEYS.solidary]: buildSolidaryFile({
      templateSolidary,
      siteId,
      imageUrl,
      settingsInput,
      urlOverride,
      previousSolidaryRaw
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
