import {
  useCallback,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent
} from "react";
import { normalizePageSlug } from "../services/utils";
import type { DraftImageAsset, FooterOptions, HeaderOptions } from "../services/types";
import {
  EXTERNAL_IMAGE_PLACEHOLDER_SRC,
  EXTERNAL_IMAGE_SOURCE_ATTR,
  getTrackedExternalImageSource,
  normalizeExternalImageForPersistence
} from "../../../../../lib/external-image-loading";

type PreviewPage = {
  id?: string;
  title: string;
  slug: string;
  body: string;
  showInNav?: boolean;
  isHome?: boolean;
};

type AstroTemplatePreviewProps = {
  editable: boolean;
  previewBrand: string;
  pages: PreviewPage[];
  draftImages: DraftImageAsset[];
  tokensCss: string;
  homeFallbackBody: string;
  activePageSlug: string;
  publishedSiteBaseUrl: string | null;
  header: HeaderOptions;
  footer: FooterOptions;
  onActivePageChange: (slug: string) => void;
  onPageBodyChange: (slug: string, body: string) => void;
  onSelectedImageChange?: (selectedImage: PreviewSelectedImage | null) => void;
};

export type PreviewSelectedImage = {
  pageSlug: string;
  id: string;
  src: string;
  alt: string;
  caption: string;
  sizePercent: number;
};

export type AstroTemplatePreviewHandle = {
  execCommand: (command: string, value?: string) => void;
  focusEditor: () => void;
  captureSelection: () => void;
  replaceImageSource: (previousSrc: string, nextSrc: string | null) => void;
  updateSelectedImageAlt: (value: string) => void;
  updateSelectedImageCaption: (value: string) => void;
  updateSelectedImageSize: (value: number) => void;
  clearSelectedImage: () => void;
};

type ParsedPage = PreviewPage & {
  safeSlug: string;
};

type SelectedImageState = {
  pageSlug: string;
  id: string;
  src: string;
  alt: string;
  caption: string;
  sizePercent: number;
};

type FooterSegment = {
  type: "text" | "link";
  text: string;
  href?: string;
};

const extractCssVariables = (tokensCss: string) => {
  const variables: Record<string, string> = {};
  const rootMatch = tokensCss.match(/:root\s*{([\s\S]*?)}/);
  const source = rootMatch?.[1] ?? tokensCss;

  const variablePattern = /(--[a-zA-Z0-9-_]+)\s*:\s*([^;]+);/g;
  for (const match of source.matchAll(variablePattern)) {
    const key = match[1]?.trim();
    const value = match[2]?.trim();
    if (!key || !value) continue;
    variables[key] = value;
  }

  return variables;
};

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

const formatInlineMarkdown = (value: string) =>
  escapeHtml(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/_([^_]+)_/g, "<em>$1</em>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");

const htmlTagPattern = /<\/?[a-z][\s\S]*>/i;

const markdownToHtml = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (htmlTagPattern.test(trimmed)) return trimmed;

  const lines = trimmed.replace(/\r/g, "").split("\n");
  const chunks: string[] = [];
  let paragraphBuffer: string[] = [];
  let listBuffer: string[] = [];
  let codeBuffer: string[] | null = null;

  const flushParagraph = () => {
    if (!paragraphBuffer.length) return;
    chunks.push(`<p>${paragraphBuffer.map(formatInlineMarkdown).join("<br />")}</p>`);
    paragraphBuffer = [];
  };

  const flushList = () => {
    if (!listBuffer.length) return;
    chunks.push(
      `<ul>${listBuffer.map((item) => `<li>${formatInlineMarkdown(item)}</li>`).join("")}</ul>`
    );
    listBuffer = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (codeBuffer) {
      if (line.startsWith("```")) {
        chunks.push(`<pre><code>${escapeHtml(codeBuffer.join("\n"))}</code></pre>`);
        codeBuffer = null;
      } else {
        codeBuffer.push(rawLine);
      }
      continue;
    }

    if (line.startsWith("```")) {
      flushParagraph();
      flushList();
      codeBuffer = [];
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const level = Math.min(heading[1].length, 3);
      const tag = `h${level}`;
      chunks.push(`<${tag}>${formatInlineMarkdown(heading[2].trim())}</${tag}>`);
      continue;
    }

    const listItem = line.match(/^\s*[-*]\s+(.+)$/);
    if (listItem) {
      flushParagraph();
      listBuffer.push(listItem[1].trim());
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    if (listBuffer.length) flushList();
    paragraphBuffer.push(line.trim());
  }

  if (codeBuffer) {
    chunks.push(`<pre><code>${escapeHtml(codeBuffer.join("\n"))}</code></pre>`);
  }
  flushParagraph();
  flushList();

  return chunks.join("\n");
};

const normalizeSitePath = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
};

const normalizePublishedBaseUrl = (value: string | null) => {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "";
  return trimmed.replace(/\/$/, "");
};

