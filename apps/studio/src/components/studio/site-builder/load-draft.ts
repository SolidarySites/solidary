import { supabase } from "../../../lib/supabase";
import type { RepoFileSet } from "../../../studio/types";
import { parseSolidaryJson } from "../../../studio/utils";
import { FILE_KEYS } from "./constants";
import type {
  BuilderPage,
  DraftImageAsset,
  DraftState,
  FooterCustomLink,
  FooterOptions,
  HeaderOptions
} from "./types";
import { getPageSafeSlug, resolveImagePreviewUrl } from "./utils";

export type LoadedDraftResult = {
  draftState: DraftState;
  pages: BuilderPage[];
  draftPageSlugs: string[];
  initialActivePreviewSlug: string | null;
  siteTitle?: string;
  siteDescription?: string;
  siteUrl?: string;
  tokensCss?: string;
  siteImagePreview?: string;
  draftImageUrl?: string;
  draftImages?: DraftImageAsset[];
  header?: HeaderOptions;
  footer?: FooterOptions;
};

const getSitePathFromStoragePath = (storagePath: string) => {
  const normalized = storagePath.trim();
  if (!normalized) return "";
  const filename = normalized.split("/").pop()?.trim();
  if (!filename) return "";
  return `/images/uploads/${filename}`;
};

const replaceDraftImageUrls = (body: string, draftImages: DraftImageAsset[]) => {
  let nextBody = body;
  draftImages.forEach((image) => {
    const publicUrl = image.publicUrl.trim();
    const sitePath = image.sitePath.trim();
    if (!publicUrl || !sitePath) return;
    nextBody = nextBody.replaceAll(publicUrl, sitePath);
  });
  return nextBody;
};

export const loadDraftById = async ({
  draftId,
  defaultHomeContent
}: {
  draftId: string;
  defaultHomeContent: string;
}) => {
  const { data, error } = await supabase
    .from("site_drafts")
    .select("id, repo_full_name, branch, files")
    .eq("id", draftId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Draft not found.");

  const files = data.files as RepoFileSet;
  const solidaryRaw = files[FILE_KEYS.solidary] ?? files[".well-known/solidary-links.json"] ?? "";
  const solidary = parseSolidaryJson(solidaryRaw);

  const draftState: DraftState = {
    id: data.id,
    repoFullName: data.repo_full_name,
    branch: data.branch,
    files
  };

  const [{ data: pagesData }, { data: settingsData }, { data: draftImagesData }] = await Promise.all([
    supabase
      .from("site_draft_pages")
      .select("id, slug, title, content, show_in_nav, position, is_home")
      .eq("draft_id", data.id)
      .order("position", { ascending: true }),
    supabase
      .from("site_draft_settings")
      .select("settings, styles")
      .eq("draft_id", data.id)
      .maybeSingle(),
    supabase
      .from("site_draft_images")
      .select("id, storage_path, public_url, site_path, uploaded_at")
      .eq("draft_id", data.id)
      .order("uploaded_at", { ascending: true })
  ]);

  const draftImages: DraftImageAsset[] = (draftImagesData ?? [])
    .map((image) => {
      const storagePath = typeof image.storage_path === "string" ? image.storage_path : "";
      const sitePathCandidate =
        typeof image.site_path === "string" ? image.site_path.trim() : getSitePathFromStoragePath(storagePath);
      return {
        id: typeof image.id === "string" ? image.id : undefined,
        storagePath,
        publicUrl: typeof image.public_url === "string" ? image.public_url : "",
        sitePath: sitePathCandidate || getSitePathFromStoragePath(storagePath),
        uploadedAt: typeof image.uploaded_at === "string" ? image.uploaded_at : undefined
      };
    })
    .filter((image) => image.storagePath && image.publicUrl && image.sitePath);

  const pages = (pagesData ?? []).map((page) => ({
    id: page.id,
    slug: page.slug,
    title: page.title,
    body: replaceDraftImageUrls(
      page.is_home && !page.content?.trim() ? defaultHomeContent : page.content ?? "",
      draftImages
    ),
    showInNav: page.show_in_nav ?? true,
    position: page.position,
    isHome: page.is_home ?? false
  }));

  const draftPageSlugs = pages.map((page) => page.slug);
  const initialPage = pages.find((page) => page.isHome) ?? pages[0];
  const initialActivePreviewSlug = initialPage
    ? getPageSafeSlug(initialPage, pages.indexOf(initialPage))
    : null;

  const settings = (settingsData?.settings as Record<string, unknown>) ?? {};
  const styles = (settingsData?.styles as Record<string, unknown>) ?? {};

  const result: LoadedDraftResult = {
    draftState,
    pages,
    draftPageSlugs,
    initialActivePreviewSlug,
    draftImages
  };

  if (typeof settings.title === "string") result.siteTitle = settings.title;
  else if (solidary?.title) result.siteTitle = solidary.title;

  if (typeof settings.description === "string") result.siteDescription = settings.description;
  else if (solidary?.description) result.siteDescription = solidary.description;

  if (typeof settings.siteUrl === "string") result.siteUrl = settings.siteUrl;
  else if (solidary?.site_url) result.siteUrl = solidary.site_url;

  if (typeof styles.tokensCss === "string") result.tokensCss = styles.tokensCss;

  const header = settings.header as Record<string, unknown> | undefined;
  if (header) {
    result.header = {
      disabled: Boolean(header.disabled),
      fixed: Boolean(header.fixed),
      brandText: typeof header.brandText === "string" ? header.brandText : (result.siteTitle ?? ""),
      disableBrand: Boolean(header.disableBrand)
    };
  }

  const footer = settings.footer as Record<string, unknown> | undefined;
  if (footer) {
    const customLinksRaw = Array.isArray(footer.customLinks)
      ? (footer.customLinks as Record<string, unknown>[])
      : [];
    const customLinks: FooterCustomLink[] = customLinksRaw
      .map((item) => ({
        label: typeof item.label === "string" ? item.label.trim() : "",
        url: typeof item.url === "string" ? item.url.trim() : ""
      }))
      .filter((item) => item.label && item.url);

    result.footer = {
      disabled: Boolean(footer.disabled),
      fixed: Boolean(footer.fixed),
      disableCopyright: Boolean(footer.disableCopyright),
      copyrightName:
        typeof footer.copyrightName === "string"
          ? footer.copyrightName
          : (result.siteTitle ?? ""),
      customText: typeof footer.customText === "string" ? footer.customText : "",
      customLinks
    };
  }

  if (solidary?.image_url) {
    const canonicalUrl = solidary.site_url ?? "";
    result.siteImagePreview = resolveImagePreviewUrl(solidary.image_url, canonicalUrl);
    result.draftImageUrl = solidary.image_url;
  }

  return result;
};
