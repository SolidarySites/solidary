import { normalizeSiteImagePathForStorage } from "../../../../../lib/site-image-url";
import { DEFAULT_OG_IMAGE_URL, SITE_IMAGE_PUBLIC_PATH } from "./constants";

const OG_IMAGE_PATH_SEGMENT = "/solidary-media/images/og/";

export const resolveDraftSiteImagePath = ({
  siteUrl,
  siteImageSelected,
  imageUrl
}: {
  siteUrl: string;
  siteImageSelected: boolean;
  imageUrl: string;
}) => {
  if (siteImageSelected) {
    return SITE_IMAGE_PUBLIC_PATH;
  }

  return normalizeSiteImagePathForStorage({
    siteUrl,
    imageUrl,
    fallbackPath: DEFAULT_OG_IMAGE_URL
  });
};

export const resolveSettingsOgImagePath = ({
  siteUrl,
  imageUrl
}: {
  siteUrl: string;
  imageUrl: string;
}) => {
  const normalizedPath = normalizeSiteImagePathForStorage({
    siteUrl,
    imageUrl,
    fallbackPath: DEFAULT_OG_IMAGE_URL
  });

  return normalizedPath.includes(OG_IMAGE_PATH_SEGMENT) ? normalizedPath : DEFAULT_OG_IMAGE_URL;
};
