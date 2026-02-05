import pageTemplate from "../templates/astro/page.md?raw";
import siteTemplate from "../templates/astro/site.ts?raw";

export type AstroAuthor = {
  name: string;
  email?: string;
  url?: string;
  x?: string;
  github?: string;
  linkedin?: string;
};

export type AstroSettings = {
  title: string;
  tagline: string;
  description: string;
  siteUrl: string;
  locale: string;
  author: AstroAuthor;
  themeColor: string;
  ogImage: string;
};

export type AstroPageDraft = {
  title: string;
  slug: string;
  body: string;
  showInNav: boolean;
};

const escape = (value: string) => value.replace(/"/g, "\\\"");

export function buildSiteTs(settings: AstroSettings) {
  return siteTemplate
    .replaceAll("{{TITLE}}", escape(settings.title))
    .replaceAll("{{TAGLINE}}", escape(settings.tagline))
    .replaceAll("{{DESCRIPTION}}", escape(settings.description))
    .replaceAll("{{SITE_URL}}", escape(settings.siteUrl))
    .replaceAll("{{LOCALE}}", escape(settings.locale))
    .replaceAll("{{AUTHOR_NAME}}", escape(settings.author.name))
    .replaceAll("{{AUTHOR_EMAIL}}", escape(settings.author.email ?? ""))
    .replaceAll("{{AUTHOR_URL}}", escape(settings.author.url ?? ""))
    .replaceAll("{{AUTHOR_X}}", escape(settings.author.x ?? ""))
    .replaceAll("{{AUTHOR_GITHUB}}", escape(settings.author.github ?? ""))
    .replaceAll("{{AUTHOR_LINKEDIN}}", escape(settings.author.linkedin ?? ""))
    .replaceAll("{{OG_IMAGE}}", escape(settings.ogImage))
    .replaceAll("{{THEME_COLOR}}", escape(settings.themeColor));
}

export function buildPageMarkdown(page: AstroPageDraft) {
  const body = page.body.trim();
  return pageTemplate
    .replaceAll("{{TITLE}}", escape(page.title))
    .replaceAll("{{NAV_LABEL}}", escape(page.title))
    .replaceAll("{{SHOW_IN_NAV}}", page.showInNav ? "true" : "false")
    .replaceAll("{{BODY}}", body);
}
