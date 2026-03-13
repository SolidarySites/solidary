import { SiteAssetImage } from "../../../../../components/SiteAssetImage";
import { isExternalImageSource } from "../../../../../lib/external-image-loading";

type SiteSettingsImagePreviewProps = {
  siteUrl: string;
  src: string;
  alt: string;
};

export const SiteSettingsImagePreview = ({
  siteUrl,
  src,
  alt
}: SiteSettingsImagePreviewProps) => {
  const normalizedSrc = src.trim();

  if (!normalizedSrc) {
    return null;
  }

  return (
    <SiteAssetImage
      siteUrl={isExternalImageSource(normalizedSrc) ? siteUrl : ""}
      thumbnailUrl={normalizedSrc}
      alt={alt}
      containerClassName="preview-image-shell"
      imageClassName="preview-image"
      placeholderClassName="preview-image-placeholder"
      placeholderContent="Preview unavailable"
      loading="eager"
    />
  );
};
