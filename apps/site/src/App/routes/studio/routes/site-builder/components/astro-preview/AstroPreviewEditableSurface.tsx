import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent
} from "react";
import type { DraftImageAsset } from "../../services/types";
import {
  EXTERNAL_IMAGE_PLACEHOLDER_SRC,
  EXTERNAL_IMAGE_SOURCE_ATTR,
  getTrackedExternalImageSource,
  normalizeExternalImageForPersistence
} from "../../../../../../lib/external-image-loading";
import {
  IMAGE_ALIGN_WRAPPER_ATTR,
  IMAGE_FIGURE_ATTR,
  NON_PARAGRAPH_BLOCK_SELECTOR,
  ensureImageAspectRatioMetadata,
  getDirectFigcaption,
  getImageCaptionText,
  getNodeElement,
  getTextOffsetWithinRangeContainer,
  parseImageSizePercent,
  setCaretAtTextOffset,
  setImageAspectRatioMetadata
} from "./image-dom-utils";
import {
  managedImageSyncedAttrs,
  mapHtmlImageSources,
  parseInertHtmlTemplate
} from "./image-source-utils";
import type {
  AstroTemplatePreviewHandle,
  PreviewSelectedImage,
  SelectedImageState
} from "./types";

type AstroPreviewEditableSurfaceProps = {
  editable: boolean;
  activeSlug: string;
  draftImages: DraftImageAsset[];
  publishedSiteBaseUrl: string | null;
  displayBodyHtml: string;
  displayImageSignature: string;
  onPageBodyChange: (slug: string, body: string) => void;
  onSelectedImageChange?: (selectedImage: PreviewSelectedImage | null) => void;
};

const clampImageSizePercent = (value: number) => {
  if (Number.isNaN(value)) return 100;
  return Math.min(100, Math.max(1, Math.round(value)));
};

const AstroPreviewEditableSurface = forwardRef<AstroTemplatePreviewHandle, AstroPreviewEditableSurfaceProps>(
  function AstroPreviewEditableSurface(
    {
      editable,
      activeSlug,
      draftImages,
      publishedSiteBaseUrl,
      displayBodyHtml,
      displayImageSignature,
      onPageBodyChange,
      onSelectedImageChange
    },
    ref
  ) {
    const editorRef = useRef<HTMLDivElement | null>(null);
    const savedSelectionRef = useRef<Range | null>(null);
    const selectedImageElementRef = useRef<HTMLImageElement | null>(null);
    const localHydrationGuardRef = useRef<{ slug: string; expiresAt: number } | null>(null);
    const [selectedImage, setSelectedImage] = useState<SelectedImageState | null>(null);

    const selectedImageForActiveSlug =
      selectedImage && selectedImage.pageSlug === activeSlug ? selectedImage : null;
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
    ensureImageAspectRatioMetadata(image);
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
    const template = parseInertHtmlTemplate(editor.innerHTML);

    template.content.querySelectorAll("img").forEach((image) => {
      normalizeExternalImageForPersistence(image);
    });

    template.content
      .querySelectorAll(`figure[${IMAGE_FIGURE_ATTR}="true"] > figcaption`)
      .forEach((figcaption) => {
        if (!(figcaption instanceof HTMLElement)) return;
        figcaption.style.removeProperty("width");
        figcaption.style.removeProperty("max-width");
        figcaption.style.removeProperty("margin-left");
        figcaption.style.removeProperty("display");
      });

    return template.innerHTML;
  }, []);

  const syncEditorManagedImageAttributes = useCallback((editor: HTMLDivElement, html: string) => {
    const mappedDisplayTemplate = parseInertHtmlTemplate(html);
    const mappedImages = Array.from(mappedDisplayTemplate.content.querySelectorAll("img"));
    const editorImages = Array.from(editor.querySelectorAll("img"));

    editorImages.forEach((editorImage, index) => {
      const mappedImage = mappedImages[index];
      if (!mappedImage) {
        managedImageSyncedAttrs.forEach((attribute) => {
          editorImage.removeAttribute(attribute);
        });
        return;
      }

      managedImageSyncedAttrs.forEach((attribute) => {
        const nextValue = mappedImage.getAttribute(attribute)?.trim() ?? "";
        if (nextValue) {
          editorImage.setAttribute(attribute, nextValue);
        } else {
          editorImage.removeAttribute(attribute);
        }
      });
    });
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
        syncEditorManagedImageAttributes(editor, displayBodyHtml);
        return;
      }

      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
      const localHydrationGuard = localHydrationGuardRef.current;
      const isLocalHydrationGuardActive =
        localHydrationGuard !== null &&
        localHydrationGuard.slug === activeSlug &&
        localHydrationGuard.expiresAt >= now;
      const isEditorFocused = document.activeElement === editor;

      if (editable && (isEditorFocused || isLocalHydrationGuardActive)) {
        syncEditorManagedImageAttributes(editor, displayBodyHtml);
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
    editable,
    getPersistableEditorHtml,
    normalizeEditorImages,
    publishedSiteBaseUrl,
    syncEditorManagedImageAttributes
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
        ensureImageAspectRatioMetadata(image);
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
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    localHydrationGuardRef.current = {
      slug: activeSlug,
      expiresAt: now + 1500
    };
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
    (previousSrc: string, nextSrc: string | null, aspectRatioOverride?: number) => {
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

        ensureImageAspectRatioMetadata(image, aspectRatioOverride);
        if (normalizedNextSrc) {
          image.setAttribute("src", normalizedNextSrc);
          image.setAttribute(EXTERNAL_IMAGE_SOURCE_ATTR, normalizedNextSrc);
          ensureImageAspectRatioMetadata(image, aspectRatioOverride);
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

  const setImageAspectRatioBySource = useCallback((source: string, aspectRatio: number) => {
    const normalizedSource = source.trim();
    if (!normalizedSource) return;
    if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) return;
    const editor = editorRef.current;
    if (!editor) return;

    editor.querySelectorAll("img").forEach((image) => {
      const currentSrc = image.getAttribute("src")?.trim() ?? "";
      const trackedSrc = getTrackedExternalImageSource(image);
      if (currentSrc !== normalizedSource && trackedSrc !== normalizedSource) {
        return;
      }
      setImageAspectRatioMetadata(image, aspectRatio);
    });
  }, []);

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
      setImageAspectRatioBySource,
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
      setImageAspectRatioBySource,
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
  );
  }
);

export default AstroPreviewEditableSurface;
