import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  type CSSProperties
} from "react";
import siteBuilderStylesRaw from "../SiteBuilderRoute.css?raw";
import { normalizePageSlug } from "../services/utils";
import {
  extractCssVariables as extractStyleVariables,
  extractCustomCssFromTokens
} from "../services/style-editor";
import { scopePreviewCss } from "./astro-preview/css-scope-utils";
import { markdownToHtml, parseFooterLineSegments } from "./astro-preview/content-utils";
import { mapHtmlImageSources } from "./astro-preview/image-source-utils";
import type {
  AstroTemplatePreviewHandle,
  AstroTemplatePreviewProps,
  ParsedPage,
  PreviewSelectedImage,
  PreviewSelectedElement,
  PreviewNavItem
} from "./astro-preview/types";

export type {
  AstroTemplatePreviewHandle,
  PreviewSelectedImage,
  PreviewSelectedElement
} from "./astro-preview/types";

const PREVIEW_BRIDGE_CHANNEL = "solidary:builder-preview";
const PREVIEW_IMAGE_ASPECT_RATIO_ATTR = "data-builder-image-aspect-ratio";

type PreviewFooterModule = {
  alignment: "left" | "center" | "right";
  html: string;
  hidden: boolean;
};

type PreviewFrameState = {
  editable: boolean;
  styleMode: "simple" | "advanced";
  previewStyleVars: Record<string, string>;
  previewInlineCss: string;
  previewBrand: string;
  homePageSlug: string;
  activeSlug: string;
  activeBodyHtml: string;
  activePageJavaScript: string;
  navItems: PreviewNavItem[];
  header: {
    disabled: boolean;
    fixed: boolean;
    brandText: string;
    disableBrand: boolean;
  };
  footer: {
    disabled: boolean;
    fixed: boolean;
    modules: PreviewFooterModule[];
    visibleModuleCount: number;
  };
};

type PreviewBridgeMessage = {
  channel: string;
  type: string;
  token?: string;
  payload?: unknown;
};

type PreviewCommandPayload =
  | {
      kind: "execCommand";
      command: string;
      value?: string;
    }
  | {
      kind: "focusEditor";
    }
  | {
      kind: "captureSelection";
    }
  | {
      kind: "replaceImageSource";
      previousSrc: string;
      nextSrc: string | null;
      aspectRatioOverride?: number;
    }
  | {
      kind: "setImageAspectRatioBySource";
      source: string;
      aspectRatio: number;
    }
  | {
      kind: "updateSelectedImageAlt";
      value: string;
    }
  | {
      kind: "updateSelectedImageCaption";
      value: string;
    }
  | {
      kind: "updateSelectedImageSize";
      value: number;
    }
  | {
      kind: "updateSelectedElementClassName";
      value: string;
      elementId?: string;
    }
  | {
      kind: "updateSelectedElementInlineStyle";
      value: string;
      elementId?: string;
    }
  | {
      kind: "clearSelectedImage";
    };

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const escapeInlineTagContent = (value: string) =>
  value
    .replace(/<\/script/gi, "<\\/script")
    .replace(/<\/style/gi, "<\\/style");

const rewriteCssUrlsForPreview = (css: string, previewAssetBaseUrl: string | null) => {
  const baseUrl = previewAssetBaseUrl?.trim() ?? "";
  if (!baseUrl) return css;

  let parsedBase: URL;
  try {
    parsedBase = new URL(baseUrl);
  } catch {
    return css;
  }

  const origin = parsedBase.origin;
  const normalizedBasePath = (() => {
    const pathname = parsedBase.pathname.trim();
    if (!pathname || pathname === "/") return "";
    return `/${pathname.replace(/^\/+|\/+$/g, "")}`;
  })();
  const baseHref = `${origin}${normalizedBasePath ? `${normalizedBasePath}/` : "/"}`;

  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (fullMatch, _quote, rawUrl: string) => {
    const urlValue = rawUrl.trim();
    if (!urlValue) return fullMatch;

    if (
      /^(?:data:|blob:|https?:|mailto:|tel:|\/\/|#)/i.test(urlValue) ||
      /^[a-z][a-z0-9+.-]*:/i.test(urlValue)
    ) {
      return fullMatch;
    }

    if (urlValue.startsWith("/")) {
      const resolvedPath =
        normalizedBasePath && urlValue.startsWith("/fonts/")
          ? `${normalizedBasePath}${urlValue}`
          : urlValue;
      return `url("${origin}${resolvedPath}")`;
    }

    try {
      return `url("${new URL(urlValue, baseHref).toString()}")`;
    } catch {
      return fullMatch;
    }
  });
};

const createBridgeToken = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
};

