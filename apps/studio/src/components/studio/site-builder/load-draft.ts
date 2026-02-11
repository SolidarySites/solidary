import { supabase } from "../../../lib/supabase";
import type { RepoFileSet } from "../../../studio/types";
import { parseSolidaryJson } from "../../../studio/utils";
import { FILE_KEYS } from "./constants";
import type { BuilderPage, DraftState } from "./types";
import { getPageSafeSlug, resolveImagePreviewUrl } from "./utils";

export type LoadedDraftResult = {
  draftState: DraftState;
  pages: BuilderPage[];
  draftPageSlugs: string[];
  initialActivePreviewSlug: string | null;
  siteTitle?: string;
  siteDescription?: string;
  siteUrl?: string;
  siteLocale?: string;
  authorName?: string;
  authorEmail?: string;
  authorUrl?: string;
  tokensCss?: string;
  siteImagePreview?: string;
  draftImageUrl?: string;
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

  const [{ data: pagesData }, { data: settingsData }] = await Promise.all([
    supabase
      .from("site_draft_pages")
      .select("id, slug, title, content, show_in_nav, position, is_home")
      .eq("draft_id", data.id)
      .order("position", { ascending: true }),
    supabase
      .from("site_draft_settings")
      .select("settings, styles")
      .eq("draft_id", data.id)
      .maybeSingle()
  ]);

  const pages = (pagesData ?? []).map((page) => ({
    id: page.id,
    slug: page.slug,
    title: page.title,
    body: page.is_home && !page.content?.trim() ? defaultHomeContent : page.content ?? "",
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
  const author = settings.author as Record<string, unknown> | undefined;

  const result: LoadedDraftResult = {
    draftState,
    pages,
    draftPageSlugs,
    initialActivePreviewSlug
  };

  if (typeof settings.title === "string") result.siteTitle = settings.title;
  else if (solidary?.title) result.siteTitle = solidary.title;

  if (typeof settings.description === "string") result.siteDescription = settings.description;
  else if (solidary?.description) result.siteDescription = solidary.description;

  if (typeof settings.siteUrl === "string") result.siteUrl = settings.siteUrl;
  else if (solidary?.site_url) result.siteUrl = solidary.site_url;

  if (typeof settings.locale === "string") result.siteLocale = settings.locale;
  if (typeof author?.name === "string") result.authorName = author.name;
  if (typeof author?.email === "string") result.authorEmail = author.email;
  if (typeof author?.url === "string") result.authorUrl = author.url;
  if (typeof styles.tokensCss === "string") result.tokensCss = styles.tokensCss;

  if (solidary?.image_url) {
    const canonicalUrl = solidary.site_url ?? "";
    result.siteImagePreview = resolveImagePreviewUrl(solidary.image_url, canonicalUrl);
    result.draftImageUrl = solidary.image_url;
  }

  return result;
};
