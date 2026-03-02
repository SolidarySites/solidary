import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type RefObject
} from "react";
import AstroTemplatePreview, {
  type AstroTemplatePreviewHandle,
  type PreviewSelectedImage
} from "./AstroTemplatePreview";
import type {
  BuilderPage,
  BuilderStylesMode,
  DraftImageAsset,
  FooterOptions,
  HeaderOptions
} from "../services/types";

type BuilderPreviewPanelProps = {
  shouldLoadDraft: boolean;
  isDraftLoading: boolean;
  draftLoadError: string | null;
  canEditContent: boolean;
  showStylesHoverInspector: boolean;
  readOnlyMessage?: string | null;
  previewRef: RefObject<AstroTemplatePreviewHandle | null>;
  previewBrand: string;
  pages: BuilderPage[];
  draftImages: DraftImageAsset[];
  tokensCss: string;
  styleMode: BuilderStylesMode;
  advancedStructureCss: string;
  previewStylesCss: string;
  homeFallbackBody: string;
  activePreviewSlug: string;
  publishedSiteBaseUrl: string | null;
  header: HeaderOptions;
  footer: FooterOptions;
  onActivePreviewSlugChange: (slug: string) => void;
  onPageBodyChange: (safeSlug: string, body: string) => void;
  onSelectedImageChange: (selectedImage: PreviewSelectedImage | null) => void;
};

type HoverInspectorState = {
  selector: string;
  idValue: string;
  classValue: string;
  left: number;
  top: number;
};

type HoverInspectorCopyState = "idle" | "copied" | "error";

const HOVER_INSPECTOR_CLASS = "builder-hover-inspector";

const normalizeClassNames = (value: string) =>
  [...new Set(value.split(/\s+/).map((token) => token.trim()).filter(Boolean))];

const escapeCssSelectorToken = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(trimmed);
  }
  return trimmed.replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character}`);
};

const resolveElementSelector = (element: Element) => {
  const idValue = element.getAttribute("id")?.trim() ?? "";
  const classValue = element.getAttribute("class")?.trim() ?? "";
  const classNames = normalizeClassNames(classValue);
  if (!idValue && classNames.length === 0) return null;

  const idSelector = idValue ? `#${escapeCssSelectorToken(idValue)}` : "";
  const classSelector = classNames.map((token) => `.${escapeCssSelectorToken(token)}`).join("");

  return {
    selector: `${idSelector}${classSelector}`,
    idValue,
    classValue: classNames.join(" ")
  };
};

const fallbackCopyToClipboard = (value: string) => {
  const input = document.createElement("textarea");
  input.value = value;
  input.setAttribute("readonly", "true");
  input.style.position = "fixed";
  input.style.opacity = "0";
  input.style.pointerEvents = "none";
  document.body.appendChild(input);
  input.select();
  const copied = document.execCommand("copy");
  input.remove();
  return copied;
};