const buildPreviewFrameRuntimeScript = (channel: string, imageAspectRatioAttr: string) => `
(function () {
  var CHANNEL = ${JSON.stringify(channel)};
  var IMAGE_ASPECT_RATIO_ATTR = ${JSON.stringify(imageAspectRatioAttr)};
  var bridgeToken = "";
  var state = null;
  var root = document.getElementById("astro-preview-frame-root");
  var inlineCssStyle = document.getElementById("preview-inline-css");

  var previewRoot = null;
  var brandLinkElement = null;
  var navListElement = null;
  var footerElement = null;
  var footerInnerElement = null;
  var editorElement = null;

  var appliedStyleKeys = [];
  var savedSelection = null;
  var savedSelectionTextOffset = null;
  var selectedImageId = "";
  var selectedElement = null;
  var lastSelectedElementKey = "";
  var lastExecutedScriptKey = "";
  var lastAppliedBodySlug = "";
  var lastAppliedBodyHtml = "";
  var externalImageTrackers = new Map();
  var externalImageObserver = null;
  var externalImageDimensionsCache = new Map();

  var EXTERNAL_IMAGE_PLACEHOLDER_SRC = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' width='24' height='24' fill='none'%3E%3Ccircle cx='12' cy='12' r='9' stroke='rgba(31%2C34%2C28%2C0.2)' stroke-width='2'/%3E%3Cpath d='M12 3a9 9 0 0 1 7.8 4.5' stroke='rgba(31%2C34%2C28%2C0.65)' stroke-width='2' stroke-linecap='round'/%3E%3C/svg%3E";
  var EXTERNAL_IMAGE_SOURCE_ATTR = "data-external-image-src";
  var EXTERNAL_IMAGE_STATE_ATTR = "data-external-image-state";
  var EXTERNAL_IMAGE_CONTAINER_ATTR = "data-external-image-container";
  var EXTERNAL_IMAGE_VARIANT_SMALL_ATTR = "data-external-image-src-small";
  var EXTERNAL_IMAGE_VARIANT_MEDIUM_ATTR = "data-external-image-src-medium";
  var EXTERNAL_IMAGE_VARIANT_ORIGINAL_ATTR = "data-external-image-src-original";
  var EXTERNAL_IMAGE_TOKEN_ATTR = "data-external-image-token";
  var INSPECTABLE_ELEMENT_ID_ATTR = "data-builder-inspectable-element-id";
  var EXTERNAL_IMAGE_PLACEHOLDER_HEIGHT_CSS_VAR = "--external-image-placeholder-height";
  var EXTERNAL_IMAGE_PLACEHOLDER_WIDTH_CSS_VAR = "--external-image-placeholder-width";
  var EXTERNAL_IMAGE_PLACEHOLDER_LEFT_CSS_VAR = "--external-image-placeholder-left";
  var NON_PARAGRAPH_BLOCK_SELECTOR = "p,h1,h2,h3,h4,h5,h6,ul,ol,li,blockquote,pre,table,figure,section,article,header,footer,nav,main,aside";
  var FORMAT_BLOCK_SELECTOR = "p,h1,h2,h3,h4,h5,h6,blockquote";
  var IMAGE_INSERT_ANCHOR_SELECTOR = "p,h1,h2,h3,h4,h5,h6,blockquote,pre,li,div";
  var TEXT_BLOCK_MERGE_SELECTOR = "p,h1,h2,h3,h4,h5,h6,blockquote,pre,div";
  var INSPECTABLE_BLOCK_SELECTOR = "p,h1,h2,h3,h4,h5,h6,li,blockquote,pre,section,article,header,footer,nav,main,aside";

  function post(type, payload) {
    window.parent.postMessage(
      {
        channel: CHANNEL,
        type: type,
        token: bridgeToken,
        payload: payload || {}
      },
      "*"
    );
  }

  function isElementInEditor(node) {
    if (!editorElement || !node) return false;
    if (node === editorElement) return true;
    return editorElement.contains(node);
  }

  function ensureImageId(image) {
    if (!image) return "";
    var existing = (image.getAttribute("data-builder-image-id") || "").trim();
    if (existing) return existing;
    var generated = "img-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
    image.setAttribute("data-builder-image-id", generated);
    return generated;
  }

  function ensureInspectableElementId(element) {
    if (!(element instanceof HTMLElement)) return "";
    var existing = (element.getAttribute(INSPECTABLE_ELEMENT_ID_ATTR) || "").trim();
    if (existing) return existing;
    var generated =
      "el-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
    element.setAttribute(INSPECTABLE_ELEMENT_ID_ATTR, generated);
    return generated;
  }

  function findInspectableElementById(elementId) {
    if (!editorElement) return null;
    if (!elementId) return null;
    var selector = "[" + INSPECTABLE_ELEMENT_ID_ATTR + "='" + elementId.replaceAll("'", "\\\\'") + "']";
    var match = editorElement.querySelector(selector);
    return match instanceof HTMLElement ? match : null;
  }

  function parseImageSizePercent(image) {
    if (!image) return 100;
    var widthFromStyle = (image.style.width || "").trim();
    if (widthFromStyle.endsWith("%")) {
      var parsedStyle = Number.parseFloat(widthFromStyle);
      if (Number.isFinite(parsedStyle)) {
        return Math.max(1, Math.min(100, Math.round(parsedStyle)));
      }
    }

    var widthFromAttribute = (image.getAttribute("width") || "").trim();
    if (widthFromAttribute.endsWith("%")) {
      var parsedAttribute = Number.parseFloat(widthFromAttribute.replace("%", ""));
      if (Number.isFinite(parsedAttribute)) {
        return Math.max(1, Math.min(100, Math.round(parsedAttribute)));
      }
    }

    return 100;
  }

  function isManagedVariantSource(image, source) {
    if (!source) return false;
    var normalizedSource = source.trim();
    if (!normalizedSource) return false;

    var candidates = [
      (image.getAttribute(EXTERNAL_IMAGE_VARIANT_SMALL_ATTR) || "").trim(),
      (image.getAttribute(EXTERNAL_IMAGE_VARIANT_MEDIUM_ATTR) || "").trim(),
      (image.getAttribute(EXTERNAL_IMAGE_VARIANT_ORIGINAL_ATTR) || "").trim()
    ];

    for (var index = 0; index < candidates.length; index += 1) {
      if (candidates[index] && candidates[index] === normalizedSource) {
        return true;
      }
    }

    return false;
  }

  function getTrackedImageSource(image) {
    var tracked = (image.getAttribute(EXTERNAL_IMAGE_SOURCE_ATTR) || "").trim();
    var current = (image.getAttribute("src") || "").trim();

    if (!current || current === EXTERNAL_IMAGE_PLACEHOLDER_SRC) {
      return tracked || current;
    }

    if (!tracked) return current;
    if (tracked === current) return tracked;
    if (isManagedVariantSource(image, current)) return tracked;
    return current;
  }

  function isExternalImageSource(source) {
    if (typeof source !== "string") return false;
    var normalized = source.trim();
    if (!normalized) return false;

    var lower = normalized.toLowerCase();
    if (
      lower.startsWith("javascript:") ||
      lower.startsWith("mailto:") ||
      lower.startsWith("tel:") ||
      lower.startsWith("blob:") ||
      lower.startsWith("data:") ||
      lower.startsWith("about:") ||
      lower.startsWith("file:")
    ) {
      return false;
    }

    if (normalized.startsWith("//")) return true;
    if (lower.startsWith("http://") || lower.startsWith("https://")) return true;
    if (normalized.startsWith("/solidary-media/")) return true;
    return false;
  }

  function setExternalImageState(image, stateValue) {
    var figure = image.closest("figure[data-builder-image-figure='true']");
    var container = image.closest("[" + EXTERNAL_IMAGE_CONTAINER_ATTR + "='true']");
    var targets = [image, figure, container];

    for (var index = 0; index < targets.length; index += 1) {
      var target = targets[index];
      if (!(target instanceof Element)) continue;
      if (stateValue) {
        target.setAttribute(EXTERNAL_IMAGE_STATE_ATTR, stateValue);
      } else {
        target.removeAttribute(EXTERNAL_IMAGE_STATE_ATTR);
      }
    }
  }

  function clearExternalImageTrackingAttributes(image) {
    image.removeAttribute(EXTERNAL_IMAGE_SOURCE_ATTR);
    image.removeAttribute(EXTERNAL_IMAGE_STATE_ATTR);
    image.removeAttribute(EXTERNAL_IMAGE_TOKEN_ATTR);
    setExternalImageState(image, null);
    clearExternalImagePlaceholderSizing(image);
  }

  function parsePositiveNumber(value) {
    if (!value) return null;
    var normalized = Number.parseFloat(String(value).trim());
    if (!Number.isFinite(normalized) || normalized <= 0) return null;
    return normalized;
  }

  function parsePercentWidth(value) {
    if (!value) return null;
    var trimmed = value.trim();
    if (!trimmed.endsWith("%")) return null;
    var parsed = Number.parseFloat(trimmed.slice(0, -1));
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return parsed;
  }

  function getImageDisplayWidthEstimate(image) {
    var measuredImageWidth = image.getBoundingClientRect().width;
    if (measuredImageWidth > 0) return measuredImageWidth;

    var alignWrapper = image.closest("[data-builder-image-align-wrapper='true']");
    if (alignWrapper instanceof HTMLElement) {
      var wrapperWidth = alignWrapper.getBoundingClientRect().width;
      if (wrapperWidth > 0) {
        var percentageWidth =
          parsePercentWidth(image.style.width) ||
          parsePercentWidth(image.getAttribute("width") || "");
        if (percentageWidth) {
          return (wrapperWidth * percentageWidth) / 100;
        }
        return wrapperWidth;
      }
    }

    var figure = image.closest("figure[data-builder-image-figure='true']");
    if (figure instanceof HTMLElement) {
      var figureWidth = figure.getBoundingClientRect().width;
      if (figureWidth > 0) return figureWidth;
    }

    return 0;
  }

  function collectUniqueSources(sources) {
    var unique = [];
    var seen = new Set();
    for (var index = 0; index < sources.length; index += 1) {
      var source = typeof sources[index] === "string" ? sources[index].trim() : "";
      if (!source || seen.has(source)) continue;
      seen.add(source);
      unique.push(source);
    }
    return unique;
  }

  function resolveImageAspectRatio(image, sourceCandidates) {
    var ratioFromMetadata = parsePositiveNumber(image.getAttribute(IMAGE_ASPECT_RATIO_ATTR));
    if (ratioFromMetadata) {
      return ratioFromMetadata;
    }

    var widthFromAttributes = parsePositiveNumber(image.getAttribute("width"));
    var heightFromAttributes = parsePositiveNumber(image.getAttribute("height"));
    if (widthFromAttributes && heightFromAttributes) {
      return widthFromAttributes / heightFromAttributes;
    }

    var uniqueSources = collectUniqueSources(sourceCandidates || []);
    for (var index = 0; index < uniqueSources.length; index += 1) {
      var dimensions = externalImageDimensionsCache.get(uniqueSources[index]);
      if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) continue;
      return dimensions.width / dimensions.height;
    }

    return null;
  }

  function getImagePlaceholderLeftOffset(image, placeholderWidth) {
    var alignWrapper = image.closest("[data-builder-image-align-wrapper='true']");
    if (alignWrapper instanceof HTMLElement) {
      var wrapperWidth = alignWrapper.getBoundingClientRect().width;
      if (wrapperWidth > 0) {
        var textAlign = (window.getComputedStyle(alignWrapper).textAlign || alignWrapper.style.textAlign || "")
          .trim()
          .toLowerCase();
        if (textAlign === "right" || textAlign === "end") {
          return Math.max(0, Math.round(wrapperWidth - placeholderWidth));
        }
        if (textAlign === "center") {
          return Math.max(0, Math.round((wrapperWidth - placeholderWidth) / 2));
        }
      }
      return 0;
    }

    var figure = image.closest("figure[data-builder-image-figure='true']");
    if (!(figure instanceof HTMLElement)) return 0;

    var figureRect = figure.getBoundingClientRect();
    var imageRect = image.getBoundingClientRect();
    if (figureRect.width <= 0 || imageRect.width <= 0) return 0;
    return Math.max(0, Math.round(imageRect.left - figureRect.left));
  }

  function applyExternalImagePlaceholderSizing(image, sourceCandidates) {
    var figure = image.closest("figure[data-builder-image-figure='true']");
    if (!(figure instanceof HTMLElement)) return;

    var width = getImageDisplayWidthEstimate(image);
    if (!Number.isFinite(width) || width <= 0) {
      figure.style.removeProperty(EXTERNAL_IMAGE_PLACEHOLDER_HEIGHT_CSS_VAR);
      figure.style.removeProperty(EXTERNAL_IMAGE_PLACEHOLDER_WIDTH_CSS_VAR);
      figure.style.removeProperty(EXTERNAL_IMAGE_PLACEHOLDER_LEFT_CSS_VAR);
      return;
    }

    var aspectRatio = resolveImageAspectRatio(image, sourceCandidates || []);
    if (!aspectRatio || !Number.isFinite(aspectRatio) || aspectRatio <= 0) {
      figure.style.removeProperty(EXTERNAL_IMAGE_PLACEHOLDER_HEIGHT_CSS_VAR);
      figure.style.removeProperty(EXTERNAL_IMAGE_PLACEHOLDER_WIDTH_CSS_VAR);
      figure.style.removeProperty(EXTERNAL_IMAGE_PLACEHOLDER_LEFT_CSS_VAR);
      return;
    }

    var placeholderWidth = Math.max(1, Math.round(width));
    var placeholderLeft = getImagePlaceholderLeftOffset(image, placeholderWidth);
    var placeholderHeight = Math.max(72, Math.round(width / aspectRatio));

    figure.style.setProperty(EXTERNAL_IMAGE_PLACEHOLDER_WIDTH_CSS_VAR, String(placeholderWidth) + "px");
    figure.style.setProperty(EXTERNAL_IMAGE_PLACEHOLDER_LEFT_CSS_VAR, String(placeholderLeft) + "px");
    figure.style.setProperty(EXTERNAL_IMAGE_PLACEHOLDER_HEIGHT_CSS_VAR, String(placeholderHeight) + "px");
    image.style.height = String(placeholderHeight) + "px";
  }

  function clearExternalImagePlaceholderSizing(image) {
    var figure = image.closest("figure[data-builder-image-figure='true']");
    if (figure instanceof HTMLElement) {
      figure.style.removeProperty(EXTERNAL_IMAGE_PLACEHOLDER_HEIGHT_CSS_VAR);
      figure.style.removeProperty(EXTERNAL_IMAGE_PLACEHOLDER_WIDTH_CSS_VAR);
      figure.style.removeProperty(EXTERNAL_IMAGE_PLACEHOLDER_LEFT_CSS_VAR);
    }
    image.style.height = "auto";
  }

  function cacheExternalImageDimensions(width, height, sources) {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return;
    }

    var uniqueSources = collectUniqueSources(sources || []);
    for (var index = 0; index < uniqueSources.length; index += 1) {
      externalImageDimensionsCache.set(uniqueSources[index], {
        width: width,
        height: height
      });
    }
  }

  function resolveExternalImageLoadSource(image, fallbackSource) {
    var small = (image.getAttribute(EXTERNAL_IMAGE_VARIANT_SMALL_ATTR) || "").trim();
    var medium = (image.getAttribute(EXTERNAL_IMAGE_VARIANT_MEDIUM_ATTR) || "").trim();
    var original = (image.getAttribute(EXTERNAL_IMAGE_VARIANT_ORIGINAL_ATTR) || "").trim();

    if (!small && !medium && !original) {
      return fallbackSource;
    }

    var estimatedDisplayWidth = getImageDisplayWidthEstimate(image);
    if (!Number.isFinite(estimatedDisplayWidth) || estimatedDisplayWidth <= 0) {
      estimatedDisplayWidth = 1200;
    }

    var devicePixelRatio = Number.isFinite(window.devicePixelRatio) && window.devicePixelRatio > 0
      ? window.devicePixelRatio
      : 1;
    var targetDisplayPixels = estimatedDisplayWidth * devicePixelRatio;

    if (targetDisplayPixels <= 560) {
      return small || medium || original || fallbackSource;
    }

    if (targetDisplayPixels <= 1080) {
      return medium || original || small || fallbackSource;
    }

    return original || medium || small || fallbackSource;
  }

  function startExternalImageLoadWithPlaceholder(image, source) {
    var targetSource = typeof source === "string" ? source.trim() : "";
    if (!isExternalImageSource(targetSource)) {
      clearExternalImageTrackingAttributes(image);
      return function () {};
    }

    var loadSource = resolveExternalImageLoadSource(image, targetSource);
    var small = (image.getAttribute(EXTERNAL_IMAGE_VARIANT_SMALL_ATTR) || "").trim();
    var medium = (image.getAttribute(EXTERNAL_IMAGE_VARIANT_MEDIUM_ATTR) || "").trim();
    var original = (image.getAttribute(EXTERNAL_IMAGE_VARIANT_ORIGINAL_ATTR) || "").trim();
    var placeholderSource = small || medium || original || EXTERNAL_IMAGE_PLACEHOLDER_SRC;
    var placeholderCandidates = collectUniqueSources([
      targetSource,
      loadSource,
      original,
      medium,
      small
    ]);

    image.setAttribute(EXTERNAL_IMAGE_SOURCE_ATTR, targetSource);

    if (image.getAttribute("src") === loadSource && image.complete && image.naturalWidth > 0) {
      image.removeAttribute(EXTERNAL_IMAGE_TOKEN_ATTR);
      cacheExternalImageDimensions(image.naturalWidth, image.naturalHeight, placeholderCandidates);
      clearExternalImagePlaceholderSizing(image);
      setExternalImageState(image, "loaded");
      return function () {};
    }

    var token = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
    var cancelled = false;
    var revealLoadListener = null;
    var revealErrorListener = null;
    var loader = new Image();
    var placeholderSizingFrameId = null;

    image.setAttribute(EXTERNAL_IMAGE_TOKEN_ATTR, token);
    setExternalImageState(image, "loading");
    applyExternalImagePlaceholderSizing(image, placeholderCandidates);

    if (placeholderSource && placeholderSource !== loadSource) {
      image.setAttribute("src", placeholderSource);
    }

    function syncPlaceholderSizing() {
      if (cancelled) return;
      if (image.getAttribute(EXTERNAL_IMAGE_TOKEN_ATTR) !== token) return;
      applyExternalImagePlaceholderSizing(image, placeholderCandidates);
    }

    function schedulePlaceholderSizingSync() {
      if (placeholderSizingFrameId !== null) {
        window.cancelAnimationFrame(placeholderSizingFrameId);
      }
      placeholderSizingFrameId = window.requestAnimationFrame(function () {
        placeholderSizingFrameId = null;
        syncPlaceholderSizing();
      });
    }

    function stopPlaceholderSizingSync() {
      window.removeEventListener("resize", schedulePlaceholderSizingSync);
      if (placeholderSizingFrameId !== null) {
        window.cancelAnimationFrame(placeholderSizingFrameId);
        placeholderSizingFrameId = null;
      }
    }

    schedulePlaceholderSizingSync();
    window.addEventListener("resize", schedulePlaceholderSizingSync);

    function clearRevealListeners() {
      if (revealLoadListener) {
        image.removeEventListener("load", revealLoadListener);
        revealLoadListener = null;
      }
      if (revealErrorListener) {
        image.removeEventListener("error", revealErrorListener);
        revealErrorListener = null;
      }
    }

    function complete(stateValue) {
      if (cancelled) return;
      if (image.getAttribute(EXTERNAL_IMAGE_TOKEN_ATTR) !== token) return;
      image.removeAttribute(EXTERNAL_IMAGE_TOKEN_ATTR);
      stopPlaceholderSizingSync();
      clearExternalImagePlaceholderSizing(image);
      setExternalImageState(image, stateValue);
      clearRevealListeners();
    }

    loader.onload = function () {
      if (cancelled) return;
      if (image.getAttribute(EXTERNAL_IMAGE_TOKEN_ATTR) !== token) return;
      cacheExternalImageDimensions(loader.naturalWidth, loader.naturalHeight, placeholderCandidates);
      syncPlaceholderSizing();

      clearRevealListeners();
      revealLoadListener = function () {
        complete("loaded");
      };
      revealErrorListener = function () {
        complete("error");
      };

      image.addEventListener("load", revealLoadListener);
      image.addEventListener("error", revealErrorListener);
      image.setAttribute("src", loadSource);

      if (image.complete && image.naturalWidth > 0) {
        complete("loaded");
      }
    };

    loader.onerror = function () {
      if (cancelled) return;
      if (image.getAttribute(EXTERNAL_IMAGE_TOKEN_ATTR) !== token) return;
      image.setAttribute("src", loadSource);
      complete("error");
    };

    loader.src = loadSource;

    return function () {
      cancelled = true;
      stopPlaceholderSizingSync();
      loader.onload = null;
      loader.onerror = null;
      clearRevealListeners();

      if (image.getAttribute(EXTERNAL_IMAGE_TOKEN_ATTR) === token) {
        image.removeAttribute(EXTERNAL_IMAGE_TOKEN_ATTR);
        clearExternalImagePlaceholderSizing(image);
        setExternalImageState(image, null);
      }
    };
  }

  function stopTrackingExternalImage(image, clearAttributes) {
    var tracked = externalImageTrackers.get(image);
    if (tracked) {
      tracked.cleanup();
      externalImageTrackers.delete(image);
    }

    if (clearAttributes) {
      clearExternalImageTrackingAttributes(image);
    }
  }

  function processExternalImage(image) {
    if (!(image instanceof HTMLImageElement)) return;

    ensureImageId(image);
    ensureImageFigure(image);

    var source = getTrackedImageSource(image);
    if (!isExternalImageSource(source)) {
      stopTrackingExternalImage(image, true);
      return;
    }

    var tracked = externalImageTrackers.get(image);
    if (tracked && tracked.source === source) return;

    stopTrackingExternalImage(image, false);
    externalImageTrackers.set(image, {
      source: source,
      cleanup: startExternalImageLoadWithPlaceholder(image, source)
    });
  }

  function forEachImageInNode(node, visitor) {
    if (node instanceof HTMLImageElement) {
      visitor(node);
    }

    if (!(node instanceof Element)) return;
    var nested = node.querySelectorAll("img");
    for (var index = 0; index < nested.length; index += 1) {
      visitor(nested[index]);
    }
  }

  function syncExternalImagesInEditor() {
    if (!editorElement) return;
    var images = editorElement.querySelectorAll("img");
    for (var index = 0; index < images.length; index += 1) {
      processExternalImage(images[index]);
    }
  }

  function ensureExternalImageObserver() {
    if (externalImageObserver || !editorElement || typeof MutationObserver === "undefined") return;

    externalImageObserver = new MutationObserver(function (records) {
      for (var recordIndex = 0; recordIndex < records.length; recordIndex += 1) {
        var record = records[recordIndex];

        if (record.type === "attributes" && record.target instanceof HTMLImageElement) {
          processExternalImage(record.target);
          continue;
        }

        if (record.type !== "childList") continue;

        for (var addedIndex = 0; addedIndex < record.addedNodes.length; addedIndex += 1) {
          forEachImageInNode(record.addedNodes[addedIndex], processExternalImage);
        }

        for (var removedIndex = 0; removedIndex < record.removedNodes.length; removedIndex += 1) {
          forEachImageInNode(record.removedNodes[removedIndex], function (image) {
            stopTrackingExternalImage(image, false);
          });
        }
      }
    });

    externalImageObserver.observe(editorElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: [
        "src",
        EXTERNAL_IMAGE_SOURCE_ATTR,
        EXTERNAL_IMAGE_VARIANT_SMALL_ATTR,
        EXTERNAL_IMAGE_VARIANT_MEDIUM_ATTR,
        EXTERNAL_IMAGE_VARIANT_ORIGINAL_ATTR
      ]
    });
  }

  function getPersistableEditorHtml() {
    if (!editorElement) return "";

    var template = document.createElement("template");
    template.innerHTML = editorElement.innerHTML;

    var images = template.content.querySelectorAll("img");
    for (var index = 0; index < images.length; index += 1) {
      var image = images[index];
      var source = getTrackedImageSource(image);
      if (source) {
        image.setAttribute("src", source);
      }

      image.removeAttribute(EXTERNAL_IMAGE_SOURCE_ATTR);
      image.removeAttribute(EXTERNAL_IMAGE_STATE_ATTR);
      image.removeAttribute(EXTERNAL_IMAGE_TOKEN_ATTR);
      image.removeAttribute(EXTERNAL_IMAGE_VARIANT_SMALL_ATTR);
      image.removeAttribute(EXTERNAL_IMAGE_VARIANT_MEDIUM_ATTR);
      image.removeAttribute(EXTERNAL_IMAGE_VARIANT_ORIGINAL_ATTR);
    }

    var figures = template.content.querySelectorAll("figure[data-builder-image-figure='true']");
    for (var figureIndex = 0; figureIndex < figures.length; figureIndex += 1) {
      figures[figureIndex].removeAttribute(EXTERNAL_IMAGE_STATE_ATTR);
    }

    var containers = template.content.querySelectorAll("[" + EXTERNAL_IMAGE_CONTAINER_ATTR + "='true']");
    for (var containerIndex = 0; containerIndex < containers.length; containerIndex += 1) {
      containers[containerIndex].removeAttribute(EXTERNAL_IMAGE_STATE_ATTR);
    }

    var figcaptions = template.content.querySelectorAll("figure[data-builder-image-figure='true'] > figcaption");
    for (var captionIndex = 0; captionIndex < figcaptions.length; captionIndex += 1) {
      var figcaption = figcaptions[captionIndex];
      if (!(figcaption instanceof HTMLElement)) continue;
      figcaption.style.removeProperty("width");
      figcaption.style.removeProperty("max-width");
      figcaption.style.removeProperty("margin-left");
      figcaption.style.removeProperty("display");
    }

    var inspectableElements = template.content.querySelectorAll("[" + INSPECTABLE_ELEMENT_ID_ATTR + "]");
    for (var elementIndex = 0; elementIndex < inspectableElements.length; elementIndex += 1) {
      inspectableElements[elementIndex].removeAttribute(INSPECTABLE_ELEMENT_ID_ATTR);
    }

    return template.innerHTML;
  }

  function getImageCaptionText(image) {
    var figure = image ? image.closest("figure") : null;
    if (!(figure instanceof HTMLElement)) return "";
    var caption = figure.querySelector(":scope > figcaption");
    if (!(caption instanceof HTMLElement)) return "";
    return caption.textContent || "";
  }

  function ensureImageFigure(image) {
    if (!(image instanceof HTMLImageElement)) return null;

    var figure = image.closest("figure");
    if (!(figure instanceof HTMLElement)) {
      figure = document.createElement("figure");
      var parent = image.parentElement;
      if (!parent) return null;
      parent.insertBefore(figure, image);
      figure.appendChild(image);
    }

    figure.setAttribute("data-builder-image-figure", "true");
    if (!figure.style.display) figure.style.display = "block";
    if (!figure.style.maxWidth) figure.style.maxWidth = "100%";
    if (!figure.style.margin) figure.style.margin = "0";

    if (!image.style.display) image.style.display = "inline-block";
    if (!image.style.maxWidth) image.style.maxWidth = "100%";
    if (!image.style.height) image.style.height = "auto";

    var caption = figure.querySelector(":scope > figcaption");
    if (!(caption instanceof HTMLElement)) {
      caption = document.createElement("figcaption");
      figure.appendChild(caption);
    }

    return figure;
  }

  function findImageById(imageId) {
    if (!editorElement) return null;
    if (!imageId) return null;
    var images = editorElement.querySelectorAll("img[data-builder-image-id]");
    for (var index = 0; index < images.length; index += 1) {
      var candidate = images[index];
      if ((candidate.getAttribute("data-builder-image-id") || "") === imageId) {
        return candidate;
      }
    }
    return null;
  }

  function getSelectedImageElement() {
    if (!editorElement) return null;
    if (!selectedImageId) return null;
    return findImageById(selectedImageId);
  }

  function emitSelectedImageChange(image) {
    if (!state) return;
    if (!(image instanceof HTMLImageElement)) {
      post("selected-image-change", { selectedImage: null });
      return;
    }

    var imageId = ensureImageId(image);
    selectedImageId = imageId;

    post("selected-image-change", {
      selectedImage: {
        pageSlug: state.activeSlug,
        id: imageId,
        src: getTrackedImageSource(image),
        alt: image.getAttribute("alt") || "",
        caption: getImageCaptionText(image),
        sizePercent: parseImageSizePercent(image)
      }
    });
  }

  function clearSelectedImage(forceEmit) {
    var hadSelection = Boolean(selectedImageId);
    selectedImageId = "";
    if (forceEmit || hadSelection) {
      emitSelectedImageChange(null);
    }
  }

  function emitSelectedElementChange(element) {
    if (!state) return;

    if (
      !(element instanceof HTMLElement) ||
      !isElementInEditor(element) ||
      element === editorElement
    ) {
      selectedElement = null;
      if (lastSelectedElementKey) {
        lastSelectedElementKey = "";
        post("selected-element-change", { selectedElement: null });
      }
      return;
    }

    selectedElement = element;
    var elementId = ensureInspectableElementId(element);
    var tagName = (element.tagName || "").toLowerCase();
    var className = (element.getAttribute("class") || "").trim();
    var inlineStyle = (element.getAttribute("style") || "").trim();
    var nextKey = [state.activeSlug, elementId, tagName, className, inlineStyle].join("|");
    if (nextKey === lastSelectedElementKey) return;
    lastSelectedElementKey = nextKey;

    post("selected-element-change", {
      selectedElement: {
        elementId: elementId,
        pageSlug: state.activeSlug,
        tagName: tagName,
        className: className,
        inlineStyle: inlineStyle
      }
    });
  }

  function getElementSelectionCandidates() {
    if (!editorElement) return [];
    var selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return [];

    var range = selection.getRangeAt(0);
    var nodesToCheck = [range.commonAncestorContainer, range.startContainer, range.endContainer];
    var candidates = [];

    for (var index = 0; index < nodesToCheck.length; index += 1) {
      var node = nodesToCheck[index];
      if (!node) continue;
      var element = node instanceof Element ? node : node.parentElement;
      if (!(element instanceof Element)) continue;
      if (!editorElement.contains(element)) continue;
      candidates.push(element);
    }

    return candidates;
  }

  function findImageInsertAnchorTarget() {
    if (!editorElement) return null;
    var candidates = getElementSelectionCandidates();
    if (!candidates.length) return null;

    for (var figureIndex = 0; figureIndex < candidates.length; figureIndex += 1) {
      var figureCandidate = candidates[figureIndex].closest("figure[data-builder-image-figure='true']");
      if (figureCandidate instanceof HTMLElement && editorElement.contains(figureCandidate)) {
        return figureCandidate;
      }
    }

    for (var blockIndex = 0; blockIndex < candidates.length; blockIndex += 1) {
      var blockCandidate = candidates[blockIndex].closest(IMAGE_INSERT_ANCHOR_SELECTOR);
      if (
        blockCandidate instanceof HTMLElement &&
        blockCandidate !== editorElement &&
        editorElement.contains(blockCandidate)
      ) {
        return blockCandidate;
      }
    }

    return null;
  }

  function getInspectableElementFromSelection() {
    if (!editorElement) return null;
    var candidates = getElementSelectionCandidates();
    if (!candidates.length) return null;

    for (var imageIndex = 0; imageIndex < candidates.length; imageIndex += 1) {
      var imageCandidate = candidates[imageIndex];
      if (imageCandidate instanceof HTMLImageElement) {
        return imageCandidate;
      }
      var nearestImage = imageCandidate.closest("img");
      if (nearestImage instanceof HTMLImageElement && editorElement.contains(nearestImage)) {
        return nearestImage;
      }
    }

    for (var figcaptionIndex = 0; figcaptionIndex < candidates.length; figcaptionIndex += 1) {
      var figcaptionCandidate = candidates[figcaptionIndex].closest("figcaption");
      if (figcaptionCandidate instanceof HTMLElement && editorElement.contains(figcaptionCandidate)) {
        return figcaptionCandidate;
      }
    }

    for (var figureIndex = 0; figureIndex < candidates.length; figureIndex += 1) {
      var figureCandidate = candidates[figureIndex].closest("figure[data-builder-image-figure='true']");
      if (figureCandidate instanceof HTMLElement && editorElement.contains(figureCandidate)) {
        return figureCandidate;
      }
    }

    for (var linkIndex = 0; linkIndex < candidates.length; linkIndex += 1) {
      var linkCandidate = candidates[linkIndex].closest("a");
      if (linkCandidate instanceof HTMLElement && editorElement.contains(linkCandidate)) {
        return linkCandidate;
      }
    }

    for (var blockIndex = 0; blockIndex < candidates.length; blockIndex += 1) {
      var blockCandidate = candidates[blockIndex].closest(INSPECTABLE_BLOCK_SELECTOR);
      if (blockCandidate instanceof HTMLElement && editorElement.contains(blockCandidate)) {
        return blockCandidate;
      }
    }

    for (var fallbackIndex = 0; fallbackIndex < candidates.length; fallbackIndex += 1) {
      var fallbackCandidate = candidates[fallbackIndex];
      if (fallbackCandidate instanceof HTMLElement && fallbackCandidate !== editorElement) {
        return fallbackCandidate;
      }
    }

    return null;
  }

  function getSelectedInspectableElement() {
    if (selectedElement instanceof HTMLElement && isElementInEditor(selectedElement)) {
      return selectedElement;
    }

    var fromSelection = getInspectableElementFromSelection();
    if (fromSelection instanceof HTMLElement) {
      selectedElement = fromSelection;
      return fromSelection;
    }

    selectedElement = null;
    return null;
  }

  function syncSelectionState() {
    if (!editorElement) return;

    var selectedImage = findImageFromSelection();

    if (selectedImage instanceof HTMLImageElement) {
      ensureImageFigure(selectedImage);
      emitSelectedImageChange(selectedImage);
    } else {
      clearSelectedImage();
    }

    emitSelectedElementChange(getInspectableElementFromSelection());
  }

  function captureSelection() {
    if (!editorElement) return;
    var selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    var range = selection.getRangeAt(0);
    var commonAncestor =
      range.commonAncestorContainer && range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
        ? range.commonAncestorContainer
        : range.commonAncestorContainer.parentElement;

    if (!isElementInEditor(commonAncestor)) return;

    try {
      savedSelection = range.cloneRange();
    } catch {
      savedSelection = null;
    }

    try {
      var nextOffset = getTextOffsetWithinRangeContainer(editorElement, range);
      savedSelectionTextOffset = Number.isFinite(nextOffset) ? nextOffset : null;
    } catch {
      savedSelectionTextOffset = null;
    }

    syncSelectionState();
  }

  function restoreSelection() {
    if (!savedSelection && !Number.isFinite(savedSelectionTextOffset)) return;
    var selection = window.getSelection();
    if (!selection) return;

    if (savedSelection) {
      try {
        selection.removeAllRanges();
        selection.addRange(savedSelection.cloneRange());
        return;
      } catch {
        savedSelection = null;
      }
    }

    if (Number.isFinite(savedSelectionTextOffset) && editorElement) {
      setCaretAtTextOffset(editorElement, savedSelectionTextOffset);
      if (selection.rangeCount > 0) {
        try {
          savedSelection = selection.getRangeAt(0).cloneRange();
        } catch {
          savedSelection = null;
        }
      }
    }
  }

  function getNodeElement(node) {
    if (!node) return null;
    return node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  }

  function getTextOffsetWithinRangeContainer(container, range) {
    var offsetRange = range.cloneRange();
    offsetRange.selectNodeContents(container);
    offsetRange.setEnd(range.endContainer, range.endOffset);
    return offsetRange.toString().length;
  }

  function setCaretAtTextOffset(container, offset) {
    var selection = window.getSelection();
    if (!selection) return;

    var walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    var remaining = Math.max(0, Number(offset) || 0);
    var node = walker.nextNode();
    while (node) {
      var textLength = node.textContent ? node.textContent.length : 0;
      if (remaining <= textLength) {
        var range = document.createRange();
        range.setStart(node, remaining);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
        return;
      }
      remaining -= textLength;
      node = walker.nextNode();
    }

    var fallbackRange = document.createRange();
    fallbackRange.selectNodeContents(container);
    fallbackRange.collapse(false);
    selection.removeAllRanges();
    selection.addRange(fallbackRange);
  }

  function normalizeTypedLineDivToParagraph() {
    if (!editorElement) return;
    var selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    var activeRange = selection.getRangeAt(0);
    var activeElement = getNodeElement(activeRange.startContainer);
    if (!activeElement || !editorElement.contains(activeElement)) return;

    var lineDiv = activeElement.closest("div");
    if (!(lineDiv instanceof HTMLDivElement)) return;
    if (lineDiv.parentElement !== editorElement) return;
    if ((lineDiv.getAttribute("data-builder-image-align-wrapper") || "").trim() === "true") return;
    if (!(lineDiv.textContent || "").trim()) return;
    if (lineDiv.querySelector("img,video,svg,iframe,object,embed,canvas")) return;
    if (lineDiv.querySelector(NON_PARAGRAPH_BLOCK_SELECTOR)) return;

    var caretOffset = selection.isCollapsed
      ? getTextOffsetWithinRangeContainer(lineDiv, activeRange)
      : null;

    var paragraph = document.createElement("p");
    var attributes = Array.from(lineDiv.attributes);
    for (var index = 0; index < attributes.length; index += 1) {
      var attribute = attributes[index];
      paragraph.setAttribute(attribute.name, attribute.value);
    }

    while (lineDiv.firstChild) {
      paragraph.appendChild(lineDiv.firstChild);
    }
    lineDiv.replaceWith(paragraph);

    if (caretOffset !== null) {
      setCaretAtTextOffset(paragraph, caretOffset);
    }
  }

  function findFigcaptionFromSelection() {
    if (!editorElement) return null;
    var selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;

    var range = selection.getRangeAt(0);
    var nodesToCheck = [range.commonAncestorContainer, range.startContainer, range.endContainer];
    for (var index = 0; index < nodesToCheck.length; index += 1) {
      var node = nodesToCheck[index];
      if (!node) continue;
      var element = node instanceof Element ? node : node.parentElement;
      if (!element || !editorElement.contains(element)) continue;
      var figcaption = element.closest("figcaption");
      if (!(figcaption instanceof HTMLElement)) continue;
      var figure = figcaption.closest("figure[data-builder-image-figure='true']");
      if (figure instanceof HTMLElement) return figcaption;
    }

    return null;
  }

  function findFigureFromSelection() {
    if (!editorElement) return null;
    var selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;

    var range = selection.getRangeAt(0);
    var nodesToCheck = [range.commonAncestorContainer, range.startContainer, range.endContainer];
    for (var index = 0; index < nodesToCheck.length; index += 1) {
      var node = nodesToCheck[index];
      if (!node) continue;
      var element = node instanceof Element ? node : node.parentElement;
      if (!element || !editorElement.contains(element)) continue;
      var figure = element.closest("figure[data-builder-image-figure='true']");
      if (figure instanceof HTMLElement) return figure;
    }

    return null;
  }

  function findImageFromSelection() {
    if (!editorElement) return null;
    var selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;

    var range = selection.getRangeAt(0);
    var nodesToCheck = [range.commonAncestorContainer, range.startContainer, range.endContainer];

    for (var index = 0; index < nodesToCheck.length; index += 1) {
      var node = nodesToCheck[index];
      if (!node) continue;
      var element = node instanceof Element ? node : node.parentElement;
      if (!element || !editorElement.contains(element)) continue;

      if (element instanceof HTMLImageElement) {
        return element;
      }

      var imageFromWrapper = element
        .closest("[data-builder-image-align-wrapper='true']")
        ?.querySelector("img");
      if (imageFromWrapper instanceof HTMLImageElement && editorElement.contains(imageFromWrapper)) {
        return imageFromWrapper;
      }

      var figureFromElement = element.closest("figure[data-builder-image-figure='true']");
      if (figureFromElement instanceof HTMLElement) {
        var imageFromFigure = figureFromElement.querySelector("img");
        if (imageFromFigure instanceof HTMLImageElement && editorElement.contains(imageFromFigure)) {
          return imageFromFigure;
        }
      }

      var nearestImage = element.closest("img");
      if (nearestImage instanceof HTMLImageElement && editorElement.contains(nearestImage)) {
        return nearestImage;
      }
    }

    var editorImages = editorElement.querySelectorAll("img");
    for (var imageIndex = 0; imageIndex < editorImages.length; imageIndex += 1) {
      var candidate = editorImages[imageIndex];
      try {
        if (range.intersectsNode(candidate)) {
          return candidate;
        }
      } catch {
        // Ignore invalid range/image combinations.
      }
    }

    return null;
  }

  function insertParagraphAfterFigure(figure) {
    if (!(figure instanceof HTMLElement)) return false;

    var paragraph = document.createElement("p");
    paragraph.appendChild(document.createElement("br"));
    figure.insertAdjacentElement("afterend", paragraph);
    setCaretAtTextOffset(paragraph, 0);

    clearSelectedImage();
    emitBodyChange();
    captureSelection();
    return true;
  }

  function insertParagraphBeforeFigure(figure) {
    if (!(figure instanceof HTMLElement)) return false;

    var paragraph = document.createElement("p");
    paragraph.appendChild(document.createElement("br"));
    figure.insertAdjacentElement("beforebegin", paragraph);
    setCaretAtTextOffset(paragraph, 0);

    clearSelectedImage();
    emitBodyChange();
    captureSelection();
    return true;
  }

  function getCollapsedSelectionRange() {
    var selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return null;
    return selection.getRangeAt(0);
  }

  function isCaretBeforeFigure(figure) {
    if (!(figure instanceof HTMLElement)) return false;
    var range = getCollapsedSelectionRange();
    if (!range) return false;

    var container = range.startContainer;
    var offset = range.startOffset;
    var parent = figure.parentNode;

    if (parent && container === parent) {
      return parent.childNodes[offset] === figure;
    }

    if (container === figure) {
      return offset === 0;
    }

    return false;
  }

  function getNodeBeforeCaretPosition(container, offset) {
    if (!editorElement) return null;

    if (container.nodeType === Node.TEXT_NODE) {
      if (offset > 0) return null;

      var textNode = container;
      while (textNode && textNode !== editorElement) {
        if (textNode.previousSibling) return textNode.previousSibling;
        textNode = textNode.parentNode;
      }
      return null;
    }

    if (container.nodeType === Node.ELEMENT_NODE) {
      if (offset > 0 && container.childNodes[offset - 1]) {
        return container.childNodes[offset - 1];
      }

      var elementNode = container;
      while (elementNode && elementNode !== editorElement) {
        if (elementNode.previousSibling) return elementNode.previousSibling;
        elementNode = elementNode.parentNode;
      }
    }

    return null;
  }

  function getNodeAfterCaretPosition(container, offset) {
    if (!editorElement) return null;

    if (container.nodeType === Node.TEXT_NODE) {
      var textContentLength = container.textContent ? container.textContent.length : 0;
      if (offset < textContentLength) return null;

      var textNode = container;
      while (textNode && textNode !== editorElement) {
        if (textNode.nextSibling) return textNode.nextSibling;
        textNode = textNode.parentNode;
      }
      return null;
    }

    if (container.nodeType === Node.ELEMENT_NODE) {
      if (offset < container.childNodes.length && container.childNodes[offset]) {
        return container.childNodes[offset];
      }

      var elementNode = container;
      while (elementNode && elementNode !== editorElement) {
        if (elementNode.nextSibling) return elementNode.nextSibling;
        elementNode = elementNode.parentNode;
      }
    }

    return null;
  }

  function resolveFigureFromNode(node) {
    if (!(node instanceof Node)) return null;

    if (node instanceof HTMLElement && node.matches("figure[data-builder-image-figure='true']")) {
      return node;
    }

    if (node instanceof Element) {
      var closestFigure = node.closest("figure[data-builder-image-figure='true']");
      if (closestFigure instanceof HTMLElement) return closestFigure;
    }

    if (node instanceof Element) {
      var nestedFigure = node.querySelector("figure[data-builder-image-figure='true']");
      if (nestedFigure instanceof HTMLElement) return nestedFigure;
    }

    return null;
  }

  function findAdjacentFigureFromCaret(direction) {
    var range = getCollapsedSelectionRange();
    if (!range) return null;

    var referenceNode =
      direction === "backward"
        ? getNodeBeforeCaretPosition(range.startContainer, range.startOffset)
        : getNodeAfterCaretPosition(range.startContainer, range.startOffset);

    return resolveFigureFromNode(referenceNode);
  }

  function findTextBlockFromSelection() {
    if (!editorElement) return null;
    var range = getCollapsedSelectionRange();
    if (!range) return null;

    var node = range.startContainer;
    var element = node instanceof Element ? node : node.parentElement;
    if (!(element instanceof HTMLElement)) return null;
    if (!editorElement.contains(element)) return null;

    var block = element.closest(TEXT_BLOCK_MERGE_SELECTOR);
    if (!(block instanceof HTMLElement) || !editorElement.contains(block)) return null;
    return block;
  }

  function isCaretAtStartOfElement(element) {
    if (!(element instanceof HTMLElement)) return false;
    var range = getCollapsedSelectionRange();
    if (!range) return false;
    if (!element.contains(range.startContainer)) return false;
    return getTextOffsetWithinRangeContainer(element, range) === 0;
  }

  function findPreviousMergeableTextBlock(currentBlock) {
    if (!(currentBlock instanceof HTMLElement)) return null;
    var candidate = currentBlock.previousSibling;

    while (candidate) {
      if (candidate.nodeType === Node.TEXT_NODE) {
        if (!(candidate.textContent || "").trim()) {
          candidate = candidate.previousSibling;
          continue;
        }
        return null;
      }

      if (candidate.nodeType === Node.ELEMENT_NODE && candidate instanceof HTMLElement) {
        if (candidate.matches("figure[data-builder-image-figure='true']")) {
          return null;
        }
        if (candidate.matches(TEXT_BLOCK_MERGE_SELECTOR)) {
          return candidate;
        }
        if (candidate.tagName.toLowerCase() === "br") {
          candidate = candidate.previousSibling;
          continue;
        }
        return null;
      }

      candidate = candidate.previousSibling;
    }

    return null;
  }

  function canContainNestedTextBlock(element) {
    if (!(element instanceof HTMLElement)) return false;
    var tagName = element.tagName.toLowerCase();
    return tagName === "div" || tagName === "blockquote";
  }

  function promoteTextBlockToContainer(element) {
    if (!(element instanceof HTMLElement)) return null;
    var parent = element.parentNode;
    if (!parent) return null;

    var container = document.createElement("div");
    var attributes = Array.from(element.attributes);
    for (var index = 0; index < attributes.length; index += 1) {
      var attribute = attributes[index];
      container.setAttribute(attribute.name, attribute.value);
    }

    while (element.firstChild) {
      container.appendChild(element.firstChild);
    }

    parent.replaceChild(container, element);
    return container;
  }

  function mergeCurrentTextBlockIntoPrevious(currentBlock) {
    if (!(currentBlock instanceof HTMLElement)) return false;
    var previousBlock = findPreviousMergeableTextBlock(currentBlock);
    if (!(previousBlock instanceof HTMLElement)) return false;

    var range = getCollapsedSelectionRange();
    var caretOffset = 0;
    if (range && currentBlock.contains(range.startContainer)) {
      caretOffset = getTextOffsetWithinRangeContainer(currentBlock, range);
    }

    var mergeTarget = previousBlock;
    if (!canContainNestedTextBlock(mergeTarget)) {
      var promoted = promoteTextBlockToContainer(mergeTarget);
      if (!(promoted instanceof HTMLElement)) return false;
      mergeTarget = promoted;
    }

    mergeTarget.appendChild(currentBlock);
    setCaretAtTextOffset(currentBlock, caretOffset);
    return true;
  }

  function ensureEditorHasParagraphWhenEmpty() {
    if (!editorElement) return;
    var hasMeaningfulContent = (editorElement.textContent || "").trim().length > 0 || editorElement.querySelector("img,figure,table,ul,ol,blockquote,pre");
    if (hasMeaningfulContent) return;

    if (editorElement.childNodes.length > 0) return;

    var paragraph = document.createElement("p");
    paragraph.appendChild(document.createElement("br"));
    editorElement.appendChild(paragraph);
    setCaretAtTextOffset(paragraph, 0);
  }

  function deleteNodeWithUndo(node) {
    if (!(node instanceof Node)) return false;

    var selection = window.getSelection();
    if (!selection) return false;

    var range = document.createRange();
    try {
      range.selectNode(node);
    } catch {
      return false;
    }
    selection.removeAllRanges();
    selection.addRange(range);

    try {
      var deleted = document.execCommand("delete", false);
      if (deleted) {
        return true;
      }
    } catch {
      // Fall through to manual removal.
    }

    if (node.parentNode) {
      node.parentNode.removeChild(node);
      return true;
    }

    return false;
  }

  function deleteRangeWithUndo(range) {
    if (!(range instanceof Range)) return false;
    var selection = window.getSelection();
    if (!selection) return false;

    selection.removeAllRanges();
    selection.addRange(range);

    try {
      var deleted = document.execCommand("delete", false);
      if (deleted) return true;
    } catch {
      // Fall through to manual deletion.
    }

    try {
      range.deleteContents();
      return true;
    } catch {
      return false;
    }
  }

  function isIgnorableFigureElement(element) {
    if (!(element instanceof HTMLElement)) return false;
    var tagName = element.tagName.toLowerCase();

    if (tagName === "img") return true;

    if (tagName === "figcaption") {
      var captionText = (element.textContent || "").replace(/\u200B/g, "").trim();
      var hasNonBreakChild = Array.from(element.querySelectorAll("*")).some(function (child) {
        return child.tagName.toLowerCase() !== "br";
      });
      return !captionText && !hasNonBreakChild;
    }

    if ((element.getAttribute("data-builder-image-align-wrapper") || "").trim() === "true") {
      var wrapperText = (element.textContent || "").replace(/\u200B/g, "").trim();
      var hasNonImageDescendant = Array.from(element.querySelectorAll("*")).some(function (child) {
        return child.tagName.toLowerCase() !== "img";
      });
      return !wrapperText && !hasNonImageDescendant;
    }

    var elementText = (element.textContent || "").replace(/\u200B/g, "").trim();
    var hasMeaningfulMedia = Boolean(
      element.querySelector("img,video,svg,iframe,object,embed,canvas,table,ul,ol,li,blockquote,pre,figure")
    );
    var childElements = Array.from(element.children).filter(function (child) {
      return child.tagName.toLowerCase() !== "br";
    });
    if (!elementText && !hasMeaningfulMedia && childElements.length === 0) {
      return true;
    }

    return false;
  }

  function findFigureInnerDeletableTarget(figure, direction) {
    if (!(figure instanceof HTMLElement)) return null;

    var walker = document.createTreeWalker(figure, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    var textCandidates = [];
    var elementCandidates = [];
    var node = walker.nextNode();

    while (node) {
      if (node.nodeType === Node.TEXT_NODE) {
        if ((node.textContent || "").replace(/\u200B/g, "").trim()) {
          textCandidates.push(node);
        }
      } else if (node.nodeType === Node.ELEMENT_NODE && node instanceof HTMLElement) {
        if (!isIgnorableFigureElement(node)) {
          elementCandidates.push(node);
        }
      }

      node = walker.nextNode();
    }

    if (textCandidates.length > 0) {
      return direction === "forward"
        ? textCandidates[0]
        : textCandidates[textCandidates.length - 1];
    }

    if (elementCandidates.length > 0) {
      return direction === "forward"
        ? elementCandidates[0]
        : elementCandidates[elementCandidates.length - 1];
    }

    return null;
  }

  function deleteFigureInnerContent(figure, direction) {
    var target = findFigureInnerDeletableTarget(figure, direction);
    if (!(target instanceof Node)) return false;

    var deleted = false;
    if (target.nodeType === Node.TEXT_NODE) {
      var textValue = target.textContent || "";
      if (!textValue.length) return false;
      var textRange = document.createRange();
      if (direction === "forward") {
        textRange.setStart(target, 0);
        textRange.setEnd(target, 1);
      } else {
        textRange.setStart(target, Math.max(0, textValue.length - 1));
        textRange.setEnd(target, textValue.length);
      }
      deleted = deleteRangeWithUndo(textRange);
    } else {
      deleted = deleteNodeWithUndo(target);
    }

    if (!deleted) return false;

    ensureEditorHasParagraphWhenEmpty();
    clearSelectedImage();
    normalizeTypedLineDivToParagraph();
    emitBodyChange();
    captureSelection();
    return true;
  }

  function deleteFigureContentOrFigure(figure, direction) {
    if (!(figure instanceof HTMLElement)) return false;
    if (deleteFigureInnerContent(figure, direction)) return true;
    return deleteFigureElement(figure);
  }

  function deleteFigureElement(figure) {
    if (!(figure instanceof HTMLElement)) return false;
    if (!deleteNodeWithUndo(figure)) return false;

    ensureEditorHasParagraphWhenEmpty();
    clearSelectedImage();
    normalizeTypedLineDivToParagraph();
    emitBodyChange();
    captureSelection();
    return true;
  }

  function deleteImageElement(image) {
    if (!(image instanceof HTMLImageElement)) return false;
    if (!deleteNodeWithUndo(image)) return false;

    ensureEditorHasParagraphWhenEmpty();
    clearSelectedImage();
    normalizeTypedLineDivToParagraph();
    emitBodyChange();
    captureSelection();
    return true;
  }

  function normalizeFormatBlockTag(value) {
    if (typeof value !== "string") return "";
    var normalized = value.trim().toLowerCase();
    if (!normalized) return "";
    if (normalized.startsWith("<") && normalized.endsWith(">")) {
      normalized = normalized.slice(1, -1).trim();
    }
    if (!normalized) return "";
    return normalized;
  }

  function applyFormatBlockBySelection(tagName) {
    if (!editorElement) return false;
    if (!tagName || !/^(p|h1|h2|h3|h4|h5|h6|blockquote)$/.test(tagName)) return false;

    var selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return false;

    var range = selection.getRangeAt(0);
    var commonAncestor =
      range.commonAncestorContainer && range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
        ? range.commonAncestorContainer
        : range.commonAncestorContainer.parentElement;
    if (!isElementInEditor(commonAncestor)) return false;

    var allBlocks = editorElement.querySelectorAll(FORMAT_BLOCK_SELECTOR);
    var blocks = [];
    for (var index = 0; index < allBlocks.length; index += 1) {
      var block = allBlocks[index];
      try {
        if (!range.intersectsNode(block)) continue;
      } catch {
        continue;
      }
      blocks.push(block);
    }

    if (blocks.length === 0) return false;

    for (var blockIndex = 0; blockIndex < blocks.length; blockIndex += 1) {
      var blockToFormat = blocks[blockIndex];
      if (!(blockToFormat instanceof HTMLElement)) continue;
      if (blockToFormat.tagName.toLowerCase() === tagName) continue;

      var replacement = document.createElement(tagName);
      var className = (blockToFormat.getAttribute("class") || "").trim();
      var styleValue = (blockToFormat.getAttribute("style") || "").trim();
      if (className) replacement.setAttribute("class", className);
      if (styleValue) replacement.setAttribute("style", styleValue);

      while (blockToFormat.firstChild) {
        replacement.appendChild(blockToFormat.firstChild);
      }
      blockToFormat.replaceWith(replacement);
    }

    return true;
  }

  function emitBodyChange() {
    if (!state || !editorElement) return;
    post("page-body-change", {
      slug: state.activeSlug,
      bodyHtml: getPersistableEditorHtml()
    });
  }

  function applyStyleVariables(nextStyleVars) {
    if (!previewRoot) return;

    for (var index = 0; index < appliedStyleKeys.length; index += 1) {
      previewRoot.style.removeProperty(appliedStyleKeys[index]);
    }
    appliedStyleKeys = [];

    var entries = Object.entries(nextStyleVars || {});
    for (var entryIndex = 0; entryIndex < entries.length; entryIndex += 1) {
      var entry = entries[entryIndex];
      var key = entry[0];
      var value = entry[1];
      if (!key || value === null || value === undefined) continue;
      previewRoot.style.setProperty(key, String(value));
      appliedStyleKeys.push(key);
    }
  }

  function renderNavigation() {
    if (!navListElement || !state) return;
    navListElement.innerHTML = "";

    var navItems = Array.isArray(state.navItems) ? state.navItems : [];
    for (var index = 0; index < navItems.length; index += 1) {
      var item = navItems[index];
      if (!item || typeof item !== "object") continue;

      var listItem = document.createElement("li");
      listItem.className = "nav__item";

      var link = document.createElement("a");
      link.className = "nav__link" + (state.activeSlug === item.slug ? " is-active" : "");
      link.href = typeof item.href === "string" ? item.href : "#";
      link.textContent = typeof item.label === "string" ? item.label : "Untitled page";
      link.addEventListener("click", function (event) {
        event.preventDefault();
        var nextSlug = this.getAttribute("data-preview-slug") || "";
        if (!nextSlug) return;
        post("active-page-change", {
          slug: nextSlug
        });
      });
      link.setAttribute("data-preview-slug", typeof item.slug === "string" ? item.slug : "");

      listItem.appendChild(link);
      navListElement.appendChild(listItem);
    }
  }

  function renderFooter() {
    if (!footerElement || !footerInnerElement || !state) return;

    var footerState = state.footer || {};
    footerElement.style.display = footerState.disabled ? "none" : "";
    if (footerState.fixed) {
      footerElement.style.position = "sticky";
      footerElement.style.bottom = "0";
      footerElement.style.zIndex = "40";
      footerElement.style.background = "var(--bg)";
    } else {
      footerElement.style.position = "";
      footerElement.style.bottom = "";
      footerElement.style.zIndex = "";
      footerElement.style.background = "";
    }

    var visibleCount = Number.isFinite(footerState.visibleModuleCount)
      ? Math.max(0, Math.min(3, Math.floor(footerState.visibleModuleCount)))
      : 0;
    if (visibleCount > 0) {
      footerInnerElement.style.gridTemplateColumns = "repeat(" + visibleCount + ", minmax(0, 1fr))";
    } else {
      footerInnerElement.style.removeProperty("grid-template-columns");
    }

    footerInnerElement.innerHTML = "";

    var modules = Array.isArray(footerState.modules) ? footerState.modules : [];
    for (var index = 0; index < modules.length; index += 1) {
      var moduleData = modules[index];
      if (!moduleData || typeof moduleData !== "object") continue;

      var moduleElement = document.createElement("p");
      var alignment =
        moduleData.alignment === "left" || moduleData.alignment === "center" || moduleData.alignment === "right"
          ? moduleData.alignment
          : "left";

      moduleElement.className = "footer__module footer__module--" + alignment;
      moduleElement.innerHTML = typeof moduleData.html === "string" ? moduleData.html : "";
      if (moduleData.hidden) {
        moduleElement.style.display = "none";
      }

      footerInnerElement.appendChild(moduleElement);
    }
  }

  function runActivePageScript() {
    if (!state) return;
    var scriptSource = typeof state.activePageJavaScript === "string" ? state.activePageJavaScript.trim() : "";
    var nextKey = state.activeSlug + "::" + scriptSource;
    if (nextKey === lastExecutedScriptKey) return;
    lastExecutedScriptKey = nextKey;

    if (!scriptSource) return;

    try {
      var runner = new Function(scriptSource);
      runner();
    } catch (error) {
      console.error("[builder-preview] Failed to run page script", error);
    }
  }

  function ensureLayout() {
    if (!root) return;
    if (previewRoot) return;

    root.innerHTML =
      '<div class="astro-preview-shell astro-preview-frame"><div class="astro-preview page is-simple">'
      + '<a class="skip-link" href="#astro-preview-main">Skip to content</a>'
      + '<header class="header"><div class="header__inner"><a class="header__brand" href="/">Preview</a><nav class="header__nav" aria-label="Primary"><ul class="nav"></ul></nav></div></header>'
      + '<main id="astro-preview-main" class="page__main"><article class="prose"><div class="astro-editor"></div></article></main>'
      + '<footer class="footer"><div class="footer__inner"></div></footer>'
      + '</div></div>';

    previewRoot = root.querySelector(".astro-preview");
    brandLinkElement = root.querySelector(".header__brand");
    navListElement = root.querySelector(".nav");
    footerElement = root.querySelector(".footer");
    footerInnerElement = root.querySelector(".footer__inner");
    editorElement = root.querySelector(".astro-editor");

    if (brandLinkElement) {
      brandLinkElement.addEventListener("click", function (event) {
        event.preventDefault();
        if (!state) return;
        post("active-page-change", {
          slug: state.homePageSlug
        });
      });
    }

    if (editorElement) {
      editorElement.addEventListener("input", function () {
        if (!state || !state.editable) return;
        normalizeTypedLineDivToParagraph();
        emitBodyChange();
        captureSelection();
      });

      editorElement.addEventListener("click", function (event) {
        if (!state || !state.editable) {
          clearSelectedImage(true);
          emitSelectedElementChange(null);
          return;
        }

        var target = event.target;
        if (target instanceof HTMLImageElement) {
          ensureImageFigure(target);
        }

        captureSelection();
      });

      editorElement.addEventListener("keyup", function () {
        captureSelection();
      });

      editorElement.addEventListener("mouseup", function () {
        captureSelection();
      });

      editorElement.addEventListener("keydown", function (event) {
        if (!state || !state.editable) return;
        if (event.isComposing) return;

        if (event.key === "Enter" && !event.shiftKey) {
          var figcaption = findFigcaptionFromSelection();
          if (figcaption instanceof HTMLElement) {
            var figcaptionFigure = figcaption.closest("figure[data-builder-image-figure='true']");
            if (figcaptionFigure instanceof HTMLElement) {
              event.preventDefault();
              insertParagraphAfterFigure(figcaptionFigure);
              return;
            }
          }

          var figureFromSelection = findFigureFromSelection();
          if (figureFromSelection instanceof HTMLElement) {
            event.preventDefault();
            if (isCaretBeforeFigure(figureFromSelection)) {
              insertParagraphBeforeFigure(figureFromSelection);
            } else {
              insertParagraphAfterFigure(figureFromSelection);
            }
            return;
          }

          event.preventDefault();
          document.execCommand("insertParagraph", false);
          normalizeTypedLineDivToParagraph();
          emitBodyChange();
          captureSelection();
          return;
        }

        if (event.key !== "Backspace" && event.key !== "Delete") return;

        var selectedImage = getSelectedImageElement();
        if (!(selectedImage instanceof HTMLImageElement)) {
          selectedImage = findImageFromSelection();
        }
        if (!(selectedImage instanceof HTMLImageElement)) {
          var deleteDirection = event.key === "Backspace" ? "backward" : "forward";
          var adjacentFigure = findAdjacentFigureFromCaret(
            deleteDirection
          );
          if (adjacentFigure instanceof HTMLElement) {
            event.preventDefault();
            deleteFigureContentOrFigure(adjacentFigure, deleteDirection);
            return;
          }

          if (event.key === "Backspace") {
            var currentTextBlock = findTextBlockFromSelection();
            if (
              currentTextBlock instanceof HTMLElement &&
              isCaretAtStartOfElement(currentTextBlock) &&
              mergeCurrentTextBlockIntoPrevious(currentTextBlock)
            ) {
              event.preventDefault();
              normalizeTypedLineDivToParagraph();
              emitBodyChange();
              captureSelection();
            }
          }
          return;
        }

        var figure = selectedImage.closest("figure[data-builder-image-figure='true']");
        event.preventDefault();

        if (figure instanceof HTMLElement) {
          var selectedDeleteDirection = event.key === "Backspace" ? "backward" : "forward";
          deleteFigureContentOrFigure(figure, selectedDeleteDirection);
          return;
        }

        deleteImageElement(selectedImage);
      });

      ensureExternalImageObserver();
      syncExternalImagesInEditor();
    }

    document.addEventListener("selectionchange", function () {
      captureSelection();
    });
  }

  function applyState(nextState) {
    state = nextState;
    ensureLayout();

    if (!state || !previewRoot || !editorElement) return;

    if (inlineCssStyle) {
      var nextInlineCss = typeof state.previewInlineCss === "string" ? state.previewInlineCss : "";
      if (inlineCssStyle.textContent !== nextInlineCss) {
        inlineCssStyle.textContent = nextInlineCss;
      }
    }

    applyStyleVariables(state.previewStyleVars || {});

    previewRoot.className = "astro-preview page " + (state.styleMode === "advanced" ? "is-advanced" : "is-simple");

    if (brandLinkElement) {
      var brandText =
        state.header && !state.header.disableBrand
          ? (state.header.brandText || "").trim() || (state.previewBrand || "").trim() || "New Astro Site"
          : "";
      brandLinkElement.textContent = brandText || "New Astro Site";
      brandLinkElement.style.display = state.header && state.header.disableBrand ? "none" : "";
    }

    var headerElement = root.querySelector(".header");
    if (headerElement instanceof HTMLElement) {
      headerElement.style.display = state.header && state.header.disabled ? "none" : "";
      if (state.header && state.header.fixed) {
        headerElement.style.position = "sticky";
        headerElement.style.top = "0";
        headerElement.style.zIndex = "40";
        headerElement.style.background = "var(--bg)";
      } else {
        headerElement.style.position = "";
        headerElement.style.top = "";
        headerElement.style.zIndex = "";
        headerElement.style.background = "";
      }
    }

    renderNavigation();
    renderFooter();

    editorElement.contentEditable = state.editable ? "true" : "false";
    editorElement.setAttribute("aria-readonly", state.editable ? "false" : "true");
    editorElement.className = "astro-editor" + (state.editable ? "" : " is-read-only");

    var nextBodyHtml = typeof state.activeBodyHtml === "string" ? state.activeBodyHtml : "";
    var isEditorFocused = document.activeElement === editorElement;
    var shouldApplyBodyHtml =
      state.activeSlug !== lastAppliedBodySlug || nextBodyHtml !== lastAppliedBodyHtml;
    var currentPersistableBodyHtml = "";

    if (shouldApplyBodyHtml && !isEditorFocused) {
      currentPersistableBodyHtml = getPersistableEditorHtml();
    }

    if (
      shouldApplyBodyHtml &&
      !isEditorFocused &&
      currentPersistableBodyHtml !== nextBodyHtml &&
      editorElement.innerHTML !== nextBodyHtml
    ) {
      var preservedSelectedImageId = selectedImageId;
      editorElement.innerHTML = nextBodyHtml;
      var restoredSelectedImage = preservedSelectedImageId
        ? findImageById(preservedSelectedImageId)
        : null;
      if (restoredSelectedImage instanceof HTMLImageElement) {
        emitSelectedImageChange(restoredSelectedImage);
      } else {
        clearSelectedImage(true);
      }
      emitSelectedElementChange(null);
    }

    if (shouldApplyBodyHtml && (!isEditorFocused || editorElement.innerHTML === nextBodyHtml)) {
      lastAppliedBodySlug = state.activeSlug;
      lastAppliedBodyHtml = nextBodyHtml;
    }

    syncExternalImagesInEditor();
    runActivePageScript();
  }

  function applyExecCommand(command, value) {
    if (!state || !state.editable || !editorElement) return;
    editorElement.focus();
    restoreSelection();

    if (command === "insertImage") {
      var source = typeof value === "string" ? value.trim() : "";
      if (!source) return;

      var selection = window.getSelection();
      if (!selection) return;

      if (selection.rangeCount === 0) {
        var fallbackRange = document.createRange();
        fallbackRange.selectNodeContents(editorElement);
        fallbackRange.collapse(false);
        selection.removeAllRanges();
        selection.addRange(fallbackRange);
      }

      var insertAnchor = findImageInsertAnchorTarget();

      var figure = document.createElement("figure");
      var image = document.createElement("img");
      image.setAttribute("src", source);
      figure.appendChild(image);

      var ensuredFigure = ensureImageFigure(image);
      if (!(ensuredFigure instanceof HTMLElement)) return;

      if (
        insertAnchor instanceof HTMLElement &&
        insertAnchor.parentNode
      ) {
        insertAnchor.insertAdjacentElement("afterend", ensuredFigure);
      } else {
        editorElement.appendChild(ensuredFigure);
      }

      processExternalImage(image);

      var paragraph = document.createElement("p");
      paragraph.appendChild(document.createElement("br"));
      ensuredFigure.insertAdjacentElement("afterend", paragraph);
      setCaretAtTextOffset(paragraph, 0);

      clearSelectedImage(true);
      normalizeTypedLineDivToParagraph();
      emitBodyChange();
      captureSelection();
      return;
    }

    if (command === "clearAllFormatting") {
      document.execCommand("removeFormat", false);
      document.execCommand("unlink", false);
      document.execCommand("formatBlock", false, "p");
      document.execCommand("justifyLeft", false);
      normalizeTypedLineDivToParagraph();
      emitBodyChange();
      captureSelection();
      return;
    }

    if (command === "formatBlock") {
      var normalizedTag = normalizeFormatBlockTag(value);
      if (normalizedTag && applyFormatBlockBySelection(normalizedTag)) {
        normalizeTypedLineDivToParagraph();
        emitBodyChange();
        captureSelection();
        return;
      }

      document.execCommand("formatBlock", false, normalizedTag || value);
      normalizeTypedLineDivToParagraph();
      emitBodyChange();
      captureSelection();
      return;
    }

    document.execCommand(command, false, value);
    normalizeTypedLineDivToParagraph();
    emitBodyChange();
    captureSelection();
  }

  function replaceImageSource(previousSrc, nextSrc, aspectRatioOverride) {
    if (!editorElement || !previousSrc) return;

    var images = editorElement.querySelectorAll("img");
    var didUpdate = false;

    for (var index = 0; index < images.length; index += 1) {
      var image = images[index];
      var currentSrc = (image.getAttribute("src") || "").trim();
      var trackedSrc = (image.getAttribute(EXTERNAL_IMAGE_SOURCE_ATTR) || "").trim();
      if (currentSrc !== previousSrc && trackedSrc !== previousSrc) {
        continue;
      }

      if (nextSrc && nextSrc.trim()) {
        image.setAttribute("src", nextSrc);
        image.setAttribute(EXTERNAL_IMAGE_SOURCE_ATTR, nextSrc);
        if (Number.isFinite(aspectRatioOverride) && aspectRatioOverride > 0) {
          image.setAttribute(IMAGE_ASPECT_RATIO_ATTR, String(aspectRatioOverride));
        }
        processExternalImage(image);
        didUpdate = true;
        continue;
      }

      var figure = image.closest("figure[data-builder-image-figure='true']");
      stopTrackingExternalImage(image, false);
      if (figure instanceof HTMLElement) {
        figure.remove();
      } else {
        image.remove();
      }
      didUpdate = true;
    }

    if (!didUpdate) return;

    emitBodyChange();
    captureSelection();

    var selectedImage = getSelectedImageElement();
    if (!(selectedImage instanceof HTMLImageElement)) {
      clearSelectedImage();
    } else {
      emitSelectedImageChange(selectedImage);
    }
  }

  function setImageAspectRatioBySource(source, aspectRatio) {
    if (!editorElement || !source) return;
    if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) return;

    var images = editorElement.querySelectorAll("img");
    for (var index = 0; index < images.length; index += 1) {
      var image = images[index];
      var currentSrc = (image.getAttribute("src") || "").trim();
      var trackedSrc = (image.getAttribute(EXTERNAL_IMAGE_SOURCE_ATTR) || "").trim();
      if (currentSrc !== source && trackedSrc !== source) continue;
      image.setAttribute(IMAGE_ASPECT_RATIO_ATTR, String(aspectRatio));
    }
  }

  function updateSelectedImageAlt(value) {
    var image = getSelectedImageElement();
    if (!(image instanceof HTMLImageElement)) {
      clearSelectedImage();
      return;
    }

    image.setAttribute("alt", value || "");
    emitBodyChange();
    emitSelectedImageChange(image);
  }

  function updateSelectedImageCaption(value) {
    var image = getSelectedImageElement();
    if (!(image instanceof HTMLImageElement)) {
      clearSelectedImage();
      return;
    }

    var figure = ensureImageFigure(image);
    if (!figure) return;

    var caption = figure.querySelector(":scope > figcaption");
    if (caption instanceof HTMLElement) {
      caption.textContent = value || "";
    }

    emitBodyChange();
    emitSelectedImageChange(image);
  }

  function updateSelectedImageSize(value) {
    var image = getSelectedImageElement();
    if (!(image instanceof HTMLImageElement)) {
      clearSelectedImage();
      return;
    }

    var numericValue = Number(value);
    var clamped = Number.isFinite(numericValue) ? Math.max(1, Math.min(100, Math.round(numericValue))) : 100;

    image.style.width = clamped + "%";
    image.style.height = "auto";
    image.style.maxWidth = "100%";

    emitBodyChange();
    emitSelectedImageChange(image);
  }

  function normalizeClassName(value) {
    if (typeof value !== "string") return "";
    var tokens = value.split(/\\s+/);
    var uniqueTokens = [];
    var seen = new Set();
    for (var index = 0; index < tokens.length; index += 1) {
      var token = tokens[index].trim();
      if (!token || seen.has(token)) continue;
      seen.add(token);
      uniqueTokens.push(token);
    }
    return uniqueTokens.join(" ");
  }

  function getInspectableElementForMutation(elementId) {
    if (typeof elementId === "string" && elementId.trim()) {
      return findInspectableElementById(elementId.trim());
    }
    return getSelectedInspectableElement();
  }

  function updateSelectedElementClassName(value, elementId) {
    if (!state || !state.editable) return;
    var element = getInspectableElementForMutation(elementId);
    if (!(element instanceof HTMLElement)) {
      emitSelectedElementChange(getInspectableElementFromSelection());
      return;
    }

    var normalizedClassName = normalizeClassName(value);
    if (normalizedClassName) {
      element.setAttribute("class", normalizedClassName);
    } else {
      element.removeAttribute("class");
    }

    emitBodyChange();
    emitSelectedElementChange(element);
  }

  function updateSelectedElementInlineStyle(value, elementId) {
    if (!state || !state.editable) return;
    var element = getInspectableElementForMutation(elementId);
    if (!(element instanceof HTMLElement)) {
      emitSelectedElementChange(getInspectableElementFromSelection());
      return;
    }

    var nextStyle = typeof value === "string" ? value.trim() : "";
    if (nextStyle) {
      element.setAttribute("style", nextStyle);
    } else {
      element.removeAttribute("style");
    }

    emitBodyChange();
    emitSelectedElementChange(element);
  }

  function handleCommand(payload) {
    if (!payload || typeof payload !== "object") return;

    if (payload.kind === "execCommand") {
      applyExecCommand(payload.command, payload.value);
      return;
    }

    if (payload.kind === "focusEditor") {
      if (editorElement) editorElement.focus();
      return;
    }

    if (payload.kind === "captureSelection") {
      captureSelection();
      return;
    }

    if (payload.kind === "replaceImageSource") {
      replaceImageSource(payload.previousSrc, payload.nextSrc, payload.aspectRatioOverride);
      return;
    }

    if (payload.kind === "setImageAspectRatioBySource") {
      setImageAspectRatioBySource(payload.source, payload.aspectRatio);
      return;
    }

    if (payload.kind === "updateSelectedImageAlt") {
      updateSelectedImageAlt(payload.value);
      return;
    }

    if (payload.kind === "updateSelectedImageCaption") {
      updateSelectedImageCaption(payload.value);
      return;
    }

    if (payload.kind === "updateSelectedImageSize") {
      updateSelectedImageSize(payload.value);
      return;
    }

    if (payload.kind === "updateSelectedElementClassName") {
      updateSelectedElementClassName(payload.value, payload.elementId);
      return;
    }

    if (payload.kind === "updateSelectedElementInlineStyle") {
      updateSelectedElementInlineStyle(payload.value, payload.elementId);
      return;
    }

    if (payload.kind === "clearSelectedImage") {
      clearSelectedImage();
    }
  }

  function handleMessage(event) {
    var message = event.data;
    if (!message || typeof message !== "object") return;
    if (message.channel !== CHANNEL || typeof message.type !== "string") return;

    if (message.type === "init") {
      var initPayload = message.payload && typeof message.payload === "object" ? message.payload : {};
      bridgeToken = typeof initPayload.token === "string" ? initPayload.token : "";
      post("ready", {});
      return;
    }

    if (!bridgeToken || message.token !== bridgeToken) return;

    if (message.type === "state") {
      var statePayload = message.payload && typeof message.payload === "object" ? message.payload : {};
      applyState(statePayload.state || statePayload);
      return;
    }

    if (message.type === "command") {
      handleCommand(message.payload);
    }
  }

  window.addEventListener("message", handleMessage);
})();
`;

