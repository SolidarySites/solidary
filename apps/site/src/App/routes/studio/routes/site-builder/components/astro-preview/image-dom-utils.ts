import { BUILDER_IMAGE_ASPECT_RATIO_ATTR } from "../../../../../../lib/external-image-loading";

export const IMAGE_ALIGN_WRAPPER_ATTR = "data-builder-image-align-wrapper";
export const IMAGE_FIGURE_ATTR = "data-builder-image-figure";
export const NON_PARAGRAPH_BLOCK_SELECTOR =
  "p,h1,h2,h3,h4,h5,h6,ul,ol,li,blockquote,pre,table,figure,section,article,header,footer,nav,main,aside";

export const getNodeElement = (node: Node | null) => {
  if (!node) return null;
  return node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
};

export const getTextOffsetWithinRangeContainer = (container: HTMLElement, range: Range) => {
  const offsetRange = range.cloneRange();
  offsetRange.selectNodeContents(container);
  offsetRange.setEnd(range.endContainer, range.endOffset);
  return offsetRange.toString().length;
};

export const setCaretAtTextOffset = (container: HTMLElement, offset: number) => {
  const selection = window.getSelection();
  if (!selection) return;

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let remaining = Math.max(0, offset);
  let node = walker.nextNode();
  while (node) {
    const textLength = node.textContent?.length ?? 0;
    if (remaining <= textLength) {
      const range = document.createRange();
      range.setStart(node, remaining);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }
    remaining -= textLength;
    node = walker.nextNode();
  }

  const fallbackRange = document.createRange();
  fallbackRange.selectNodeContents(container);
  fallbackRange.collapse(false);
  selection.removeAllRanges();
  selection.addRange(fallbackRange);
};

const clampImageSizePercent = (value: number) => {
  if (Number.isNaN(value)) return 100;
  return Math.min(100, Math.max(1, Math.round(value)));
};

export const parseImageSizePercent = (image: HTMLImageElement) => {
  const widthFromStyle = image.style.width.trim();
  if (widthFromStyle.endsWith("%")) {
    return clampImageSizePercent(Number.parseFloat(widthFromStyle));
  }

  const widthFromAttribute = image.getAttribute("width")?.trim() ?? "";
  if (widthFromAttribute.endsWith("%")) {
    return clampImageSizePercent(Number.parseFloat(widthFromAttribute.replace("%", "")));
  }

  return 100;
};

const parseImageAspectRatioValue = (value: string | null | undefined) => {
  if (!value) return null;
  const parsed = Number.parseFloat(value.trim());
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};

const formatImageAspectRatio = (value: number) => value.toFixed(6).replace(/\.?0+$/, "");

const getImageAspectRatioFromMetadata = (image: Element) =>
  parseImageAspectRatioValue(image.getAttribute(BUILDER_IMAGE_ASPECT_RATIO_ATTR));

export const setImageAspectRatioMetadata = (image: Element, aspectRatio: number) => {
  if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) return;
  image.setAttribute(BUILDER_IMAGE_ASPECT_RATIO_ATTR, formatImageAspectRatio(aspectRatio));
};

export const ensureImageAspectRatioMetadata = (
  image: HTMLImageElement,
  overrideAspectRatio?: number
) => {
  const override = overrideAspectRatio && overrideAspectRatio > 0 ? overrideAspectRatio : null;
  if (override) {
    setImageAspectRatioMetadata(image, override);
    return override;
  }

  const existing = getImageAspectRatioFromMetadata(image);
  if (existing) return existing;

  if (image.naturalWidth > 0 && image.naturalHeight > 0) {
    const ratio = image.naturalWidth / image.naturalHeight;
    setImageAspectRatioMetadata(image, ratio);
    return ratio;
  }

  const widthAttr = parseImageAspectRatioValue(image.getAttribute("width"));
  const heightAttr = parseImageAspectRatioValue(image.getAttribute("height"));
  if (widthAttr && heightAttr) {
    const ratio = widthAttr / heightAttr;
    setImageAspectRatioMetadata(image, ratio);
    return ratio;
  }

  return null;
};

export const getDirectFigcaption = (figure: HTMLElement) =>
  Array.from(figure.children).find((child) => child instanceof HTMLElement && child.tagName === "FIGCAPTION") as
    | HTMLElement
    | undefined;

export const getImageCaptionText = (image: HTMLImageElement) => {
  const figure = image.closest("figure");
  if (!(figure instanceof HTMLElement)) return "";
  return getDirectFigcaption(figure)?.textContent ?? "";
};
