import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode
} from "react";
import { ImageLoadSpinner } from "./ImageLoadSpinner";
import { EXTERNAL_IMAGE_SKIP_ATTR } from "../lib/external-image-loading";
import { getImageElementLoadState } from "../lib/image-element-load-state";
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
  const thumbnailImageRef = useRef<HTMLImageElement | null>(null);
  const fullImageRef = useRef<HTMLImageElement | null>(null);
  const [displaySize, setDisplaySize] = useState({ width: 0, height: 0 });
  const [thumbLoadedSrc, setThumbLoadedSrc] = useState("");
  const [thumbErrorSrc, setThumbErrorSrc] = useState("");
  const [fullLoadedSrc, setFullLoadedSrc] = useState("");
  const [fullErrorSrc, setFullErrorSrc] = useState("");

  const normalizedThumbnailUrl = thumbnailUrl.trim();
  const fullImageUrl = useMemo(() => resolveSitePrimaryImageUrl(siteUrl).trim(), [siteUrl]);
  const thumbLoaded = thumbLoadedSrc === normalizedThumbnailUrl;
  const thumbError = thumbErrorSrc === normalizedThumbnailUrl;
  const fullLoaded = fullLoadedSrc === fullImageUrl;
  const fullError = fullErrorSrc === fullImageUrl;
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

  const syncImageState = useCallback(
    (kind: "thumb" | "full", node: HTMLImageElement | null) => {
      const state = getImageElementLoadState(node);
      const source = kind === "thumb" ? normalizedThumbnailUrl : fullImageUrl;
      if (!source) {
        return;
      }
      if (state === "loaded") {
        if (kind === "thumb") {
          setThumbLoadedSrc(source);
        } else {
          setFullLoadedSrc(source);
        }
      } else if (state === "error") {
        if (kind === "thumb") {
          setThumbErrorSrc(source);
        } else {
          setFullErrorSrc(source);
        }
      }
    },
    [fullImageUrl, normalizedThumbnailUrl]
  );

  const setThumbnailImageNode = useCallback(
    (node: HTMLImageElement | null) => {
      thumbnailImageRef.current = node;
      syncImageState("thumb", node);
    },
    [syncImageState]
  );

  const setFullImageNode = useCallback(
    (node: HTMLImageElement | null) => {
      fullImageRef.current = node;
      syncImageState("full", node);
    },
    [syncImageState]
  );

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
          ref={setThumbnailImageNode}
          {...{ [EXTERNAL_IMAGE_SKIP_ATTR]: "true" }}
          className={imageClassName}
          src={normalizedThumbnailUrl}
          alt={shouldRenderFull ? "" : alt}
          aria-hidden={shouldRenderFull ? "true" : undefined}
          loading={loading}
          decoding="async"
          onLoad={() => setThumbLoadedSrc(normalizedThumbnailUrl)}
          onError={() => setThumbErrorSrc(normalizedThumbnailUrl)}
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
          ref={setFullImageNode}
          {...{ [EXTERNAL_IMAGE_SKIP_ATTR]: "true" }}
          className={imageClassName}
          src={fullImageUrl}
          alt={alt}
          loading={loading}
          decoding="async"
          onLoad={() => setFullLoadedSrc(fullImageUrl)}
          onError={() => setFullErrorSrc(fullImageUrl)}
          style={fullImageStyle(fullLoaded)}
        />
      )}
    </div>
  );
}
