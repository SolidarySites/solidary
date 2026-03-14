import type { DraftImageAsset } from "../../services/types";
import {
  BUILDER_IMAGE_ASPECT_RATIO_ATTR,
  EXTERNAL_IMAGE_VARIANT_LARGE_ATTR,
  EXTERNAL_IMAGE_VARIANT_MEDIUM_ATTR,
  EXTERNAL_IMAGE_VARIANT_ORIGINAL_ATTR,
  EXTERNAL_IMAGE_VARIANT_SMALL_ATTR
} from "../../../../../../lib/external-image-loading";
import {
  normalizePublishedBaseUrl,
  normalizeSitePath,
  toPublishedUrl
} from "./content-utils";

type ManagedImageVariant = "original" | "large" | "medium" | "small";
type ManagedImageVariantSet = Partial<Record<ManagedImageVariant, DraftImageAsset>>;

const managedImageVariantAttrs = [
  EXTERNAL_IMAGE_VARIANT_SMALL_ATTR,
  EXTERNAL_IMAGE_VARIANT_MEDIUM_ATTR,
  EXTERNAL_IMAGE_VARIANT_LARGE_ATTR,
  EXTERNAL_IMAGE_VARIANT_ORIGINAL_ATTR
] as const;

export const managedImageSyncedAttrs = [...managedImageVariantAttrs, BUILDER_IMAGE_ASPECT_RATIO_ATTR] as const;

