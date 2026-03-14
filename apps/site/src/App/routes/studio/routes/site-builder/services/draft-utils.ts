import { buildSettingsPayload } from "./build-files";
import { sanitizeBuilderImageHtml } from "./builder-image-html";
import { SOLIDARY_MEDIA_IMAGES_BASE_PATH } from "./constants";
import type {
  BuilderPage,
  BuilderStyleSettings,
  DraftImageAsset,
  FooterModule,
  FooterModuleAlignment
} from "./types";
import { getPageSafeSlug } from "./utils";

export const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024;
export const SITE_DRAFT_IMAGES_BUCKET = "site-draft-images";
export const SOLIDARY_MEDIA_PAGE_IMAGES_BASE_PATH = `${SOLIDARY_MEDIA_IMAGES_BASE_PATH}/pages`;
export const SOLIDARY_MEDIA_UPLOADS_BASE_PATH = SOLIDARY_MEDIA_PAGE_IMAGES_BASE_PATH;
export const DEFAULT_FOOTER_MODULES: FooterModule[] = [
  { content: "%copyright%", alignment: "left" },
  { content: "", alignment: "center" },
  { content: "", alignment: "right" }
];

const IMAGE_EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/avif": "avif"
};

const footerModuleAlignmentFallback: FooterModuleAlignment[] = ["left", "center", "right"];

export type DraftSaveSettingsInput = Parameters<typeof buildSettingsPayload>[0];

export type DraftPageRow = {
  draft_id: string;
  slug: string;
  title: string;
  content: string;
  javascript: string;
  show_in_nav: boolean;
  position: number;
  is_home: boolean;
};

export const getImageExtension = (file: File): string => {
  const extensionFromName = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (extensionFromName) return extensionFromName;
  return IMAGE_EXTENSION_BY_MIME[file.type] ?? "png";
};

export const normalizeSitePath = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
};

export const toExternalUrl = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
};

export const normalizeFooterModules = (modules: FooterModule[]): FooterModule[] => {
  const normalized = modules
    .slice(0, 3)
    .map((module, index) => ({
      content: typeof module?.content === "string" ? module.content : "",
      alignment:
        module?.alignment === "left" || module?.alignment === "center" || module?.alignment === "right"
          ? module.alignment
          : (footerModuleAlignmentFallback[index] ?? "left")
    }));
  while (normalized.length < 3) {
    const alignment = footerModuleAlignmentFallback[normalized.length] ?? "left";
    normalized.push({
      content: "",
      alignment
    });
  }
  return normalized;
};

export const getSitePathFromStoragePath = (storagePath: string): string => {
  const normalized = storagePath.trim();
  if (!normalized) return "";
  const filename = normalized.split("/").pop()?.trim();
  if (!filename) return "";
  return `${SOLIDARY_MEDIA_PAGE_IMAGES_BASE_PATH}/${filename}`;
};

export const isDraftStoragePublicUrl = (publicUrl: string): boolean => {
  const trimmed = publicUrl.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.pathname.includes(`/storage/v1/object/public/${SITE_DRAFT_IMAGES_BUCKET}/`);
  } catch {
    return false;
  }
};

export const replaceDraftImageUrlsWithSitePaths = (
  body: string,
  draftImages: DraftImageAsset[]
): string => {
  let nextBody = sanitizeBuilderImageHtml(body);
  draftImages.forEach((image) => {
    const publicUrl = image.publicUrl.trim();
    const sitePath = normalizeSitePath(image.sitePath);
    if (!publicUrl || !sitePath) return;
    nextBody = nextBody.replaceAll(publicUrl, sitePath);
  });
  return nextBody;
};

export const buildDraftPageRows = (
  draftId: string,
  pagesSnapshot: BuilderPage[],
  draftImages: DraftImageAsset[]
): DraftPageRow[] =>
  pagesSnapshot.map((page, index) => ({
    draft_id: draftId,
    slug: getPageSafeSlug(page, index),
    title: page.title.trim() || page.slug || `Page ${index + 1}`,
    content: replaceDraftImageUrlsWithSitePaths(page.body ?? "", draftImages),
    javascript: (page.javascript ?? "").trim(),
    show_in_nav: page.showInNav ?? true,
    position: index,
    is_home: Boolean(page.isHome)
  }));

export const buildDraftSaveSignature = ({
  draftId,
  settingsInput,
  imageUrl,
  styles,
  pagesSnapshot,
  draftImages
}: {
  draftId: string;
  settingsInput: DraftSaveSettingsInput;
  imageUrl: string;
  styles: BuilderStyleSettings;
  pagesSnapshot: BuilderPage[];
  draftImages: DraftImageAsset[];
}): string =>
  JSON.stringify({
    settings: buildSettingsPayload(settingsInput, imageUrl),
    siteImagePath: imageUrl,
    styles,
    pages: buildDraftPageRows(draftId, pagesSnapshot, draftImages).map((row) => ({
      slug: row.slug,
      title: row.title,
      content: row.content,
      javascript: row.javascript,
      show_in_nav: row.show_in_nav,
      position: row.position,
      is_home: row.is_home
    }))
  });
