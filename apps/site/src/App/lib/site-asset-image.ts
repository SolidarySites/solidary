export const SITE_ASSET_FULL_IMAGE_THRESHOLD_PX = 720;

export const shouldLoadFullSiteAssetImage = ({
  width,
  height
}: {
  width: number;
  height: number;
}) => {
  const safeWidth = Number.isFinite(width) && width > 0 ? width : 0;
  const safeHeight = Number.isFinite(height) && height > 0 ? height : 0;
  return (
    safeWidth > SITE_ASSET_FULL_IMAGE_THRESHOLD_PX ||
    safeHeight > SITE_ASSET_FULL_IMAGE_THRESHOLD_PX
  );
};