const managedImageVariantPattern = /^(.+_[a-f0-9]{10})_(original|large|medium|small)\.[^./?#]+$/i;

const stripHashAndSearch = (value: string) => {
  const withoutHash = value.split("#")[0] ?? value;
  return withoutHash.split("?")[0] ?? withoutHash;
};

const getManagedImageVariantDescriptor = (
  sitePath: string
): { variant: ManagedImageVariant; groupKey: string } | null => {
  const normalizedPath = normalizeSitePath(stripHashAndSearch(sitePath));
  const lastSlashIndex = normalizedPath.lastIndexOf("/");
  if (lastSlashIndex < 0) return null;
  const directory = normalizedPath.slice(0, lastSlashIndex);
  const filename = normalizedPath.slice(lastSlashIndex + 1);
  const match = filename.match(managedImageVariantPattern);
  if (!match) return null;
  const normalizedVariant = match[2]?.toLowerCase();
  if (
    normalizedVariant !== "original" &&
    normalizedVariant !== "large" &&
    normalizedVariant !== "medium" &&
    normalizedVariant !== "small"
  ) {
    return null;
  }
  const variant: ManagedImageVariant = normalizedVariant;
  return {
    variant,
    groupKey: `${directory}/${match[1]?.toLowerCase() ?? ""}`
  };
};

const getManagedImageVariantsForAsset = (
  image: DraftImageAsset | null,
  groupedVariants: Map<string, ManagedImageVariantSet>
) => {
  if (!image) return null;
  const descriptor = getManagedImageVariantDescriptor(image.sitePath);
  if (!descriptor) return null;

  const variants = groupedVariants.get(descriptor.groupKey);
  if (!variants) {
    return {
      [descriptor.variant]: image
    } satisfies ManagedImageVariantSet;
  }

  return {
    ...variants,
    [descriptor.variant]: variants[descriptor.variant] ?? image
  };
};

const setManagedImageVariantAttributes = (
  imageElement: Element,
  variants: ManagedImageVariantSet | null
) => {
  const smallSource = variants?.small?.publicUrl?.trim() ?? "";
  const mediumSource = variants?.medium?.publicUrl?.trim() ?? "";
  const largeSource = variants?.large?.publicUrl?.trim() ?? "";
  const originalSource = variants?.original?.publicUrl?.trim() ?? "";

  if (smallSource) {
    imageElement.setAttribute(EXTERNAL_IMAGE_VARIANT_SMALL_ATTR, smallSource);
  } else {
    imageElement.removeAttribute(EXTERNAL_IMAGE_VARIANT_SMALL_ATTR);
  }

  if (mediumSource) {
    imageElement.setAttribute(EXTERNAL_IMAGE_VARIANT_MEDIUM_ATTR, mediumSource);
  } else {
    imageElement.removeAttribute(EXTERNAL_IMAGE_VARIANT_MEDIUM_ATTR);
  }

  if (largeSource) {
    imageElement.setAttribute(EXTERNAL_IMAGE_VARIANT_LARGE_ATTR, largeSource);
  } else {
    imageElement.removeAttribute(EXTERNAL_IMAGE_VARIANT_LARGE_ATTR);
  }

  if (originalSource) {
    imageElement.setAttribute(EXTERNAL_IMAGE_VARIANT_ORIGINAL_ATTR, originalSource);
  } else {
    imageElement.removeAttribute(EXTERNAL_IMAGE_VARIANT_ORIGINAL_ATTR);
  }
};

export const parseInertHtmlTemplate = (html: string) => {
  const template = document.createElement("template");
  template.innerHTML = html;
  return template;
};

export const mapHtmlImageSources = (
  html: string,
  draftImages: DraftImageAsset[],
  publishedSiteBaseUrl: string | null,
  mode: "display" | "persist",
  enableManagedVariants = true
) => {
  const pageImagesPrefix = "/solidary-media/images/pages/";
  if (!html.trim()) return html;

  const bySitePath = new Map<string, DraftImageAsset>();
  const byPublicUrl = new Map<string, DraftImageAsset>();
  const groupedByVariantFamily = new Map<string, ManagedImageVariantSet>();
  draftImages.forEach((image) => {
    const sitePath = normalizeSitePath(image.sitePath);
    const publicUrl = image.publicUrl.trim();
    if (sitePath) bySitePath.set(sitePath, image);
    if (publicUrl) byPublicUrl.set(publicUrl, image);

    if (!sitePath) return;
    const descriptor = getManagedImageVariantDescriptor(sitePath);
    if (!descriptor) return;
    const variants = groupedByVariantFamily.get(descriptor.groupKey) ?? {};
    variants[descriptor.variant] = image;
    groupedByVariantFamily.set(descriptor.groupKey, variants);
  });

  const publishedBaseUrl = normalizePublishedBaseUrl(publishedSiteBaseUrl);
  const template = parseInertHtmlTemplate(html);
  template.content.querySelectorAll("img[src]").forEach((imageElement) => {
    const currentSrc = imageElement.getAttribute("src")?.trim();
    if (!currentSrc) return;

    if (mode === "display") {
      let resolvedImage: DraftImageAsset | null = null;

      const byPath = bySitePath.get(normalizeSitePath(currentSrc));
      if (byPath) resolvedImage = byPath;

      if (!resolvedImage) {
        const byPublic = byPublicUrl.get(currentSrc);
        if (byPublic) resolvedImage = byPublic;
      }

      if (!resolvedImage && publishedBaseUrl && currentSrc.startsWith(`${publishedBaseUrl}/`)) {
        const derivedPath = normalizeSitePath(currentSrc.slice(publishedBaseUrl.length));
        const fromPublished = bySitePath.get(derivedPath);
        if (fromPublished) resolvedImage = fromPublished;
      }

      if (resolvedImage) {
        imageElement.setAttribute("src", resolvedImage.publicUrl);
        if (enableManagedVariants) {
          setManagedImageVariantAttributes(
            imageElement,
            getManagedImageVariantsForAsset(resolvedImage, groupedByVariantFamily)
          );
        } else {
          setManagedImageVariantAttributes(imageElement, null);
        }
        return;
      }

      setManagedImageVariantAttributes(imageElement, null);
      if (publishedBaseUrl && currentSrc.startsWith(pageImagesPrefix)) {
        imageElement.setAttribute("src", toPublishedUrl(publishedBaseUrl, currentSrc));
        return;
      }

      if (publishedBaseUrl && currentSrc.startsWith(`${publishedBaseUrl}${pageImagesPrefix}`)) {
        imageElement.setAttribute("src", currentSrc);
        return;
      }

      const fromPublicFallback = byPublicUrl.get(currentSrc);
      if (fromPublicFallback) {
        imageElement.setAttribute("src", fromPublicFallback.publicUrl);
        return;
      }

      return;
    }

    setManagedImageVariantAttributes(imageElement, null);
    if (
      publishedBaseUrl &&
      currentSrc.startsWith(`${publishedBaseUrl}${pageImagesPrefix}`)
    ) {
      imageElement.setAttribute("src", normalizeSitePath(currentSrc.slice(publishedBaseUrl.length)));
      return;
    }

    const fromPublic = byPublicUrl.get(currentSrc);
    if (fromPublic) {
      imageElement.setAttribute("src", normalizeSitePath(fromPublic.sitePath));
      return;
    }

    if (!publishedBaseUrl || !currentSrc.startsWith(`${publishedBaseUrl}/`)) return;
    const derivedPath = normalizeSitePath(currentSrc.slice(publishedBaseUrl.length));
    const fromPublished = bySitePath.get(derivedPath);
    if (fromPublished) {
      imageElement.setAttribute("src", normalizeSitePath(fromPublished.sitePath));
    }
  });

  return template.innerHTML;
};
