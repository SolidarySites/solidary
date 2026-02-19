import pageTemplate from "../../../../templates/astro/page.md?raw";
import siteTemplate from "../../../../templates/astro/site.ts?raw";
import type { AstroPageDraft, AstroSettings } from "../types";

const escape = (value: string) => value.replace(/"/g, "\\\"");

export const buildSiteTs = (settings: AstroSettings) =>
  siteTemplate
    .replaceAll("{{TITLE}}", escape(settings.title))
    .replaceAll("{{DESCRIPTION}}", escape(settings.description))
    .replaceAll("{{SITE_URL}}", escape(settings.siteUrl))
    .replaceAll("{{OG_IMAGE}}", escape(settings.ogImage))
    .replaceAll("{{HEADER_DISABLED}}", settings.header.disabled ? "true" : "false")
    .replaceAll("{{HEADER_FIXED}}", settings.header.fixed ? "true" : "false")
    .replaceAll("{{HEADER_BRAND_TEXT}}", escape(settings.header.brandText))
    .replaceAll("{{HEADER_DISABLE_BRAND}}", settings.header.disableBrand ? "true" : "false")
    .replaceAll("{{FOOTER_DISABLED}}", settings.footer.disabled ? "true" : "false")
    .replaceAll("{{FOOTER_FIXED}}", settings.footer.fixed ? "true" : "false")
    .replaceAll("{{FOOTER_MODULES}}", escape(JSON.stringify(settings.footer.modules)));

export const buildPageMarkdown = (page: AstroPageDraft) => {
  const body = page.body.trim();
  return pageTemplate
    .replaceAll("{{TITLE}}", escape(page.title))
    .replaceAll("{{NAV_LABEL}}", escape(page.title))
    .replaceAll("{{SHOW_IN_NAV}}", page.showInNav ? "true" : "false")
    .replaceAll("{{NAV_ORDER}}", String(page.navOrder ?? 0))
    .replaceAll("{{BODY}}", body);
};
