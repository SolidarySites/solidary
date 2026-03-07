import pageTemplate from "../../../../templates/astro/page.md?raw";
import solidaryTemplate from "../../../../templates/astro/solidary.md?raw";
import headerTemplate from "../../../../templates/astro/header.md?raw";
import footerTemplate from "../../../../templates/astro/footer.md?raw";
import seoTemplate from "../../../../templates/astro/seo.md?raw";
import type { AstroPageDraft, AstroSettings } from "../types";

const toYamlValue = (value: string) => JSON.stringify(value);

export const buildSolidaryMarkdown = (settings: AstroSettings) =>
  solidaryTemplate
    .replaceAll("{{TITLE}}", toYamlValue(settings.title))
    .replaceAll("{{DESCRIPTION}}", toYamlValue(settings.description))
    .replaceAll("{{SITE_URL}}", toYamlValue(settings.siteUrl))
    .replaceAll("{{OG_IMAGE}}", toYamlValue(settings.ogImage));

export const buildHeaderMarkdown = (settings: AstroSettings) =>
  headerTemplate
    .replaceAll("{{HEADER_DISABLED}}", settings.header.disabled ? "true" : "false")
    .replaceAll("{{HEADER_FIXED}}", settings.header.fixed ? "true" : "false")
    .replaceAll("{{HEADER_BRAND_TEXT}}", toYamlValue(settings.header.brandText))
    .replaceAll("{{HEADER_DISABLE_BRAND}}", settings.header.disableBrand ? "true" : "false");

export const buildFooterMarkdown = (settings: AstroSettings) =>
  footerTemplate
    .replaceAll("{{FOOTER_DISABLED}}", settings.footer.disabled ? "true" : "false")
    .replaceAll("{{FOOTER_FIXED}}", settings.footer.fixed ? "true" : "false")
    .replaceAll("{{FOOTER_MODULES}}", JSON.stringify(settings.footer.modules));

export const buildSeoMarkdown = (settings: AstroSettings) =>
  seoTemplate
    .replaceAll("{{SEO_HEAD_HTML}}", toYamlValue(settings.headHtml))
    .replaceAll("{{SEO_LOCALE}}", toYamlValue(settings.locale))
    .replaceAll("{{SEO_TWITTER}}", settings.twitter ? "true" : "false")
    .replaceAll("{{SEO_OPEN_GRAPH}}", settings.openGraph ? "true" : "false")
    .replaceAll("{{SEO_STRUCTURED_DATA}}", settings.structuredData ? "true" : "false")
    .replaceAll("{{SEO_INDEX_FOLLOW}}", settings.indexFollow ? "true" : "false");

export const buildPageMarkdown = (page: AstroPageDraft) => {
  const body = page.body.trim();
  const navLabel = page.title.trim() || page.slug || "Untitled";
  const javascript = (page.javascript ?? "").trim();

  return pageTemplate
    .replaceAll("{{TITLE}}", toYamlValue(page.title))
    .replaceAll("{{NAV_LABEL}}", toYamlValue(navLabel))
    .replaceAll("{{SHOW_IN_NAV}}", page.showInNav ? "true" : "false")
    .replaceAll("{{NAV_ORDER}}", String(page.navOrder ?? 0))
    .replaceAll("{{JAVASCRIPT}}", toYamlValue(javascript))
    .replaceAll("{{BODY}}", body);
};
