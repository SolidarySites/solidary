import { buildPageMarkdown, buildSiteTs } from "../../../studio/astro";
import type { RepoFileSet } from "../../../studio/types";
import { FILE_KEYS, PAGE_PATH_PREFIX } from "./constants";
import type { BuilderPage } from "./types";
import { getPageSafeSlug } from "./utils";

type SiteSettingsInput = {
  siteTitle: string;
  siteDescription: string;
  siteUrl: string;
  siteLocale: string;
  authorName: string;
  authorEmail: string;
  authorUrl: string;
};

export const buildSettingsPayload = (
  input: SiteSettingsInput,
  imageUrl: string,
  urlOverride?: string
) => ({
  title: input.siteTitle.trim(),
  tagline: input.siteTitle.trim(),
  description: input.siteDescription.trim(),
  siteUrl: (urlOverride ?? input.siteUrl).trim(),
  locale: input.siteLocale.trim() || "en",
  author: {
    name: input.authorName.trim() || "",
    email: input.authorEmail.trim() || "",
    url: input.authorUrl.trim() || ""
  },
  ogImage: imageUrl
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
  headerTemplate: string;
  indexTemplate: string;
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
  headerTemplate,
  indexTemplate,
  templateSolidary,
  pages,
  defaultHomeContent,
  urlOverride
}: BuildFilesInput) => {
  const settings = buildSettingsPayload(settingsInput, imageUrl, urlOverride);
  const files: RepoFileSet = {
    [FILE_KEYS.site]: buildSiteTs(settings),
    [FILE_KEYS.tokens]: tokensCss,
    [FILE_KEYS.header]: headerTemplate,
    [FILE_KEYS.index]: indexTemplate,
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
    const body = page.isHome && !page.body?.trim() ? defaultHomeContent : page.body ?? "";
    files[`${PAGE_PATH_PREFIX}${safeSlug}.md`] = buildPageMarkdown({
      ...page,
      slug: safeSlug,
      body
    });
  });

  return files;
};
