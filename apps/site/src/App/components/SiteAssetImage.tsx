import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ImageLoadSpinner } from "./ImageLoadSpinner";
import { EXTERNAL_IMAGE_SKIP_ATTR } from "../lib/external-image-loading";
import { IMAGE_LOAD_SPINNER_HOST_CLASS } from "../lib/image-load-spinner";
import { shouldLoadFullSiteAssetImage } from "../lib/site-asset-image";
import { resolveSitePrimaryImageUrl } from "../lib/site-image-url";

type SiteAssetImageProps = {
  siteUrl: string;
  thumbnailUrl: string;
  alt: string;
  containerClassName: string;
  imageClassName: string;
  placeholderClassName: string;
  placeholderContent: ReactNode;
  loading?: "eager" | "lazy";
};

const thumbLoadingStyle: CSSProperties = {
  filter: "blur(14px)",
  transform: "scale(1.04)",
  transformOrigin: "center center",
  transition: "filter 180ms ease, opacity 180ms ease, transform 180ms ease"
};

const thumbLoadedStyle: CSSProperties = {
  transition: "filter 180ms ease, opacity 180ms ease, transform 180ms ease"
};

const fullImageStyle = (isLoaded: boolean): CSSProperties => ({
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  opacity: isLoaded ? 1 : 0,
  transition: "opacity 180ms ease",
  border: "none",
  background: "transparent"
});

export function SiteAssetImage({
  siteUrl,
  thumbnailUrl,
  alt,
  containerClassName,
  imageClassName,
  placeholderClassName,
  placeholderContent,
  loading = "lazy"
}: SiteAssetImageProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [displaySize, setDisplaySize] = useState({ width: 0, height: 0 });
  const [thumbLoaded, setThumbLoaded] = useState(false);
  const [thumbError, setThumbError] = useState(false);
  const [fullLoaded, setFullLoaded] = useState(false);
  const [fullError, setFullError] = useState(false);

  const normalizedThumbnailUrl = thumbnailUrl.trim();
  const fullImageUrl = useMemo(() => resolveSitePrimaryImageUrl(siteUrl).trim(), [siteUrl]);
  const hasThumbnail = Boolean(normalizedThumbnailUrl) && !thumbError;
  const shouldLoadFull =
    Boolean(fullImageUrl) &&
    fullImageUrl !== normalizedThumbnailUrl &&
    (!hasThumbnail || shouldLoadFullSiteAssetImage(displaySize));
  const shouldRenderFull =
    Boolean(fullImageUrl) &&
    !fullError &&
    (!hasThumbnail || (shouldLoadFull && (thumbLoaded || thumbError)));
  const shouldBlurThumb = shouldRenderFull && !fullLoaded && !thumbError;
  const canRenderAnyImage = hasThumbnail || Boolean(fullImageUrl);
  const showSpinner =
    (hasThumbnail && !thumbLoaded && !thumbError) ||
    (!hasThumbnail && Boolean(fullImageUrl) && !fullLoaded && !fullError) ||
    (thumbError && shouldLoadFull && !fullLoaded && !fullError);

  useEffect(() => {
    setThumbLoaded(false);
    setThumbError(false);
    setFullLoaded(false);
    setFullError(false);
  }, [normalizedThumbnailUrl, fullImageUrl]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const syncDisplaySize = () => {
      const rect = container.getBoundingClientRect();
      setDisplaySize({
        width: rect.width,
        height: rect.height
      });
    };

    syncDisplaySize();

    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      syncDisplaySize();
    });

    observer.observe(container);
    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={`${containerClassName} ${IMAGE_LOAD_SPINNER_HOST_CLASS}`.trim()}
      aria-hidden={!canRenderAnyImage}
      style={{ position: "relative", overflow: "hidden" }}
    >
      {showSpinner && <ImageLoadSpinner />}
      {hasThumbnail ? (
        <img
          {...{ [EXTERNAL_IMAGE_SKIP_ATTR]: "true" }}
          className={imageClassName}
          src={normalizedThumbnailUrl}
          alt={shouldRenderFull ? "" : alt}
          aria-hidden={shouldRenderFull ? "true" : undefined}
          loading={loading}
          decoding="async"
          onLoad={() => setThumbLoaded(true)}
          onError={() => setThumbError(true)}
          style={
            shouldBlurThumb
              ? thumbLoadingStyle
              : fullLoaded
                ? { ...thumbLoadedStyle, opacity: 0 }
                : thumbLoadedStyle
          }
        />
      ) : (
        <div className={placeholderClassName}>{placeholderContent}</div>
      )}

      {shouldRenderFull && (
        <img
          {...{ [EXTERNAL_IMAGE_SKIP_ATTR]: "true" }}
          className={imageClassName}
          src={fullImageUrl}
          alt={alt}
          loading={loading}
          decoding="async"
          onLoad={() => setFullLoaded(true)}
          onError={() => setFullError(true)}
          style={fullImageStyle(fullLoaded)}
        />
      )}
    </div>
  );
}
