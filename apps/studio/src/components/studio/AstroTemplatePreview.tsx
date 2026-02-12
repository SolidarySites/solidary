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
import { slugify } from "../../studio/utils";
import type { DraftImageAsset, FooterOptions, HeaderOptions } from "./site-builder/types";

type PreviewPage = {
  id?: string;
  title: string;
  slug: string;
  body: string;
  showInNav?: boolean;
  isHome?: boolean;
};

type AstroTemplatePreviewProps = {
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

      if (publishedBaseUrl && currentSrc.startsWith("/images/uploads/")) {
        imageElement.setAttribute("src", toPublishedUrl(publishedBaseUrl, currentSrc));
      }
      return;
    }

    if (publishedBaseUrl && currentSrc.startsWith(`${publishedBaseUrl}/images/uploads/`)) {
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
        const safeSlug = page.isHome ? "home" : slugify(page.slug || page.title) || `page-${index + 1}`;
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
      .map((image, index) => `${index}:${(image.getAttribute("src") ?? "").trim()}`)
      .join("|");
  }, [displayBodyHtml]);

  const previewStyle = useMemo(
    () => extractCssVariables(tokensCss) as CSSProperties,
    [tokensCss]
  );

  const currentYear = new Date().getFullYear();
  const copyrightName = footer.copyrightName.trim() || previewBrand.trim() || "Site";
  const footerCustomText = footer.customText.trim();

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
        ensureImageFigure(image);
        syncFigureCaptionLayout(image);
      };

      if (image.complete && image.naturalWidth > 0) {
        syncImageLayout();
        return;
      }

      image.addEventListener("load", syncImageLayout, { once: true });
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
        src: image.getAttribute("src")?.trim() ?? "",
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

  const handleEditorClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
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
        src: target.getAttribute("src")?.trim() ?? "",
        alt: target.getAttribute("alt") ?? "",
        caption: getImageCaptionText(target),
        sizePercent: parseImageSizePercent(target)
      });
      captureSelection();
    },
    [activeSlug, captureSelection, ensureImageFigure]
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
      if (!editor) return;
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
      updateSelectedImageAlt,
      updateSelectedImageCaption,
      updateSelectedImageSize
    ]
  );

  const handleEditorInput = () => {
    normalizeTypedLineDivToParagraph();
    persistEditorContent();
    captureSelection();
  };

  const handleEditorKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "Enter" || event.nativeEvent.isComposing) return;

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
    [captureSelection, findFigcaptionFromSelection, persistEditorContent]
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
              className="astro-editor"
              contentEditable
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
          <div className="footer__inner">
            <p
              className="footer__meta"
              style={footer.disableCopyright ? { display: "none" } : undefined}
            >
              {`© ${currentYear} ${copyrightName}`}
            </p>

            <div className="footer__links">
              {footer.customLinks.map((link) => (
                <a
                  key={`${link.label}-${link.url}`}
                  className="footer__link"
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {link.label}
                </a>
              ))}
            </div>
            {footerCustomText && <p className="footer__meta">{footerCustomText}</p>}
          </div>
        </footer>
      </div>
    </div>
  );
  }
);

export default AstroTemplatePreview;
