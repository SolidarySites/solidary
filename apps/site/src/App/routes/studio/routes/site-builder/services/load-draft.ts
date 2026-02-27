import { supabase } from "../../../../../lib/supabase";
import type { RepoFileSet } from "../../../../../features/site-draft/types";
import { parseSolidaryJson } from "../../../../../features/site-draft/services/solidary";
import {
  normalizeSiteImagePathForStorage,
  resolveSiteThumbnailUrl
} from "../../../../../lib/site-image-url";
import { FILE_KEYS } from "./constants";
import type {
  BuilderPage,
  DraftImageAsset,
  DraftType,
  DraftState,
  FooterModuleAlignment,
  FooterOptions,
  HeaderOptions,
  SiteAccessRole
} from "./types";
import { getPageSafeSlug } from "./utils";

export type LoadedDraftResult = {
  draftState: DraftState;
  accessRole: SiteAccessRole;
  resolvedDraftId?: string;
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
  return `/solidary-media/images/pages/${filename}`;
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

const footerModuleAlignmentFallback: FooterModuleAlignment[] = ["left", "center", "right"];

const normalizeFooterModules = (modules: unknown): FooterOptions["modules"] => {
  const normalized = Array.isArray(modules)
    ? modules
        .slice(0, 3)
        .map((item, index) => {
          const fallbackAlignment = footerModuleAlignmentFallback[index] ?? "left";
          if (!item || typeof item !== "object") {
            return {
              content: "",
              alignment: fallbackAlignment
            };
          }
          const record = item as Record<string, unknown>;
          const alignment =
            record.alignment === "left" || record.alignment === "center" || record.alignment === "right"
              ? record.alignment
              : fallbackAlignment;
          return {
            content: typeof record.content === "string" ? record.content : "",
            alignment
          };
        })
    : [];
  while (normalized.length < 3) {
    const fallbackAlignment = footerModuleAlignmentFallback[normalized.length] ?? "left";
    normalized.push({
      content: "",
      alignment: fallbackAlignment
    });
  }
  return normalized;
};

type DraftRow = {
  id: string;
  site_id: string | null;
  repo_full_name: string;
  branch: string;
  owner_user_id: string;
  draft_type: DraftType | null;
  source_owner_draft_id: string | null;
  touched_sections: string[] | null;
  touched_page_slugs: string[] | null;
  deleted_page_slugs: string[] | null;
  editor_branch: string | null;
  last_pull_request_number: number | null;
  last_pull_request_url: string | null;
  last_pull_request_state: string | null;
  revision: number | null;
  updated_at: string | null;
  last_edited_by_user_id: string | null;
  last_edited_at: string | null;
  files: RepoFileSet;
};

const loadDraftRowById = async (draftId: string) => {
  const { data, error } = await supabase
    .from("site_drafts")
    .select(
      "id, site_id, repo_full_name, branch, owner_user_id, draft_type, source_owner_draft_id, touched_sections, touched_page_slugs, deleted_page_slugs, editor_branch, last_pull_request_number, last_pull_request_url, last_pull_request_state, revision, updated_at, last_edited_by_user_id, last_edited_at, files"
    )
    .eq("id", draftId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Draft not found.");
  return data as DraftRow;
};

export const loadDraftById = async ({
  draftId,
  defaultHomeContent,
  userId
}: {
  draftId: string;
  defaultHomeContent: string;
  userId: string;
}) => {
  const requestedDraft = await loadDraftRowById(draftId);
  const siteId = requestedDraft.site_id ?? requestedDraft.id;

  const { data: ownerDraft, error: ownerDraftError } = await supabase
    .from("site_drafts")
    .select("id, owner_user_id")
    .eq("site_id", siteId)
    .eq("draft_type", "owner")
    .limit(1)
    .maybeSingle();

  if (ownerDraftError) throw new Error(ownerDraftError.message);

  let accessRole: SiteAccessRole | null = null;
  if (ownerDraft?.owner_user_id === userId) {
    accessRole = "owner";
  } else {
    const { data: collaboratorRow, error: collaboratorError } = await supabase
      .from("site_admins")
      .select("role")
      .eq("site_id", siteId)
      .eq("user_id", userId)
      .maybeSingle();

    if (collaboratorError) throw new Error(collaboratorError.message);
    if (
      collaboratorRow?.role === "admin" ||
      collaboratorRow?.role === "editor" ||
      collaboratorRow?.role === "viewer"
    ) {
      accessRole = collaboratorRow.role;
    }
  }

  if (!accessRole) {
    throw new Error("You do not have access to this draft.");
  }

  let resolvedDraft = requestedDraft;
  if (accessRole === "editor" && requestedDraft.draft_type !== "editor") {
    const { data: editorDraftResult, error: editorDraftError } = await supabase.rpc(
      "site_get_or_create_editor_draft",
      {
        p_site_id: siteId
      }
    );

    if (editorDraftError) throw new Error(editorDraftError.message);
    const editorDraftId =
      Array.isArray(editorDraftResult) && editorDraftResult.length
        ? (editorDraftResult[0] as { draft_id?: string }).draft_id
        : null;
    if (!editorDraftId || typeof editorDraftId !== "string") {
      throw new Error("Failed to load your editor draft.");
    }
    resolvedDraft = await loadDraftRowById(editorDraftId);
  }

  const files = resolvedDraft.files as RepoFileSet;
  const solidaryRaw = files[FILE_KEYS.solidary] ?? "";
  const solidary = parseSolidaryJson(solidaryRaw);

  const draftState: DraftState = {
    id: resolvedDraft.id,
    siteId: resolvedDraft.site_id ?? resolvedDraft.id,
    repoFullName: resolvedDraft.repo_full_name,
    branch: resolvedDraft.branch,
    ownerUserId: resolvedDraft.owner_user_id,
    draftType: resolvedDraft.draft_type === "editor" ? "editor" : "owner",
    sourceOwnerDraftId: resolvedDraft.source_owner_draft_id,
    touchedSections: (resolvedDraft.touched_sections ?? []).filter(
      (entry): entry is "metadata" | "pages" | "header" | "footer" | "styles" =>
        entry === "metadata" ||
        entry === "pages" ||
        entry === "header" ||
        entry === "footer" ||
        entry === "styles"
    ),
    touchedPageSlugs: (resolvedDraft.touched_page_slugs ?? []).filter(
      (entry): entry is string => typeof entry === "string" && entry.trim().length > 0
    ),
    deletedPageSlugs: (resolvedDraft.deleted_page_slugs ?? []).filter(
      (entry): entry is string => typeof entry === "string" && entry.trim().length > 0
    ),
    editorBranch:
      typeof resolvedDraft.editor_branch === "string" ? resolvedDraft.editor_branch : null,
    lastPullRequestNumber:
      typeof resolvedDraft.last_pull_request_number === "number"
        ? resolvedDraft.last_pull_request_number
        : null,
    lastPullRequestUrl:
      typeof resolvedDraft.last_pull_request_url === "string"
        ? resolvedDraft.last_pull_request_url
        : null,
    lastPullRequestState:
      typeof resolvedDraft.last_pull_request_state === "string"
        ? resolvedDraft.last_pull_request_state
        : null,
    revision: typeof resolvedDraft.revision === "number" ? resolvedDraft.revision : 1,
    lastEditedAt: typeof resolvedDraft.last_edited_at === "string" ? resolvedDraft.last_edited_at : null,
    lastEditedByUserId:
      typeof resolvedDraft.last_edited_by_user_id === "string"
        ? resolvedDraft.last_edited_by_user_id
        : null,
    files
  };

  const [{ data: pagesData }, { data: settingsData }, { data: draftImagesData }] = await Promise.all([
    supabase
      .from("site_draft_pages")
      .select("id, slug, title, content, show_in_nav, position, is_home")
      .eq("draft_id", resolvedDraft.id)
      .order("position", { ascending: true }),
    supabase
      .from("site_draft_settings")
      .select("settings, styles")
      .eq("draft_id", resolvedDraft.id)
      .maybeSingle(),
    supabase
      .from("site_draft_images")
      .select("id, storage_path, public_url, site_path, uploaded_at")
      .eq("draft_id", resolvedDraft.id)
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
    accessRole,
    resolvedDraftId: resolvedDraft.id,
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
    const footerModules =
      footer && typeof footer === "object" && "modules" in footer
        ? (footer as { modules?: unknown }).modules
        : undefined;
    result.footer = {
      disabled: Boolean(footer.disabled),
      fixed: Boolean(footer.fixed),
      modules: normalizeFooterModules(footerModules)
    };
  }

  if (solidary?.image_url) {
    const canonicalUrl = solidary.site_url ?? "";
    result.siteImagePreview = resolveSiteThumbnailUrl({
      siteUrl: canonicalUrl,
      fallbackImageUrl: solidary.image_url
    });
    result.draftImageUrl = normalizeSiteImagePathForStorage({
      siteUrl: canonicalUrl,
      imageUrl: solidary.image_url
    });
  }

  return result;
};
