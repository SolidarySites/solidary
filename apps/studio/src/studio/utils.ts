import type { SiteDraft } from "./types";

export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export function htmlFromIndexMarkdown(markdown: string) {
  const split = markdown.split("---");
  if (split.length < 3) return markdown;
  return split.slice(2).join("---").trim();
}

export function buildIndexMarkdown(html: string) {
  return `---\nlayout: default\ntitle: Home\n---\n\n${html.trim()}\n`;
}

export function toBase64(data: ArrayBuffer) {
  let binary = "";
  const bytes = new Uint8Array(data);
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export function renderTemplate(template: string, site: SiteDraft) {
  return template
    .replaceAll("{{SITE_ID}}", site.id)
    .replaceAll("{{TITLE}}", site.title)
    .replaceAll("{{IMAGE_URL}}", site.imageUrl)
    .replaceAll("{{IMAGE_PATH}}", site.imagePath)
    .replaceAll("{{DESCRIPTION}}", site.description)
    .replaceAll("{{SITE_URL}}", site.siteUrl)
    .replaceAll("{{SITE_URL_ROOT}}", site.siteUrlRoot)
    .replaceAll("{{BASEURL}}", site.baseUrl);
}

export function parseSolidaryJson(raw: string) {
  try {
    return JSON.parse(raw) as {
      site_id?: string;
      site_url?: string;
      title?: string;
      image_url?: string;
      description?: string;
    };
  } catch {
    return null;
  }
}
