const trimSlashes = (value: string) => value.replace(/^\/+|\/+$/g, "");

const THUMB_ASSET_PATH = "/solidary-media/images/site-image_thumb.jpg";

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