const toPublishedUrl = (baseUrl: string, sitePath: string) => {
  if (!baseUrl) return sitePath;
  return `${baseUrl}${normalizeSitePath(sitePath)}`;
};

const clampImageSizePercent = (value: number) => {
  if (Number.isNaN(value)) return 100;
  return Math.min(100, Math.max(1, Math.round(value)));
};

const footerMarkdownLinkPattern = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/;
const footerBareUrlPattern = /https?:\/\/[^\s)]+/;
const footerPipeLinkPattern = /^\s*([^|\n]+?)\s*\|\s*(https?:\/\/[^\s)]+)\s*$/;

const parseFooterLineSegments = (line: string): FooterSegment[] => {
  const pipeLinkMatch = line.match(footerPipeLinkPattern);
  if (pipeLinkMatch) {
    return [
      {
        type: "link",
        text: pipeLinkMatch[1].trim() || pipeLinkMatch[2],
        href: pipeLinkMatch[2]
      }
    ];
  }

  const segments: FooterSegment[] = [];
  let remaining = line;

  while (remaining.length) {
    const markdownMatch = remaining.match(footerMarkdownLinkPattern);
    const bareUrlMatch = remaining.match(footerBareUrlPattern);

    const markdownIndex = markdownMatch?.index ?? -1;
    const bareUrlIndex = bareUrlMatch?.index ?? -1;

    const useMarkdown =
      markdownIndex !== -1 && (bareUrlIndex === -1 || markdownIndex <= bareUrlIndex);
    const useBareUrl = !useMarkdown && bareUrlIndex !== -1;

    if (!useMarkdown && !useBareUrl) {
      segments.push({ type: "text", text: remaining });
      remaining = "";
      break;
    }

    const matchIndex = useMarkdown ? markdownIndex : bareUrlIndex;
    if (matchIndex > 0) {
      segments.push({
        type: "text",
        text: remaining.slice(0, matchIndex)
      });
    }

    if (useMarkdown && markdownMatch) {
      segments.push({
        type: "link",
        text: markdownMatch[1],
        href: markdownMatch[2]
      });
      remaining = remaining.slice(matchIndex + markdownMatch[0].length);
      continue;
    }

    if (useBareUrl && bareUrlMatch) {
      segments.push({
        type: "link",
        text: bareUrlMatch[0],
        href: bareUrlMatch[0]
      });
      remaining = remaining.slice(matchIndex + bareUrlMatch[0].length);
      continue;
    }
  }

  if (!segments.length) {
    segments.push({ type: "text", text: "" });
  }

  return segments;
};

const IMAGE_ALIGN_WRAPPER_ATTR = "data-builder-image-align-wrapper";
const IMAGE_FIGURE_ATTR = "data-builder-image-figure";
const NON_PARAGRAPH_BLOCK_SELECTOR =
  "p,h1,h2,h3,h4,h5,h6,ul,ol,li,blockquote,pre,table,figure,section,article,header,footer,nav,main,aside";

const getNodeElement = (node: Node | null) => {
  if (!node) return null;
  return node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
};

const getTextOffsetWithinRangeContainer = (container: HTMLElement, range: Range) => {
  const offsetRange = range.cloneRange();
  offsetRange.selectNodeContents(container);
  offsetRange.setEnd(range.endContainer, range.endOffset);
  return offsetRange.toString().length;
};

