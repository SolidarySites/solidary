import pageTemplate from "../templates/astro/page.md?raw";
import siteTemplate from "../templates/astro/site.ts?raw";

export type AstroHeader = {
  disabled: boolean;
  fixed: boolean;
  brandText: string;
  disableBrand: boolean;
};

export type AstroFooter = {
  disabled: boolean;
  fixed: boolean;
  modules: Array<{
    content: string;
    alignment: "left" | "center" | "right";
  }>;
};

export type AstroSettings = {
  title: string;
  description: string;
  siteUrl: string;
  ogImage: string;
  header: AstroHeader;
  footer: AstroFooter;
};

export type AstroPageDraft = {
  title: string;
  slug: string;
  body: string;
  showInNav: boolean;
  navOrder?: number;
};

const escape = (value: string) => value.replace(/"/g, "\\\"");

export function buildSiteTs(settings: AstroSettings) {
  return siteTemplate
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
}

export function buildPageMarkdown(page: AstroPageDraft) {
  const body = page.body.trim();
  return pageTemplate
    .replaceAll("{{TITLE}}", escape(page.title))
    .replaceAll("{{NAV_LABEL}}", escape(page.title))
    .replaceAll("{{SHOW_IN_NAV}}", page.showInNav ? "true" : "false")
    .replaceAll("{{NAV_ORDER}}", String(page.navOrder ?? 0))
    .replaceAll("{{BODY}}", body);
}
