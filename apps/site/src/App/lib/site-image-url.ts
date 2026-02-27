const trimSlashes = (value: string) => value.replace(/^\/+|\/+$/g, "");

const THUMB_ASSET_PATH = "/solidary-media/images/site-image_thumb.jpg";
const SITE_IMAGE_PATH_FALLBACK = "/solidary-media/images/og/og-home.jpg";

const normalizePathLikeValue = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return "";

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      return new URL(trimmed).pathname || "";
    } catch {
      return "";
    }
  }

  if (trimmed.startsWith("//")) {
    try {
      return new URL(`https:${trimmed}`).pathname || "";
    } catch {
      return "";
    }
  }

  const withoutQuery = trimmed.split("#")[0]?.split("?")[0] ?? "";
  const stripped = withoutQuery.replace(/^\.\//, "").trim();
  if (!stripped) return "";
  const prefixed = stripped.startsWith("/") ? stripped : `/${stripped}`;
  return prefixed.replace(/\/{2,}/g, "/");
};

const stripSiteBasePath = (siteUrl: string, path: string) => {
  const normalizedSiteUrl = siteUrl.trim();
  const normalizedPath = path.trim();
  if (!normalizedSiteUrl || !normalizedPath) return normalizedPath;

  try {
    const site = new URL(normalizedSiteUrl);
    const basePath = `/${trimSlashes(site.pathname)}`;
    if (basePath === "/" || !basePath) return normalizedPath;
    if (normalizedPath === basePath) return "/";
    if (normalizedPath.startsWith(`${basePath}/`)) {
      const trimmed = normalizedPath.slice(basePath.length);
      return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
    }
    return normalizedPath;
  } catch {
    return normalizedPath;
  }
};

const resolveSiteScopedPath = (siteUrl: string, assetPath: string): string => {
  const normalizedSiteUrl = siteUrl.trim();
  const normalizedAssetPath = assetPath.trim();
  if (!normalizedSiteUrl || !normalizedAssetPath) {
    return "";
  }

  try {
    const site = new URL(normalizedSiteUrl);
    const siteBasePath = trimSlashes(site.pathname);
    const normalizedPath = trimSlashes(normalizedAssetPath.replace(/^\.\//, ""));

    if (!normalizedPath) {
      return "";
    }

    if (siteBasePath && (normalizedPath === siteBasePath || normalizedPath.startsWith(`${siteBasePath}/`))) {
      return `${site.origin}/${normalizedPath}`;
    }

    if (siteBasePath) {
      return `${site.origin}/${siteBasePath}/${normalizedPath}`;
    }

    return `${site.origin}/${normalizedPath}`;
  } catch {
    return "";
  }
};

export const resolveSiteImageUrl = (siteUrl: string, imageUrl: string) => {
  const normalizedImageUrl = imageUrl.trim();
  if (!normalizedImageUrl) {
    return "";
  }

  if (/^https?:\/\//i.test(normalizedImageUrl)) {
    return normalizedImageUrl;
  }

  return resolveSiteScopedPath(siteUrl, normalizedImageUrl) || normalizedImageUrl;
};

export const normalizeSiteImagePathForStorage = ({
  siteUrl,
  imageUrl,
  fallbackPath = SITE_IMAGE_PATH_FALLBACK
}: {
  siteUrl: string;
  imageUrl: string;
  fallbackPath?: string;
}) => {
  const fallbackNormalized = normalizePathLikeValue(fallbackPath);
  const normalizedImageUrl = imageUrl.trim();
  if (!normalizedImageUrl) {
    return fallbackNormalized;
  }

  const lowered = normalizedImageUrl.toLowerCase();
  if (lowered.startsWith("blob:") || lowered.startsWith("data:")) {
    return fallbackNormalized;
  }

  const parsedPath = normalizePathLikeValue(normalizedImageUrl);
  if (!parsedPath) {
    return fallbackNormalized;
  }

  return stripSiteBasePath(siteUrl, parsedPath) || fallbackNormalized;
};

export const resolveSiteThumbnailUrl = ({
  siteUrl,
  fallbackImageUrl
}: {
  siteUrl: string;
  fallbackImageUrl: string;
}) => {
  const thumbnailUrl = resolveSiteScopedPath(siteUrl, THUMB_ASSET_PATH);
  if (thumbnailUrl) {
    return thumbnailUrl;
  }

  return resolveSiteImageUrl(siteUrl, fallbackImageUrl);
};