const setCaretAtTextOffset = (container: HTMLElement, offset: number) => {
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

const parseImageSizePercent = (image: HTMLImageElement) => {
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

const getDirectFigcaption = (figure: HTMLElement) =>
  Array.from(figure.children).find((child) => child instanceof HTMLElement && child.tagName === "FIGCAPTION") as
    | HTMLElement
    | undefined;

const getImageCaptionText = (image: HTMLImageElement) => {
  const figure = image.closest("figure");
  if (!(figure instanceof HTMLElement)) return "";
  return getDirectFigcaption(figure)?.textContent ?? "";
};

const mapHtmlImageSources = (
  html: string,
  draftImages: DraftImageAsset[],
  publishedSiteBaseUrl: string | null,
  mode: "display" | "persist"
) => {
  const pageImagesPrefix = "/solidary-media/images/pages/";
  if (!html.trim()) return html;

  const bySitePath = new Map<string, DraftImageAsset>();
  const byPublicUrl = new Map<string, DraftImageAsset>();
  draftImages.forEach((image) => {
    const sitePath = normalizeSitePath(image.sitePath);
    const publicUrl = image.publicUrl.trim();
    if (sitePath) bySitePath.set(sitePath, image);
    if (publicUrl) byPublicUrl.set(publicUrl, image);
  });

  const publishedBaseUrl = normalizePublishedBaseUrl(publishedSiteBaseUrl);
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  wrapper.querySelectorAll("img[src]").forEach((imageElement) => {
    const currentSrc = imageElement.getAttribute("src")?.trim();
    if (!currentSrc) return;

    if (mode === "display") {
      const byPath = bySitePath.get(normalizeSitePath(currentSrc));
      if (byPath) {
        imageElement.setAttribute("src", byPath.publicUrl);
        return;
      }

      if (publishedBaseUrl && currentSrc.startsWith(pageImagesPrefix)) {
        imageElement.setAttribute("src", toPublishedUrl(publishedBaseUrl, currentSrc));
      }
      return;
    }

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

  return wrapper.innerHTML;
};

const AstroTemplatePreview = forwardRef<AstroTemplatePreviewHandle, AstroTemplatePreviewProps>(
  function AstroTemplatePreview(
    {
      editable,
      previewBrand,
      pages,
      draftImages,
      tokensCss,
      homeFallbackBody,
      activePageSlug,
      publishedSiteBaseUrl,
      header,
      footer,
      onActivePageChange,
      onPageBodyChange,
      onSelectedImageChange
    },
    ref
  ) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const savedSelectionRef = useRef<Range | null>(null);
  const selectedImageElementRef = useRef<HTMLImageElement | null>(null);
  const [selectedImage, setSelectedImage] = useState<SelectedImageState | null>(null);

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
  const selectedImageForActiveSlug =
    selectedImage && selectedImage.pageSlug === activeSlug ? selectedImage : null;

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
  const displayImageSignature = useMemo(() => {
    if (!displayBodyHtml.trim()) return "";
    const wrapper = document.createElement("div");
    wrapper.innerHTML = displayBodyHtml;
    return Array.from(wrapper.querySelectorAll("img"))
      .map((image, index) => `${index}:${getTrackedExternalImageSource(image)}`)
      .join("|");
  }, [displayBodyHtml]);

  const previewStyle = useMemo(
    () => extractCssVariables(tokensCss) as CSSProperties,
    [tokensCss]
  );

  const currentYear = new Date().getFullYear();
  const footerCopyright = `© ${currentYear}`;
  const footerModules = useMemo(() => {
    const footerAlignmentFallback: Array<"left" | "center" | "right"> = [
      "left",
      "center",
      "right"
    ];
    const normalized = Array.isArray(footer.modules)
      ? footer.modules
          .slice(0, 3)
          .map((module, index) => {
            const fallbackAlignment = footerAlignmentFallback[index] ?? "left";
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
      const fallbackAlignment = footerAlignmentFallback[normalized.length] ?? "left";
      normalized.push({
        content: "",
        alignment: fallbackAlignment
      });
    }
    return normalized;
  }, [footer.modules]);
  const visibleFooterModuleCount = footerModules.filter((module) => module.content.trim().length > 0).length;
  const footerInnerStyle =
    visibleFooterModuleCount > 0
      ? ({
          gridTemplateColumns: `repeat(${Math.min(3, visibleFooterModuleCount)}, minmax(0, 1fr))`
        } as CSSProperties)
      : undefined;

  const findImageById = useCallback((imageId: string) => {
    const editor = editorRef.current;
    if (!editor) return null;
    const images = Array.from(editor.querySelectorAll("img"));
    return (
      images.find((image) => image.getAttribute("data-builder-image-id") === imageId) ??
      null
    );
  }, []);

  const ensureImageFigure = useCallback((image: HTMLImageElement) => {
    const existingFigure = image.closest("figure");
    const figure =
      existingFigure instanceof HTMLElement
        ? existingFigure
        : document.createElement("figure");

    if (!(existingFigure instanceof HTMLElement)) {
      const parent = image.parentElement;
      if (parent) {
        parent.insertBefore(figure, image);
      }
      figure.appendChild(image);
    }

    figure.setAttribute(IMAGE_FIGURE_ATTR, "true");
    if (!figure.style.display) figure.style.display = "block";
    if (!figure.style.maxWidth) figure.style.maxWidth = "100%";
    if (!figure.style.margin) figure.style.margin = "0";
    if (!image.style.display) image.style.display = "inline-block";
    if (!image.style.maxWidth) image.style.maxWidth = "100%";
    if (!image.style.height) image.style.height = "auto";
    const figcaption = getDirectFigcaption(figure);
    if (figcaption) {
      if (!figcaption.style.textAlign) figcaption.style.textAlign = "left";
    } else {
      const createdFigcaption = document.createElement("figcaption");
      createdFigcaption.style.textAlign = "left";
      figure.appendChild(createdFigcaption);
    }

    return figure;
  }, []);

  const syncFigureCaptionLayout = useCallback((image: HTMLImageElement) => {
    const currentSrc = image.getAttribute("src")?.trim() ?? "";
    const trackedSource = getTrackedExternalImageSource(image);
    const isPlaceholderImage =
      currentSrc === EXTERNAL_IMAGE_PLACEHOLDER_SRC && trackedSource !== currentSrc;
    if (isPlaceholderImage) return;

    const figure = image.closest(`figure[${IMAGE_FIGURE_ATTR}="true"]`);
    if (!(figure instanceof HTMLElement)) return;
    const figcaption = getDirectFigcaption(figure);
    if (!figcaption) return;

    const figureRect = figure.getBoundingClientRect();
    const imageRect = image.getBoundingClientRect();
    if (imageRect.width <= 0 || figureRect.width <= 0) return;

    const leftWithinFigure = Math.max(0, imageRect.left - figureRect.left);
    figcaption.style.display = "block";
    figcaption.style.width = `${Math.round(imageRect.width)}px`;
    figcaption.style.maxWidth = "100%";
    figcaption.style.marginLeft = `${Math.round(leftWithinFigure)}px`;
  }, []);

  const normalizeEditorImages = useCallback((editor: HTMLDivElement) => {
    editor.querySelectorAll("img").forEach((image) => {
      ensureImageFigure(image);
      syncFigureCaptionLayout(image);
    });
  }, [ensureImageFigure, syncFigureCaptionLayout]);

  const getPersistableEditorHtml = useCallback((editor: HTMLDivElement) => {
    const clone = editor.cloneNode(true);
    if (!(clone instanceof HTMLDivElement)) return editor.innerHTML;

    clone.querySelectorAll("img").forEach((image) => {
      normalizeExternalImageForPersistence(image);
    });

    clone
      .querySelectorAll(`figure[${IMAGE_FIGURE_ATTR}="true"] > figcaption`)
      .forEach((figcaption) => {
        if (!(figcaption instanceof HTMLElement)) return;
        figcaption.style.removeProperty("width");
        figcaption.style.removeProperty("max-width");
        figcaption.style.removeProperty("margin-left");
        figcaption.style.removeProperty("display");
      });

    return clone.innerHTML;
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (editor.innerHTML !== displayBodyHtml) {
      const currentDisplayEquivalent = mapHtmlImageSources(
        getPersistableEditorHtml(editor),
        draftImages,
        publishedSiteBaseUrl,
        "display"
      );
      if (currentDisplayEquivalent === displayBodyHtml) {
        return;
      }
      editor.innerHTML = displayBodyHtml;
      normalizeEditorImages(editor);
      savedSelectionRef.current = null;
      selectedImageElementRef.current = null;
    }
  }, [
    activeSlug,
    displayBodyHtml,
    draftImages,
    getPersistableEditorHtml,
    normalizeEditorImages,
    publishedSiteBaseUrl
  ]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    let frameId: number | null = window.requestAnimationFrame(() => {
      frameId = null;
      if (editorRef.current !== editor) return;
      normalizeEditorImages(editor);
    });

    const removeLoadListeners: Array<() => void> = [];
    editor.querySelectorAll("img").forEach((image) => {
      const syncImageLayout = () => {
        if (!editor.contains(image)) return;
        const currentSrc = image.getAttribute("src")?.trim() ?? "";
        const trackedSource = getTrackedExternalImageSource(image);
        if (currentSrc === EXTERNAL_IMAGE_PLACEHOLDER_SRC && trackedSource !== currentSrc) {
          return;
        }
        ensureImageFigure(image);
        syncFigureCaptionLayout(image);

        image.removeEventListener("load", syncImageLayout);
      };

      const currentSrc = image.getAttribute("src")?.trim() ?? "";
      const trackedSource = getTrackedExternalImageSource(image);
      const isPlaceholderImage =
        currentSrc === EXTERNAL_IMAGE_PLACEHOLDER_SRC && trackedSource !== currentSrc;

      if (image.complete && image.naturalWidth > 0 && !isPlaceholderImage) {
        syncImageLayout();
        return;
      }

      image.addEventListener("load", syncImageLayout);
      removeLoadListeners.push(() => image.removeEventListener("load", syncImageLayout));
    });

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      removeLoadListeners.forEach((remove) => remove());
    };
  }, [
    activeSlug,
    displayImageSignature,
    ensureImageFigure,
    normalizeEditorImages,
    syncFigureCaptionLayout
  ]);

  const normalizeTypedLineDivToParagraph = useCallback(() => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection || selection.rangeCount === 0) return;

    const activeRange = selection.getRangeAt(0);
    const activeElement = getNodeElement(activeRange.startContainer);
    if (!activeElement || !editor.contains(activeElement)) return;

    const lineDiv = activeElement.closest("div");
    if (!(lineDiv instanceof HTMLDivElement)) return;
    if (lineDiv.parentElement !== editor) return;
    if (lineDiv.getAttribute(IMAGE_ALIGN_WRAPPER_ATTR) === "true") return;
    if (!lineDiv.textContent?.trim()) return;
    if (lineDiv.querySelector("img,video,svg,iframe,object,embed,canvas")) return;
    if (lineDiv.querySelector(NON_PARAGRAPH_BLOCK_SELECTOR)) return;

    const caretOffset = selection.isCollapsed
      ? getTextOffsetWithinRangeContainer(lineDiv, activeRange)
      : null;

    const paragraph = document.createElement("p");
    Array.from(lineDiv.attributes).forEach((attribute) => {
      paragraph.setAttribute(attribute.name, attribute.value);
    });

    while (lineDiv.firstChild) {
      paragraph.appendChild(lineDiv.firstChild);
    }
    lineDiv.replaceWith(paragraph);

    if (caretOffset !== null) {
      setCaretAtTextOffset(paragraph, caretOffset);
    }
  }, []);

  const persistEditorContent = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    normalizeEditorImages(editor);
    const persistableHtml = getPersistableEditorHtml(editor);
    const normalizedBody = mapHtmlImageSources(
      persistableHtml,
      draftImages,
      publishedSiteBaseUrl,
      "persist"
    );
    onPageBodyChange(activeSlug, normalizedBody);
    setSelectedImage((current) => {
      if (!current) {
        selectedImageElementRef.current = null;
        return current;
      }
      const image = findImageById(current.id);
      if (!image) {
        selectedImageElementRef.current = null;
        return null;
      }
      selectedImageElementRef.current = image;
      return {
        pageSlug: current.pageSlug,
        id: current.id,
        src: getTrackedExternalImageSource(image),
        alt: image.getAttribute("alt") ?? "",
        caption: getImageCaptionText(image),
        sizePercent: parseImageSizePercent(image)
      };
    });
  }, [
    activeSlug,
    draftImages,
    findImageById,
    getPersistableEditorHtml,
    normalizeEditorImages,
    onPageBodyChange,
    publishedSiteBaseUrl
  ]);

  const captureSelection = useCallback(() => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    const commonAncestor =
      range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
        ? (range.commonAncestorContainer as Element)
        : range.commonAncestorContainer.parentElement;

    if (!commonAncestor || !editor.contains(commonAncestor)) return;
    savedSelectionRef.current = range.cloneRange();
  }, []);

  const replaceImageSource = useCallback(
    (previousSrc: string, nextSrc: string | null) => {
      const normalizedPreviousSrc = previousSrc.trim();
      if (!normalizedPreviousSrc) return;

      const editor = editorRef.current;
      if (!editor) return;

      const normalizedNextSrc = nextSrc?.trim() ?? "";
      let didUpdate = false;

      editor.querySelectorAll("img").forEach((image) => {
        const currentSrc = image.getAttribute("src")?.trim() ?? "";
        const trackedSrc = getTrackedExternalImageSource(image);
        if (currentSrc !== normalizedPreviousSrc && trackedSrc !== normalizedPreviousSrc) {
          return;
        }

        if (normalizedNextSrc) {
          image.setAttribute("src", normalizedNextSrc);
          image.setAttribute(EXTERNAL_IMAGE_SOURCE_ATTR, normalizedNextSrc);
          didUpdate = true;
          return;
        }

        const figure = image.closest(`figure[${IMAGE_FIGURE_ATTR}="true"]`);
        if (figure instanceof HTMLElement) {
          figure.remove();
        } else {
          image.remove();
        }
        didUpdate = true;
      });

      if (!didUpdate) return;

      persistEditorContent();
      captureSelection();
    },
    [captureSelection, persistEditorContent]
  );

  const handleEditorClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (!editable) {
        selectedImageElementRef.current = null;
        setSelectedImage(null);
        return;
      }
      const target = event.target;
      if (!(target instanceof HTMLImageElement)) {
        selectedImageElementRef.current = null;
        setSelectedImage(null);
        return;
      }

      let imageId = target.getAttribute("data-builder-image-id")?.trim() ?? "";
      if (!imageId) {
        imageId = crypto.randomUUID();
        target.setAttribute("data-builder-image-id", imageId);
      }
      ensureImageFigure(target);
      selectedImageElementRef.current = target;

      setSelectedImage({
        pageSlug: activeSlug,
        id: imageId,
        src: getTrackedExternalImageSource(target),
        alt: target.getAttribute("alt") ?? "",
        caption: getImageCaptionText(target),
        sizePercent: parseImageSizePercent(target)
      });
      captureSelection();
    },
    [activeSlug, captureSelection, editable, ensureImageFigure]
  );

  const updateSelectedImageAlt = useCallback(
    (nextAlt: string) => {
      if (!selectedImage) return;
      if (selectedImage.pageSlug !== activeSlug) return;
      const image = findImageById(selectedImage.id);
      if (!image) {
        setSelectedImage(null);
        return;
      }
      image.setAttribute("alt", nextAlt);
      setSelectedImage({
        ...selectedImage,
        alt: nextAlt
      });
      persistEditorContent();
      captureSelection();
    },
    [activeSlug, captureSelection, findImageById, persistEditorContent, selectedImage]
  );

  const updateSelectedImageSize = useCallback(
    (nextSizePercent: number) => {
      if (!selectedImage) return;
      if (selectedImage.pageSlug !== activeSlug) return;
      const image = findImageById(selectedImage.id);
      if (!image) {
        setSelectedImage(null);
        return;
      }
      const clampedSize = clampImageSizePercent(nextSizePercent);
      image.style.width = `${clampedSize}%`;
      image.style.height = "auto";
      image.style.maxWidth = "100%";
      setSelectedImage({
        ...selectedImage,
        sizePercent: clampedSize
      });
      persistEditorContent();
      captureSelection();
    },
    [activeSlug, captureSelection, findImageById, persistEditorContent, selectedImage]
  );

  const updateSelectedImageCaption = useCallback(
    (nextCaption: string) => {
      if (!selectedImage) return;
      if (selectedImage.pageSlug !== activeSlug) return;
      const image = findImageById(selectedImage.id);
      if (!image) {
        setSelectedImage(null);
        return;
      }

      const figure = ensureImageFigure(image);
      const figcaption = getDirectFigcaption(figure);
      if (figcaption) {
        figcaption.textContent = nextCaption;
      }

      setSelectedImage({
        ...selectedImage,
        caption: nextCaption
      });
      persistEditorContent();
      captureSelection();
    },
    [
      activeSlug,
      captureSelection,
      ensureImageFigure,
      findImageById,
      persistEditorContent,
      selectedImage
    ]
  );

  const ensureImageAlignmentWrapper = useCallback((image: HTMLImageElement) => {
    const figure = ensureImageFigure(image);
    const parent = image.parentElement;

    if (
      parent instanceof HTMLDivElement &&
      parent.getAttribute(IMAGE_ALIGN_WRAPPER_ATTR) === "true" &&
      parent.parentElement === figure
    ) {
      parent.style.width = "100%";
      parent.style.display = "block";
      image.style.display = "inline-block";
      image.style.textAlign = "";
      image.removeAttribute("align");
      return parent;
    }

    const wrapper = document.createElement("div");
    wrapper.setAttribute(IMAGE_ALIGN_WRAPPER_ATTR, "true");
    wrapper.style.width = "100%";
    wrapper.style.display = "block";
    wrapper.style.textAlign = "left";
    image.style.display = "inline-block";
    image.style.textAlign = "";
    image.removeAttribute("align");

    if (parent) {
      parent.insertBefore(wrapper, image);
      wrapper.appendChild(image);
    } else {
      figure.insertBefore(wrapper, figure.firstChild);
      wrapper.appendChild(image);
    }

    return wrapper;
  }, [ensureImageFigure]);

  const findImageFromSelection = useCallback(() => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection || selection.rangeCount === 0) return null;

    const range = selection.getRangeAt(0);
    const nodesToCheck: Node[] = [
      range.commonAncestorContainer,
      range.startContainer,
      range.endContainer
    ];

    for (const node of nodesToCheck) {
      if (!node) continue;
      const element = node instanceof Element ? node : node.parentElement;
      if (!element) continue;
      if (!editor.contains(element)) continue;

      if (element instanceof HTMLImageElement) {
        return element;
      }

      const imageFromWrapper = element
        .closest(`[${IMAGE_ALIGN_WRAPPER_ATTR}="true"]`)
        ?.querySelector("img");
      if (imageFromWrapper instanceof HTMLImageElement && editor.contains(imageFromWrapper)) {
        return imageFromWrapper;
      }

      const nearestImage = element.closest("img");
      if (nearestImage instanceof HTMLImageElement && editor.contains(nearestImage)) {
        return nearestImage;
      }
    }

    const intersectingImage = Array.from(editor.querySelectorAll("img")).find((image) => {
      try {
        return range.intersectsNode(image);
      } catch {
        return false;
      }
    });
    if (intersectingImage) return intersectingImage;

    return null;
  }, []);

  const findFigcaptionFromSelection = useCallback(() => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection || selection.rangeCount === 0) return null;

    const range = selection.getRangeAt(0);
    const nodesToCheck: Node[] = [
      range.commonAncestorContainer,
      range.startContainer,
      range.endContainer
    ];

    for (const node of nodesToCheck) {
      if (!node) continue;
      const element = node instanceof Element ? node : node.parentElement;
      if (!element || !editor.contains(element)) continue;

      const figcaption = element.closest("figcaption");
      if (!(figcaption instanceof HTMLElement)) continue;
      const figure = figcaption.closest("figure");
      if (figure?.getAttribute(IMAGE_FIGURE_ATTR) === "true") {
        return figcaption;
      }
    }

    return null;
  }, []);

  const applySelectedFigcaptionAlignment = useCallback(
    (command: string) => {
      if (!["justifyLeft", "justifyCenter", "justifyRight"].includes(command)) return false;
      const figcaption = findFigcaptionFromSelection();
      if (!figcaption) return false;

      if (command === "justifyLeft") {
        figcaption.style.textAlign = "left";
      } else if (command === "justifyCenter") {
        figcaption.style.textAlign = "center";
      } else {
        figcaption.style.textAlign = "right";
      }

      persistEditorContent();
      captureSelection();
      return true;
    },
    [captureSelection, findFigcaptionFromSelection, persistEditorContent]
  );

  const applySelectedImageAlignment = useCallback(
    (command: string) => {
      if (!["justifyLeft", "justifyCenter", "justifyRight"].includes(command)) return false;
      let image: HTMLImageElement | null = null;
      const editor = editorRef.current;

      const selectedImageElement = selectedImageElementRef.current;
      if (selectedImageElement && editor?.contains(selectedImageElement)) {
        image = selectedImageElement;
      }

      if (!image && selectedImage?.pageSlug === activeSlug) {
        image = findImageById(selectedImage.id);
      }

      if (!image) {
        image = findImageFromSelection();
      }

      if (!image) return false;
      selectedImageElementRef.current = image;

      const wrapper = ensureImageAlignmentWrapper(image);
      if (command === "justifyLeft") {
        wrapper.style.textAlign = "left";
      } else if (command === "justifyCenter") {
        wrapper.style.textAlign = "center";
      } else {
        wrapper.style.textAlign = "right";
      }

      persistEditorContent();
      captureSelection();
      return true;
    },
    [
      activeSlug,
      captureSelection,
      ensureImageAlignmentWrapper,
      findImageById,
      findImageFromSelection,
      persistEditorContent,
      selectedImage
    ]
  );

  const removeSelectedImageFigure = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return false;

    let image: HTMLImageElement | null = null;
    const selectedImageElement = selectedImageElementRef.current;
    if (selectedImageElement && editor.contains(selectedImageElement)) {
      image = selectedImageElement;
    }

    if (!image && selectedImage?.pageSlug === activeSlug) {
      image = findImageById(selectedImage.id);
    }

    if (!image) {
      image = findImageFromSelection();
    }

    if (!image) return false;
    const figure = image.closest(`figure[${IMAGE_FIGURE_ATTR}="true"]`);
    if (!(figure instanceof HTMLElement)) return false;

    const paragraph = document.createElement("p");
    paragraph.appendChild(document.createElement("br"));
    figure.insertAdjacentElement("afterend", paragraph);
    figure.remove();
    setCaretAtTextOffset(paragraph, 0);

    selectedImageElementRef.current = null;
    setSelectedImage(null);
    persistEditorContent();
    captureSelection();
    return true;
  }, [
    activeSlug,
    captureSelection,
    findImageById,
    findImageFromSelection,
    persistEditorContent,
    selectedImage
  ]);

  const restoreSelection = useCallback(() => {
    const selection = window.getSelection();
    const editor = editorRef.current;
    const savedSelection = savedSelectionRef.current;
    if (!selection || !editor || !savedSelection) return;

    try {
      selection.removeAllRanges();
      selection.addRange(savedSelection.cloneRange());
    } catch {
      savedSelectionRef.current = null;
    }
  }, []);

  useEffect(() => {
    const handleSelectionChange = () => {
      captureSelection();
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
    };
  }, [captureSelection]);

  const executeCommand = useCallback(
    (command: string, value?: string) => {
      const editor = editorRef.current;
      if (!editor || !editable) return;
      editor.focus();
      restoreSelection();
      if (applySelectedFigcaptionAlignment(command)) {
        return;
      }
      if (applySelectedImageAlignment(command)) {
        return;
      }
      if (command === "clearAllFormatting") {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
          return;
        }

        const range = selection.getRangeAt(0);
        const commonAncestor =
          range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
            ? (range.commonAncestorContainer as Element)
            : range.commonAncestorContainer.parentElement;

        if (!commonAncestor || !editor.contains(commonAncestor)) {
          return;
        }

        document.execCommand("removeFormat", false);
        document.execCommand("unlink", false);
        document.execCommand("formatBlock", false, "p");
        document.execCommand("justifyLeft", false);
        persistEditorContent();
        captureSelection();
        return;
      }
      document.execCommand(command, false, value);
      persistEditorContent();
      captureSelection();
    },
    [
      editable,
      applySelectedFigcaptionAlignment,
      applySelectedImageAlignment,
      captureSelection,
      persistEditorContent,
      restoreSelection
    ]
  );

  useImperativeHandle(
    ref,
    () => ({
      execCommand: executeCommand,
      focusEditor: () => editorRef.current?.focus(),
      captureSelection,
      replaceImageSource,
      updateSelectedImageAlt,
      updateSelectedImageCaption,
      updateSelectedImageSize,
      clearSelectedImage: () => {
        selectedImageElementRef.current = null;
        setSelectedImage(null);
      }
    }),
    [
      captureSelection,
      executeCommand,
      replaceImageSource,
      updateSelectedImageAlt,
      updateSelectedImageCaption,
      updateSelectedImageSize
    ]
  );

  const handleEditorInput = () => {
    if (!editable) return;
    normalizeTypedLineDivToParagraph();
    persistEditorContent();
    captureSelection();
  };

  const handleEditorKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (!editable) return;
      if (event.nativeEvent.isComposing) return;

      if (event.key === "Backspace" || event.key === "Delete") {
        const figcaption = findFigcaptionFromSelection();
        if (figcaption) return;
        if (removeSelectedImageFigure()) {
          event.preventDefault();
        }
        return;
      }

      if (event.key !== "Enter") return;

      const figcaption = findFigcaptionFromSelection();
      if (!figcaption) return;

      const figure = figcaption.closest(`figure[${IMAGE_FIGURE_ATTR}="true"]`);
      const parent = figure?.parentElement;
      if (!(figure instanceof HTMLElement) || !parent) return;

      event.preventDefault();
      const paragraph = document.createElement("p");
      paragraph.appendChild(document.createElement("br"));
      figure.insertAdjacentElement("afterend", paragraph);
      setCaretAtTextOffset(paragraph, 0);

      selectedImageElementRef.current = null;
      setSelectedImage(null);
      persistEditorContent();
      captureSelection();
    },
    [
      editable,
      captureSelection,
      findFigcaptionFromSelection,
      persistEditorContent,
      removeSelectedImageFigure
    ]
  );

  useEffect(() => {
    onSelectedImageChange?.(selectedImageForActiveSlug);
  }, [onSelectedImageChange, selectedImageForActiveSlug]);

  return (
    <div className="astro-preview-shell">
      <div className="astro-preview" style={previewStyle}>
        <a
          className="skip-link"
          href="#astro-preview-main"
          onClick={(event) => event.preventDefault()}
        >
          Skip to content
        </a>

        <header
          className="header"
          style={
            header.disabled
              ? { display: "none" }
              : header.fixed
                ? { position: "sticky", top: 0, zIndex: 40, background: "var(--bg)" }
                : undefined
          }
        >
          <div className="header__inner">
            <a
              className="header__brand"
              href="/"
              style={header.disableBrand ? { display: "none" } : undefined}
              onClick={(event) => {
                event.preventDefault();
                onActivePageChange(homePage.safeSlug);
              }}
            >
              {header.brandText.trim() || previewBrand.trim() || "New Astro Site"}
            </a>

            <nav className="header__nav" aria-label="Primary">
              <ul className="nav">
                {navItems.map((item) => (
                  <li className="nav__item" key={item.href}>
                    <a
                      className={`nav__link ${activeSlug === item.slug ? "is-active" : ""}`}
                      href={item.href}
                      onClick={(event) => {
                        event.preventDefault();
                        onActivePageChange(item.slug);
                      }}
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </header>

        <main id="astro-preview-main" className="page__main">
          <article className="prose">
            <div
              ref={editorRef}
              className={`astro-editor ${editable ? "" : "is-read-only"}`.trim()}
              contentEditable={editable}
              aria-readonly={!editable}
              suppressContentEditableWarning
              onInput={handleEditorInput}
              onClick={handleEditorClick}
              onKeyDown={handleEditorKeyDown}
              onMouseUp={captureSelection}
              onKeyUp={captureSelection}
            />
          </article>
        </main>

        <footer
          className="footer"
          style={
            footer.disabled
              ? { display: "none" }
              : footer.fixed
                ? { position: "sticky", bottom: 0, zIndex: 40, background: "var(--bg)" }
                : undefined
          }
        >
          <div className="footer__inner" style={footerInnerStyle}>
            {footerModules.map((module, moduleIndex) => {
              const resolvedModule = module.content
                .replaceAll("%copyright%", footerCopyright)
                .replace(/\r/g, "");
              const lines = resolvedModule.split("\n");
              const alignmentClass = `footer__module--${module.alignment}`;
              const isEmptyModule = module.content.trim().length === 0;
              return (
                <p
                  key={`footer-module-${moduleIndex}`}
                  className={`footer__module ${alignmentClass}`}
                  style={isEmptyModule ? { display: "none" } : undefined}
                >
                  {lines.map((line, lineIndex) => (
                    <span key={`footer-module-${moduleIndex}-line-${lineIndex}`}>
                      {parseFooterLineSegments(line).map((segment, segmentIndex) =>
                        segment.type === "link" ? (
                          <a
                            key={`footer-module-${moduleIndex}-line-${lineIndex}-segment-${segmentIndex}`}
                            className="footer__link"
                            href={segment.href}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {segment.text}
                          </a>
                        ) : (
                          <span key={`footer-module-${moduleIndex}-line-${lineIndex}-segment-${segmentIndex}`}>
                            {segment.text}
                          </span>
                        )
                      )}
                      {lineIndex < lines.length - 1 && <br />}
                    </span>
                  ))}
                </p>
              );
            })}
          </div>
        </footer>
      </div>
    </div>
  );
  }
);

export default AstroTemplatePreview;