const buildPreviewFrameSrcDoc = () => {
  const runtimeScript = escapeInlineTagContent(
    buildPreviewFrameRuntimeScript(PREVIEW_BRIDGE_CHANNEL, PREVIEW_IMAGE_ASPECT_RATIO_ATTR)
  );
  const baseStyles = escapeInlineTagContent(siteBuilderStylesRaw);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>${baseStyles}</style>
    <style>
      html,
      body {
        margin: 0;
        padding: 0;
        height: 100%;
      }

      body {
        background: transparent;
      }

      #astro-preview-frame-root {
        height: 100%;
      }

      .astro-preview-frame {
        height: 100%;
      }
    </style>
    <style id="preview-inline-css"></style>
  </head>
  <body>
    <div id="astro-preview-frame-root"></div>
    <script>${runtimeScript}</script>
  </body>
</html>`;
};

const footerModuleAlignmentFallback: Array<"left" | "center" | "right"> = ["left", "center", "right"];

const AstroTemplatePreview = forwardRef<AstroTemplatePreviewHandle, AstroTemplatePreviewProps>(
  function AstroTemplatePreview(
    {
      editable,
      previewBrand,
      pages,
      draftImages,
      repoFontsCss,
      tokensCss,
      styleMode,
      advancedStructureCss,
      previewStylesCss,
      homeFallbackBody,
      activePageSlug,
      publishedSiteBaseUrl,
      previewAssetBaseUrl,
      header,
      footer,
      onActivePageChange,
      onPageBodyChange,
      onSelectedImageChange,
      onSelectedElementChange
    },
    ref
  ) {
    const frameRef = useRef<HTMLIFrameElement | null>(null);
    const bridgeStateRef = useRef({
      token: createBridgeToken(),
      isReady: false
    });
    const srcDoc = useMemo(() => buildPreviewFrameSrcDoc(), []);

    const parsedPages = useMemo<ParsedPage[]>(
      () =>
        pages.map((page, index) => {
          const safeSlug =
            page.isHome ? "home" : normalizePageSlug(page.slug || page.title) || `page-${index + 1}`;
          return {
            ...page,
            safeSlug
          };
        }),
      [pages]
    );

    const homePage = useMemo<ParsedPage>(
      () =>
        parsedPages.find((page) => page.isHome || page.safeSlug === "home") ?? {
          title: "Home",
          slug: "home",
          body: homeFallbackBody,
          javascript: "",
          showInNav: false,
          isHome: true,
          safeSlug: "home"
        },
      [homeFallbackBody, parsedPages]
    );

    const navItems = useMemo(() => {
      const combined = parsedPages
        .filter((page) => page.showInNav !== false)
        .map((page) => ({
          label: page.title.trim() || "Untitled page",
          slug: page.safeSlug,
          href: page.safeSlug === homePage.safeSlug ? "/" : `/${page.safeSlug}`
        }));

      const seen = new Set<string>();
      return combined.filter((item) => {
        if (seen.has(item.href)) return false;
        seen.add(item.href);
        return true;
      });
    }, [homePage.safeSlug, parsedPages]);

    const allPageSlugs = useMemo(
      () => new Set([homePage.safeSlug, ...parsedPages.map((page) => page.safeSlug)]),
      [homePage.safeSlug, parsedPages]
    );

    const activeSlug = allPageSlugs.has(activePageSlug) ? activePageSlug : homePage.safeSlug;

    const activePage = useMemo(
      () => parsedPages.find((page) => page.safeSlug === activeSlug) ?? homePage,
      [activeSlug, homePage, parsedPages]
    );

    const activeBodyRaw =
      activePage.safeSlug === homePage.safeSlug
        ? (activePage.body || "").trim() || homeFallbackBody
        : (activePage.body || "").trim();

    const activeBodyHtml = useMemo(() => markdownToHtml(activeBodyRaw), [activeBodyRaw]);

    const displayBodyHtml = useMemo(
      () => mapHtmlImageSources(activeBodyHtml, draftImages, publishedSiteBaseUrl, "display"),
      [activeBodyHtml, draftImages, publishedSiteBaseUrl]
    );

    const effectivePreviewCss = useMemo(() => {
      if (styleMode === "advanced") {
        const advancedCss = advancedStructureCss.trim();
        return advancedCss || previewStylesCss.trim();
      }
      return previewStylesCss.trim();
    }, [advancedStructureCss, previewStylesCss, styleMode]);

    const previewStyle = useMemo(
      () => extractStyleVariables(effectivePreviewCss) as CSSProperties,
      [effectivePreviewCss]
    );

    const previewStyleVars = useMemo(() => {
      const styleRecord = previewStyle as Record<string, unknown>;
      const result: Record<string, string> = {};

      Object.entries(styleRecord).forEach(([key, value]) => {
        if (!key) return;
        if (typeof value === "string" || typeof value === "number") {
          result[key] = String(value);
        }
      });

      return result;
    }, [previewStyle]);

    const previewInlineCss = useMemo(() => {
      const baseCss =
        styleMode === "advanced"
          ? effectivePreviewCss
          : extractCustomCssFromTokens(tokensCss).trim();
      const combinedCss = [repoFontsCss.trim(), baseCss.trim()].filter(Boolean).join("\n\n");
      const rewrittenCss = rewriteCssUrlsForPreview(combinedCss, previewAssetBaseUrl);
      return scopePreviewCss(rewrittenCss);
    }, [effectivePreviewCss, previewAssetBaseUrl, repoFontsCss, styleMode, tokensCss]);

    const currentYear = new Date().getFullYear();
    const footerCopyright = `© ${currentYear}`;

    const normalizedFooterModules = useMemo(() => {
      const normalized = Array.isArray(footer.modules)
        ? footer.modules
            .slice(0, 3)
            .map((module, index) => {
              const fallbackAlignment = footerModuleAlignmentFallback[index] ?? "left";
              if (!module || typeof module !== "object") {
                return {
                  content: "",
                  alignment: fallbackAlignment
                };
              }
              const record = module as Record<string, unknown>;
              const alignment =
                record.alignment === "left" ||
                record.alignment === "center" ||
                record.alignment === "right"
                  ? record.alignment
                  : fallbackAlignment;
              return {
                content: typeof record.content === "string" ? record.content : "",
                alignment
              };
            })
        : [];

      while (normalized.length < 3) {
        const fallbackAlignment = footerModuleAlignmentFallback[normalized.length] ?? "left";
        normalized.push({
          content: "",
          alignment: fallbackAlignment
        });
      }

      return normalized;
    }, [footer.modules]);

    const footerModulesForFrame = useMemo<PreviewFooterModule[]>(() => {
      const renderFooterSegmentsToHtml = (line: string) =>
        parseFooterLineSegments(line)
          .map((segment) => {
            if (segment.type === "link") {
              const href = segment.href?.trim() ?? "";
              if (!href) return "";
              return `<a class="footer__link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(segment.text)}</a>`;
            }
            return `<span>${escapeHtml(segment.text)}</span>`;
          })
          .join("");

      return normalizedFooterModules.map((module) => {
        const resolvedModule = module.content
          .replaceAll("%copyright%", footerCopyright)
          .replace(/\r/g, "");
        const html = resolvedModule
          .split("\n")
          .map((line) => renderFooterSegmentsToHtml(line))
          .join("<br />");

        return {
          alignment: module.alignment,
          html,
          hidden: module.content.trim().length === 0
        };
      });
    }, [footerCopyright, normalizedFooterModules]);

    const visibleFooterModuleCount = footerModulesForFrame.filter((module) => !module.hidden).length;

    const frameState = useMemo<PreviewFrameState>(
      () => ({
        editable,
        styleMode,
        previewStyleVars,
        previewInlineCss,
        previewBrand,
        homePageSlug: homePage.safeSlug,
        activeSlug,
        activeBodyHtml: displayBodyHtml,
        activePageJavaScript: (activePage.javascript ?? "").trim(),
        navItems,
        header,
        footer: {
          disabled: footer.disabled,
          fixed: footer.fixed,
          modules: footerModulesForFrame,
          visibleModuleCount: Math.min(3, visibleFooterModuleCount)
        }
      }),
      [
        activePage.javascript,
        activeSlug,
        displayBodyHtml,
        editable,
        footer.disabled,
        footer.fixed,
        footerModulesForFrame,
        header,
        homePage.safeSlug,
        navItems,
        previewBrand,
        previewInlineCss,
        previewStyleVars,
        styleMode,
        visibleFooterModuleCount
      ]
    );

    const postMessageToFrame = useCallback((message: PreviewBridgeMessage) => {
      const target = frameRef.current?.contentWindow;
      if (!target) return;
      target.postMessage(message, "*");
    }, []);

    const sendStateToFrame = useCallback(() => {
      const { token, isReady } = bridgeStateRef.current;
      if (!isReady) return;
      postMessageToFrame({
        channel: PREVIEW_BRIDGE_CHANNEL,
        type: "state",
        token,
        payload: {
          state: frameState
        }
      });
    }, [frameState, postMessageToFrame]);

    const sendCommandToFrame = useCallback(
      (payload: PreviewCommandPayload) => {
        const { token, isReady } = bridgeStateRef.current;
        if (!isReady) return;
        postMessageToFrame({
          channel: PREVIEW_BRIDGE_CHANNEL,
          type: "command",
          token,
          payload
        });
      },
      [postMessageToFrame]
    );

    const initializeBridge = useCallback(() => {
      const token = createBridgeToken();
      bridgeStateRef.current = {
        token,
        isReady: false
      };
      postMessageToFrame({
        channel: PREVIEW_BRIDGE_CHANNEL,
        type: "init",
        payload: {
          token
        }
      });
    }, [postMessageToFrame]);

    useEffect(() => {
      sendStateToFrame();
    }, [sendStateToFrame]);

    useEffect(() => {
      const handleMessage = (event: MessageEvent) => {
        const frameWindow = frameRef.current?.contentWindow;
        if (!frameWindow || event.source !== frameWindow) return;

        const data = event.data as PreviewBridgeMessage;
        if (!data || typeof data !== "object") return;
        if (data.channel !== PREVIEW_BRIDGE_CHANNEL || typeof data.type !== "string") return;

        const { token } = bridgeStateRef.current;

        if (data.type === "ready") {
          if (data.token !== token) return;
          bridgeStateRef.current.isReady = true;
          sendStateToFrame();
          return;
        }

        if (data.token !== token) return;

        if (data.type === "active-page-change") {
          const payload = data.payload as { slug?: string } | undefined;
          const nextSlug = payload?.slug?.trim();
          if (!nextSlug) return;
          onActivePageChange(nextSlug);
          return;
        }

        if (data.type === "page-body-change") {
          const payload = data.payload as { slug?: string; bodyHtml?: string } | undefined;
          const slug = payload?.slug?.trim();
          if (!slug) return;
          const bodyHtml = typeof payload?.bodyHtml === "string" ? payload.bodyHtml : "";
          const normalizedBody = mapHtmlImageSources(
            bodyHtml,
            draftImages,
            publishedSiteBaseUrl,
            "persist"
          );
          onPageBodyChange(slug, normalizedBody);
          return;
        }

        if (data.type === "selected-image-change") {
          const payload = data.payload as { selectedImage?: PreviewSelectedImage | null } | undefined;
          const selectedImage = payload?.selectedImage ?? null;
          onSelectedImageChange?.(selectedImage);
          return;
        }

        if (data.type === "selected-element-change") {
          const payload = data.payload as
            | { selectedElement?: PreviewSelectedElement | null }
            | undefined;
          const selectedElement = payload?.selectedElement ?? null;
          onSelectedElementChange?.(selectedElement);
        }
      };

      window.addEventListener("message", handleMessage);
      return () => {
        window.removeEventListener("message", handleMessage);
      };
    }, [
      draftImages,
      onActivePageChange,
      onPageBodyChange,
      onSelectedElementChange,
      onSelectedImageChange,
      publishedSiteBaseUrl,
      sendStateToFrame
    ]);

    useImperativeHandle(
      ref,
      () => ({
        execCommand: (command: string, value?: string) => {
          sendCommandToFrame({
            kind: "execCommand",
            command,
            value
          });
        },
        focusEditor: () => {
          sendCommandToFrame({ kind: "focusEditor" });
        },
        captureSelection: () => {
          sendCommandToFrame({ kind: "captureSelection" });
        },
        replaceImageSource: (
          previousSrc: string,
          nextSrc: string | null,
          aspectRatioOverride?: number
        ) => {
          sendCommandToFrame({
            kind: "replaceImageSource",
            previousSrc,
            nextSrc,
            aspectRatioOverride
          });
        },
        setImageAspectRatioBySource: (source: string, aspectRatio: number) => {
          sendCommandToFrame({
            kind: "setImageAspectRatioBySource",
            source,
            aspectRatio
          });
        },
        updateSelectedImageAlt: (value: string) => {
          sendCommandToFrame({
            kind: "updateSelectedImageAlt",
            value
          });
        },
        updateSelectedImageCaption: (value: string) => {
          sendCommandToFrame({
            kind: "updateSelectedImageCaption",
            value
          });
        },
        updateSelectedImageSize: (value: number) => {
          sendCommandToFrame({
            kind: "updateSelectedImageSize",
            value
          });
        },
        updateSelectedElementClassName: (value: string, elementId?: string) => {
          sendCommandToFrame({
            kind: "updateSelectedElementClassName",
            value,
            elementId
          });
        },
        updateSelectedElementInlineStyle: (value: string, elementId?: string) => {
          sendCommandToFrame({
            kind: "updateSelectedElementInlineStyle",
            value,
            elementId
          });
        },
        clearSelectedImage: () => {
          sendCommandToFrame({
            kind: "clearSelectedImage"
          });
        }
      }),
      [sendCommandToFrame]
    );

    return (
      <iframe
        ref={frameRef}
        className="astro-preview-iframe"
        sandbox="allow-scripts"
        srcDoc={srcDoc}
        title="Builder preview"
        onLoad={initializeBridge}
      />
    );
  }
);

export default AstroTemplatePreview;
