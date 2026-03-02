import { forwardRef, useMemo, type CSSProperties } from "react";
import { normalizePageSlug } from "../services/utils";
import {
  extractCssVariables as extractStyleVariables,
  extractCustomCssFromTokens
} from "../services/style-editor";
import { getTrackedExternalImageSource } from "../../../../../lib/external-image-loading";
import AstroPreviewLayout from "./astro-preview/AstroPreviewLayout";
import AstroPreviewEditableSurface from "./astro-preview/AstroPreviewEditableSurface";
import { scopePreviewCss } from "./astro-preview/css-scope-utils";
import { markdownToHtml, parseFooterLineSegments } from "./astro-preview/content-utils";
import { mapHtmlImageSources, parseInertHtmlTemplate } from "./astro-preview/image-source-utils";
import type {
  AstroTemplatePreviewHandle,
  AstroTemplatePreviewProps,
  ParsedPage
} from "./astro-preview/types";

export type { AstroTemplatePreviewHandle, PreviewSelectedImage } from "./astro-preview/types";

const AstroTemplatePreview = forwardRef<AstroTemplatePreviewHandle, AstroTemplatePreviewProps>(
  function AstroTemplatePreview(
    {
      editable,
      previewBrand,
      pages,
      draftImages,
      tokensCss,
      styleMode,
      advancedStructureCss,
      previewStylesCss,
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
      const template = parseInertHtmlTemplate(displayBodyHtml);
      return Array.from(template.content.querySelectorAll("img"))
        .map((image, index) => `${index}:${getTrackedExternalImageSource(image)}`)
        .join("|");
    }, [displayBodyHtml]);

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

    const previewInlineCss = useMemo(() => {
      const rawCss =
        styleMode === "advanced"
          ? effectivePreviewCss
          : extractCustomCssFromTokens(tokensCss).trim();
      return scopePreviewCss(rawCss);
    }, [effectivePreviewCss, styleMode, tokensCss]);

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

    return (
      <AstroPreviewLayout
        styleMode={styleMode}
        previewStyle={previewStyle}
        previewInlineCss={previewInlineCss}
        header={header}
        footer={footer}
        previewBrand={previewBrand}
        homePageSlug={homePage.safeSlug}
        navItems={navItems}
        activeSlug={activeSlug}
        footerModules={footerModules}
        footerInnerStyle={footerInnerStyle}
        footerCopyright={footerCopyright}
        onActivePageChange={onActivePageChange}
        parseFooterLineSegments={parseFooterLineSegments}
        editor={
          <AstroPreviewEditableSurface
            ref={ref}
            editable={editable}
            activeSlug={activeSlug}
            draftImages={draftImages}
            publishedSiteBaseUrl={publishedSiteBaseUrl}
            displayBodyHtml={displayBodyHtml}
            displayImageSignature={displayImageSignature}
            onPageBodyChange={onPageBodyChange}
            onSelectedImageChange={onSelectedImageChange}
          />
        }
      />
    );
  }
);

export default AstroTemplatePreview;