const BuilderPreviewPanel = ({
  shouldLoadDraft,
  isDraftLoading,
  draftLoadError,
  canEditContent,
  showStylesHoverInspector,
  readOnlyMessage,
  previewRef,
  previewBrand,
  pages,
  draftImages,
  tokensCss,
  styleMode,
  advancedStructureCss,
  previewStylesCss,
  homeFallbackBody,
  activePreviewSlug,
  publishedSiteBaseUrl,
  header,
  footer,
  onActivePreviewSlugChange,
  onPageBodyChange,
  onSelectedImageChange
}: BuilderPreviewPanelProps) => {
  const previewShellRef = useRef<HTMLDivElement | null>(null);
  const copyStateResetTimeoutRef = useRef<number | null>(null);
  const [hoverInspector, setHoverInspector] = useState<HoverInspectorState | null>(null);
  const [copyState, setCopyState] = useState<HoverInspectorCopyState>("idle");

  const clearHoverInspector = useCallback(() => {
    setHoverInspector((current) => (current ? null : current));
    setCopyState((current) => (current === "idle" ? current : "idle"));
  }, []);

  const scheduleCopyStateReset = useCallback(() => {
    if (copyStateResetTimeoutRef.current !== null) {
      window.clearTimeout(copyStateResetTimeoutRef.current);
    }
    copyStateResetTimeoutRef.current = window.setTimeout(() => {
      copyStateResetTimeoutRef.current = null;
      setCopyState("idle");
    }, 1400);
  }, []);

  useEffect(
    () => () => {
      if (copyStateResetTimeoutRef.current !== null) {
        window.clearTimeout(copyStateResetTimeoutRef.current);
      }
    },
    []
  );

  useEffect(() => {
    if (!showStylesHoverInspector || isDraftLoading || Boolean(draftLoadError)) {
      clearHoverInspector();
    }
  }, [clearHoverInspector, draftLoadError, isDraftLoading, showStylesHoverInspector]);

  const handleShellMouseMove = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (!showStylesHoverInspector) return;

    const shell = previewShellRef.current;
    if (!shell) return;

    const pointedElement = document.elementFromPoint(event.clientX, event.clientY);
    if (!(pointedElement instanceof Element)) {
      clearHoverInspector();
      return;
    }

    if (pointedElement.closest(`.${HOVER_INSPECTOR_CLASS}`)) {
      return;
    }

    const previewRoot = shell.querySelector(".astro-preview");
    if (!(previewRoot instanceof Element) || !previewRoot.contains(pointedElement)) {
      clearHoverInspector();
      return;
    }

    const selectorData = resolveElementSelector(pointedElement);
    if (!selectorData) {
      clearHoverInspector();
      return;
    }

    const shellRect = shell.getBoundingClientRect();
    const elementRect = pointedElement.getBoundingClientRect();
    const rawLeft = elementRect.left - shellRect.left + 8;
    const rawTop = elementRect.top - shellRect.top + 8;
    const clampedLeft = Math.min(Math.max(rawLeft, 8), Math.max(8, shellRect.width - 24));
    const clampedTop = Math.min(Math.max(rawTop, 8), Math.max(8, shellRect.height - 24));

    setHoverInspector((current) => {
      const next = {
        selector: selectorData.selector,
        idValue: selectorData.idValue,
        classValue: selectorData.classValue,
        left: Math.round(clampedLeft),
        top: Math.round(clampedTop)
      };

      if (
        current &&
        current.selector === next.selector &&
        current.idValue === next.idValue &&
        current.classValue === next.classValue &&
        current.left === next.left &&
        current.top === next.top
      ) {
        return current;
      }

      return next;
    });
    setCopyState((current) => (current === "idle" ? current : "idle"));
  }, [clearHoverInspector, showStylesHoverInspector]);

  const handleCopySelector = useCallback(async (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const selector = hoverInspector?.selector ?? "";
    if (!selector) return;

    let copied = false;
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(selector);
        copied = true;
      }
    } catch {
      copied = false;
    }

    if (!copied) {
      try {
        copied = fallbackCopyToClipboard(selector);
      } catch {
        copied = false;
      }
    }

    setCopyState(copied ? "copied" : "error");
    scheduleCopyStateReset();
  }, [hoverInspector?.selector, scheduleCopyStateReset]);

  const copyLabel = useMemo(() => {
    if (copyState === "copied") return "Copied";
    if (copyState === "error") return "Retry";
    return "Copy";
  }, [copyState]);

  return (
    <div
      ref={previewShellRef}
      className="builder-preview-shell"
      onMouseMove={showStylesHoverInspector ? handleShellMouseMove : undefined}
      onMouseLeave={showStylesHoverInspector ? clearHoverInspector : undefined}
    >
      <section className="builder-panel">
        {!isDraftLoading && !draftLoadError && readOnlyMessage && (
          <div className="builder-preview-readonly-note">{readOnlyMessage}</div>
        )}

        {shouldLoadDraft && isDraftLoading && (
          <div className="provisioning">
            <div className="spinner" />
            <h2>Loading draft preview</h2>
            <p>Preparing your saved site content...</p>
          </div>
        )}

        {!isDraftLoading && draftLoadError && (
          <div className="provisioning">
            <h2>Unable to load draft</h2>
            <p>{draftLoadError}</p>
          </div>
        )}

        {!isDraftLoading && !draftLoadError && (
          <AstroTemplatePreview
            ref={previewRef}
            editable={canEditContent}
            previewBrand={previewBrand}
            pages={pages}
            draftImages={draftImages}
            tokensCss={tokensCss}
            styleMode={styleMode}
            advancedStructureCss={advancedStructureCss}
            previewStylesCss={previewStylesCss}
            homeFallbackBody={homeFallbackBody}
            activePageSlug={activePreviewSlug}
            publishedSiteBaseUrl={publishedSiteBaseUrl}
            header={header}
            footer={footer}
            onActivePageChange={onActivePreviewSlugChange}
            onPageBodyChange={onPageBodyChange}
            onSelectedImageChange={onSelectedImageChange}
          />
        )}
      </section>

      {showStylesHoverInspector && hoverInspector && !isDraftLoading && !draftLoadError && (
        <div
          className={HOVER_INSPECTOR_CLASS}
          style={{
            left: `${hoverInspector.left}px`,
            top: `${hoverInspector.top}px`
          }}
        >
          <code title={hoverInspector.selector}>{hoverInspector.selector}</code>
          <button type="button" onClick={handleCopySelector}>
            {copyLabel}
          </button>
        </div>
      )}
    </div>
  );
};

export default BuilderPreviewPanel;
