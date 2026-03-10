import {
  FOOTER_CONTENT_TEMPLATE,
  HEADER_CONTENT_TEMPLATE,
  SEO_CONTENT_TEMPLATE,
  SOLIDARY_CONTENT_TEMPLATE
} from "../../../../templates/astro/scaffold";
import {
  renderMarkdownWithFrontmatter,
  replaceFrontmatterFields
} from "./frontmatter";
import type { AstroPageDraft, AstroSettings } from "../types";

export const buildSolidaryMarkdown = (settings: AstroSettings) =>
  replaceFrontmatterFields(SOLIDARY_CONTENT_TEMPLATE, {
    title: settings.title,
    description: settings.description,
    url: settings.siteUrl,
    ogImage: settings.ogImage,
    robots: "index,follow"
  });

export const buildHeaderMarkdown = (settings: AstroSettings) =>
  replaceFrontmatterFields(HEADER_CONTENT_TEMPLATE, {
    disabled: settings.header.disabled,
    fixed: settings.header.fixed,
    brandText: settings.header.brandText,
    disableBrand: settings.header.disableBrand
  });

export const buildFooterMarkdown = (settings: AstroSettings) =>
  replaceFrontmatterFields(FOOTER_CONTENT_TEMPLATE, {
    disabled: settings.footer.disabled,
    fixed: settings.footer.fixed,
    modules: settings.footer.modules
  });

export const buildSeoMarkdown = (settings: AstroSettings) =>
  replaceFrontmatterFields(SEO_CONTENT_TEMPLATE, {
    twitter: settings.twitter,
    openGraph: settings.openGraph,
    structuredData: settings.structuredData,
    indexFollow: settings.indexFollow,
    locale: settings.locale,
    headHtml: settings.headHtml
  });

export const buildPageMarkdown = (page: AstroPageDraft) => {
  const body = page.body.trim();
  const navLabel = page.title.trim() || page.slug || "Untitled";
  const javascript = (page.javascript ?? "").trim();

  return renderMarkdownWithFrontmatter({
    updates: {
      title: page.title,
      navLabel,
      showInNav: page.showInNav,
      navOrder: page.navOrder ?? 0,
      javascript
    },
    body
  });
};
