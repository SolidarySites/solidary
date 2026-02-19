import type { AstroSettings } from "../../../../features/site-draft/types";

export const FILE_KEYS = {
  solidary: "public/.well-known/solidary-links.json"
} as const;

export const SOLIDARY_MEDIA_IMAGE_ROOT = "public/solidary-media/images";
export const DEFAULT_OG_IMAGE_PATH = `${SOLIDARY_MEDIA_IMAGE_ROOT}/og/og-default.jpg`;
export const DEFAULT_OG_IMAGE_URL = `/${DEFAULT_OG_IMAGE_PATH.replace(/^public\//, "")}`;

export const normalizeSiteUrl = (value: string) => value.trim().replace(/\/+$/, "");

export const resolveSiteUrlFromRepo = ({
  ownerLogin,
  repoName
}: {
  ownerLogin: string;
  repoName: string;
}) => {
  const pagesRootUrl = `https://${ownerLogin}.github.io`;
  const isUserSite = repoName.toLowerCase() === `${ownerLogin.toLowerCase()}.github.io`;
  const baseUrl = isUserSite ? "" : `/${repoName}`;
  return normalizeSiteUrl(isUserSite ? pagesRootUrl : `${pagesRootUrl}${baseUrl}`);
};

export const buildSettingsPayload = ({
  siteTitle,
  siteDescription,
  siteUrl,
  imageUrl,
  urlOverride
}: {
  siteTitle: string;
  siteDescription: string;
  siteUrl: string;
  imageUrl: string;
  urlOverride?: string;
}): AstroSettings => ({
  title: siteTitle.trim(),
  description: siteDescription.trim(),
  siteUrl: urlOverride || siteUrl,
  ogImage: imageUrl,
  header: {
    disabled: false,
    fixed: false,
    brandText: siteTitle.trim(),
    disableBrand: false
  },
  footer: {
    disabled: false,
    fixed: false,
    modules: [
      { content: "%copyright%", alignment: "left" },
      { content: "", alignment: "center" },
      { content: "", alignment: "right" }
    ]
  }
});

export const buildSolidaryFile = ({
  templateSolidary,
  siteId,
  siteTitle,
  siteDescription,
  siteUrl,
  imageUrl,
  urlOverride
}: {
  templateSolidary: string;
  siteId: string;
  siteTitle: string;
  siteDescription: string;
  siteUrl: string;
  imageUrl: string;
  urlOverride?: string;
}) => {
  const settings = buildSettingsPayload({
    siteTitle,
    siteDescription,
    siteUrl,
    imageUrl,
    urlOverride
  });
  return templateSolidary
    .replaceAll("{{SITE_ID}}", siteId)
    .replaceAll("{{TITLE}}", settings.title)
    .replaceAll("{{DESCRIPTION}}", settings.description)
    .replaceAll("{{SITE_URL}}", settings.siteUrl)
    .replaceAll("{{IMAGE_URL}}", imageUrl);
};
