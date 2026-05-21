import type { CSSProperties } from "react";
import { normalizePageSlug } from "../../services/utils";
import {
  extractCssVariables as extractStyleVariables,
  extractCustomCssFromTokens
} from "../../services/style-editor";
import { scopePreviewCss } from "./css-scope-utils";
import { markdownToHtml, parseFooterLineSegments } from "./content-utils";
import { mapHtmlImageSources } from "./image-source-utils";
import type { DraftImageAsset, FooterOptions, HeaderOptions } from "../../services/types";
import type {
  ParsedPage,
  PreviewNavItem,
  PreviewPage
} from "./types";

export type PreviewFooterModule = {
  alignment: "left" | "center" | "right";
  html: string;
  hidden: boolean;
};

export type PreviewFrameState = {
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
  header: HeaderOptions;
  footer: {
    disabled: boolean;
    fixed: boolean;
    modules: PreviewFooterModule[];
    visibleModuleCount: number;
  };
};

const footerModuleAlignmentFallback: Array<"left" | "center" | "right"> = ["left", "center", "right"];

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

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

export const buildPreviewFrameState = ({
  editable,
  previewBrand,
  pages,
  draftImages,
  repoFontsCss,
  tokensCss,
  styleMode,
  advancedStructureCss,
  previewStylesCss,
  dynamicImageLoadingEnabled,
  homeFallbackBody,
  activePageSlug,
  publishedSiteBaseUrl,
  previewAssetBaseUrl,
  header,
  footer
}: {
  editable: boolean;
  previewBrand: string;
  pages: PreviewPage[];
  draftImages: DraftImageAsset[];
  repoFontsCss: string;
  tokensCss: string;
  styleMode: "simple" | "advanced";
  advancedStructureCss: string;
  previewStylesCss: string;
  dynamicImageLoadingEnabled: boolean;
  homeFallbackBody: string;
  activePageSlug: string;
  publishedSiteBaseUrl: string | null;
  previewAssetBaseUrl: string | null;
  header: HeaderOptions;
  footer: FooterOptions;
}): PreviewFrameState => {
  const parsedPages: ParsedPage[] = pages.map((page, index) => {
    const safeSlug =
      page.isHome ? "home" : normalizePageSlug(page.slug || page.title) || `page-${index + 1}`;
    return {
      ...page,
      safeSlug
    };
  });

  const homePage: ParsedPage =
    parsedPages.find((page) => page.isHome || page.safeSlug === "home") ?? {
      title: "Home",
      slug: "home",
      body: homeFallbackBody,
      javascript: "",
      showInNav: false,
      isHome: true,
      safeSlug: "home"
    };

  const navItems = parsedPages
    .filter((page) => page.showInNav !== false)
    .map((page) => ({
      label: page.title.trim() || "Untitled page",
      slug: page.safeSlug,
      href: page.safeSlug === homePage.safeSlug ? "/" : `/${page.safeSlug}`
    }))
    .filter((item, index, array) => array.findIndex((candidate) => candidate.href === item.href) === index);

  const allPageSlugs = new Set([homePage.safeSlug, ...parsedPages.map((page) => page.safeSlug)]);
  const activeSlug = allPageSlugs.has(activePageSlug) ? activePageSlug : homePage.safeSlug;
  const activePage = parsedPages.find((page) => page.safeSlug === activeSlug) ?? homePage;
  const activeBodyRaw =
    activePage.safeSlug === homePage.safeSlug
      ? (activePage.body || "").trim() || homeFallbackBody
      : (activePage.body || "").trim();
  const activeBodyHtml = markdownToHtml(activeBodyRaw);
  const displayBodyHtml = mapHtmlImageSources(
    activeBodyHtml,
    draftImages,
    publishedSiteBaseUrl,
    "display",
    dynamicImageLoadingEnabled
  );

  const effectivePreviewCss =
    styleMode === "advanced"
      ? advancedStructureCss.trim() || previewStylesCss.trim()
      : previewStylesCss.trim();

  const previewStyle = extractStyleVariables(effectivePreviewCss) as CSSProperties;
  const previewStyleVars: Record<string, string> = {};
  Object.entries(previewStyle as Record<string, unknown>).forEach(([key, value]) => {
    if (!key) return;
    if (typeof value === "string" || typeof value === "number") {
      previewStyleVars[key] = String(value);
    }
  });

  const baseCss =
    styleMode === "advanced"
      ? effectivePreviewCss
      : extractCustomCssFromTokens(tokensCss).trim();
  const combinedCss = [repoFontsCss.trim(), baseCss.trim()].filter(Boolean).join("\n\n");
  const previewInlineCss = scopePreviewCss(
    rewriteCssUrlsForPreview(combinedCss, previewAssetBaseUrl)
  );

  const currentYear = new Date().getFullYear();
  const footerCopyright = `© ${currentYear}`;
  const normalizedFooterModules = Array.isArray(footer.modules)
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
          return {
            content: typeof module.content === "string" ? module.content : "",
            alignment:
              module.alignment === "left" ||
              module.alignment === "center" ||
              module.alignment === "right"
                ? module.alignment
                : fallbackAlignment
          };
        })
    : [];

  while (normalizedFooterModules.length < 3) {
    normalizedFooterModules.push({
      content: "",
      alignment: footerModuleAlignmentFallback[normalizedFooterModules.length] ?? "left"
    });
  }

  const footerModulesForFrame: PreviewFooterModule[] = normalizedFooterModules.map((module) => {
    const resolvedModule = module.content
      .replaceAll("%copyright%", footerCopyright)
      .replace(/\r/g, "");
    const html = resolvedModule
      .split("\n")
      .map((line) =>
        parseFooterLineSegments(line)
          .map((segment) => {
            if (segment.type === "link") {
              const href = segment.href?.trim() ?? "";
              if (!href) return "";
              return `<a class="footer__link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(segment.text)}</a>`;
            }
            return `<span>${escapeHtml(segment.text)}</span>`;
          })
          .join("")
      )
      .join("<br />");

    return {
      alignment: module.alignment,
      html,
      hidden: module.content.trim().length === 0
    };
  });

  const visibleFooterModuleCount = footerModulesForFrame.filter((module) => !module.hidden).length;

  return {
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
  };
};
