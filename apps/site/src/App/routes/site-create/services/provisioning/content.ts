import {
  normalizeAstroSiteFeatures,
  type AstroSettings
} from "../../../../features/site-draft/types";
import {
  buildSolidaryLinksFile,
  type SolidaryLinksConnection
} from "../../../../features/site-draft/services/solidary-links";
import {
  buildSolidaryMetadataFile,
  resolveSolidaryMetadataImages
} from "../../../../features/site-draft/services/solidary";
import { DEFAULT_SEO_SETTINGS } from "../../../../features/site-draft/seo";
import { normalizeSiteUrl } from "../../../../lib/site-url";
import { normalizeSiteTitle } from "../../../../services/site-metadata";

export const FILE_KEYS = {
  solidary: "public/.well-known/solidary.json",
  solidaryLinks: "public/.well-known/solidary-links.json"
} as const;

export const SOLIDARY_MEDIA_IMAGE_ROOT = "public/solidary-media/images";
export const SITE_IMAGE_PATH = `${SOLIDARY_MEDIA_IMAGE_ROOT}/site-image.jpg`;
export const SITE_IMAGE_THUMB_PATH = `${SOLIDARY_MEDIA_IMAGE_ROOT}/site-image_thumb.jpg`;
export const DEFAULT_OG_IMAGE_PATH = `${SOLIDARY_MEDIA_IMAGE_ROOT}/og/og-home.jpg`;
export const DEFAULT_OG_IMAGE_URL = `/${DEFAULT_OG_IMAGE_PATH.replace(/^public\//, "")}`;

const normalizePublicAssetPath = (assetPath: string) =>
  `/${assetPath.trim().replace(/^public\//, "").replace(/^\/+/, "")}`;

export const resolveAbsoluteAssetUrl = ({
  siteUrl,
  assetPath
}: {
  siteUrl: string;
  assetPath: string;
}) => {
  const normalizedAssetPath = normalizePublicAssetPath(assetPath);

  try {
    const base = new URL(normalizeSiteUrl(siteUrl));
    const basePath = base.pathname.replace(/\/$/, "");
    base.pathname = `${basePath}${normalizedAssetPath}`.replace(/\/{2,}/g, "/");
    base.search = "";
    base.hash = "";
    return base.toString();
  } catch {
    return normalizedAssetPath;
  }
};

export const buildSettingsPayload = ({
  siteTitle,
  siteDescription,
  siteUrl,
  imageUrl,
  urlOverride,
  features
}: {
  siteTitle: string;
  siteDescription: string;
  siteUrl: string;
  imageUrl: string;
  urlOverride?: string;
  features?: AstroSettings["features"];
}): AstroSettings => {
  const normalizedTitle = normalizeSiteTitle(siteTitle);

  return {
  title: normalizedTitle,
  description: siteDescription.trim(),
  siteUrl: urlOverride || siteUrl,
  ogImage: imageUrl,
  features: normalizeAstroSiteFeatures(features),
  headHtml: "",
  locale: DEFAULT_SEO_SETTINGS.locale,
  twitter: DEFAULT_SEO_SETTINGS.twitter,
  openGraph: DEFAULT_SEO_SETTINGS.openGraph,
  structuredData: DEFAULT_SEO_SETTINGS.structuredData,
  indexFollow: DEFAULT_SEO_SETTINGS.indexFollow,
  header: {
    disabled: false,
    fixed: false,
    brandText: normalizedTitle,
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
  };
};

export const buildWellKnownFiles = ({
  templateSolidary,
  templateSolidaryLinks,
  siteId,
  siteTitle,
  siteDescription,
  siteUrl,
  hasSiteImage,
  urlOverride,
  connectionsOverride
}: {
  templateSolidary: string;
  templateSolidaryLinks: string;
  siteId: string;
  siteTitle: string;
  siteDescription: string;
  siteUrl: string;
  hasSiteImage: boolean;
  urlOverride?: string;
  connectionsOverride?: SolidaryLinksConnection[];
}) => {
  const settings = buildSettingsPayload({
    siteTitle,
    siteDescription,
    siteUrl,
    imageUrl: DEFAULT_OG_IMAGE_URL,
    urlOverride
  });
  const { siteImageUrl, siteImageThumbUrl } = resolveSolidaryMetadataImages({
    siteUrl: settings.siteUrl,
    hasSiteImage
  });
  return {
    solidaryFile: buildSolidaryMetadataFile({
      templateSolidary,
      siteId,
      siteUrl: settings.siteUrl,
      title: settings.title,
      siteImageUrl,
      siteImageThumbUrl,
      description: settings.description
    }),
    solidaryLinksFile: buildSolidaryLinksFile({
      templateSolidaryLinks,
      siteId,
      siteUrl: settings.siteUrl,
      connectionsOverride
    })
  };
};
