import type { BuilderPage } from "./types";

export const resolveImagePreviewUrl = (imageUrl: string, canonicalUrl: string) => {
  const trimmedImageUrl = imageUrl.trim();
  if (!trimmedImageUrl) return imageUrl;

  const lower = trimmedImageUrl.toLowerCase();
  if (
    lower.startsWith("http://") ||
    lower.startsWith("https://") ||
    lower.startsWith("data:") ||
    lower.startsWith("blob:") ||
    trimmedImageUrl.startsWith("//")
  ) {
    return imageUrl;
  }

  const base = canonicalUrl.trim().replace(/\/$/, "");
  if (!base) return imageUrl;
  if (trimmedImageUrl.startsWith("/")) {
    return `${base}${trimmedImageUrl}`;
  }

  return `${base}/${trimmedImageUrl}`;
};

export const normalizePageSlug = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s_-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/_+/g, "_")
    .replace(/^[-_]+|[-_]+$/g, "");

export const getPageSafeSlug = (page: BuilderPage, index: number) =>
  page.isHome ? "home" : normalizePageSlug(page.slug || page.title) || `page-${index + 1}`;

export const makeUniquePageSlug = (value: string, pages: BuilderPage[], currentIndex?: number) => {
  const base = normalizePageSlug(value) || "page";
  const existing = new Set(
    pages.flatMap((page, index) => {
      if (index === currentIndex) return [];
      return [getPageSafeSlug(page, index)];
    })
  );
  if (!existing.has(base)) return base;

  let suffix = 1;
  let candidate = `${base}_${suffix}`;
  while (existing.has(candidate)) {
    suffix += 1;
    candidate = `${base}_${suffix}`;
  }
  return candidate;
};

export const stripFrontmatter = (content: string) => {
  const match = content.match(/^---\s*[\r\n]+([\s\S]*?)\r?\n---\s*[\r\n]*([\s\S]*)$/);
  if (!match) return content.trim();
  return (match[2] ?? "").trim();
};

export const getPublishPollDelayMs = (attempt: number) => {
  // Start slow, then accelerate, then slow down again for long-running deploys.
  if (attempt < 3) return 15000;
  if (attempt < 15) return 5000;
  if (attempt < 35) return 12000;
  if (attempt < 50) return 20000;
  return null;
};
