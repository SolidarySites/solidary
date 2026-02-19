import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { supabase } from "../../../lib/supabase";
import { buildSolidaryFile } from "./build-files";
import { FILE_KEYS } from "./constants";
import {
  buildDraftPageRows,
  DEFAULT_OG_IMAGE_URL,
  replaceDraftImageUrlsWithSitePaths,
  type DraftSaveSettingsInput
} from "./draft-utils";
import type { BuilderPage, DraftImageAsset, DraftState } from "./types";
import { normalizePageSlug } from "./utils";

type SetPages = Dispatch<SetStateAction<BuilderPage[]>>;
type SetDraftPageSlugs = Dispatch<SetStateAction<string[]>>;
type SetOfSlugsRef = MutableRefObject<Set<string>>;

type DraftRevisionRow = {
  revision: number | null;
  last_edited_at: string | null;
  last_edited_by_user_id: string | null;
};

export const saveMetadataSection = async ({
  draftState,
  siteImage,
  draftImageUrl,
  siteImagePreview,
  templateSolidary,
  siteSettingsInput,
  siteUrl,
  sessionUserId,
  applyDraftRevisionRow,
  updateDraftSolidaryFile,
  markEditorDraftTouched,
  buildDraftSignatureForState
}: {
  draftState: DraftState | null;
  siteImage: File | null;
  draftImageUrl: string | null;
  siteImagePreview: string | null;
  templateSolidary: string;
  siteSettingsInput: DraftSaveSettingsInput;
  siteUrl: string;
  sessionUserId: string | null;
  applyDraftRevisionRow: (draftRow: DraftRevisionRow | null | undefined) => void;
  updateDraftSolidaryFile: (solidaryFile: string) => void;
  markEditorDraftTouched: (section: "metadata") => Promise<void>;
  buildDraftSignatureForState: (options: { imageUrl: string }) => string;
}): Promise<string> => {
  if (!draftState) {
    throw new Error("Missing draft data.");
  }

  const imageUrl = siteImage
    ? draftImageUrl || DEFAULT_OG_IMAGE_URL
    : siteImagePreview || draftImageUrl || DEFAULT_OG_IMAGE_URL;
  const solidaryFile = buildSolidaryFile({
    templateSolidary,
    siteId: draftState.siteId,
    imageUrl,
    settingsInput: siteSettingsInput,
    urlOverride: siteUrl
  });
  const nowIso = new Date().toISOString();
  const editorUserId = sessionUserId;
  const { data: draftRow, error: draftError } = await supabase
    .from("site_drafts")
    .update({
      branch: draftState.branch,
      commit_sha: "",
      files: {
        [FILE_KEYS.solidary]: solidaryFile
      },
      last_edited_by_user_id: editorUserId,
      last_edited_at: nowIso
    })
    .eq("id", draftState.id)
    .select("revision, last_edited_at, last_edited_by_user_id")
    .maybeSingle();
  if (draftError) {
    throw new Error(draftError.message);
  }
  if (!draftRow) {
    throw new Error("Failed to save draft metadata.");
  }
  applyDraftRevisionRow(draftRow);
  updateDraftSolidaryFile(solidaryFile);

  const { error: settingsError } = await supabase.rpc("site_draft_upsert_settings_metadata", {
    p_draft_id: draftState.id,
    p_title: siteSettingsInput.siteTitle,
    p_description: siteSettingsInput.siteDescription,
    p_site_url: siteSettingsInput.siteUrl,
    p_og_image: imageUrl
  });
  if (settingsError) {
    throw new Error(settingsError.message);
  }

  await markEditorDraftTouched("metadata");

  return buildDraftSignatureForState({ imageUrl });
};

export const savePagesSection = async ({
  draftState,
  pages,
  draftImages,
  draftPageSlugs,
  touchedPageSlugsRef,
  deletedPageSlugsRef,
  setPages,
  setDraftPageSlugs,
  markEditorDraftTouched,
  buildDraftSignatureForState
}: {
  draftState: DraftState | null;
  pages: BuilderPage[];
  draftImages: DraftImageAsset[];
  draftPageSlugs: string[];
  touchedPageSlugsRef: SetOfSlugsRef;
  deletedPageSlugsRef: SetOfSlugsRef;
  setPages: SetPages;
  setDraftPageSlugs: SetDraftPageSlugs;
  markEditorDraftTouched: (
    section: "pages",
    touchedPageSlugs?: string[],
    deletedPageSlugs?: string[]
  ) => Promise<void>;
  buildDraftSignatureForState: (options: { pagesSnapshot: BuilderPage[] }) => string;
}): Promise<string> => {
  if (!draftState) {
    throw new Error("Missing draft data.");
  }

  const normalizedPages = pages.map((page) => ({
    ...page,
    body: replaceDraftImageUrlsWithSitePaths(page.body ?? "", draftImages)
  }));
  const pageRows = buildDraftPageRows(draftState.id, normalizedPages, draftImages);
  const currentSlugs = pageRows.map((page) => page.slug);
  const deletedSlugs = draftPageSlugs.filter((slug) => !currentSlugs.includes(slug));
  const touchedPageSlugs = Array.from(touchedPageSlugsRef.current)
    .map((entry) => normalizePageSlug(entry))
    .filter(Boolean);
  const touchedPageSlugSet = new Set(touchedPageSlugs);
  const upsertRows = pageRows.filter((row) => touchedPageSlugSet.has(normalizePageSlug(row.slug)));

  if (deletedSlugs.length) {
    const { error: deleteError } = await supabase
      .from("site_draft_pages")
      .delete()
      .eq("draft_id", draftState.id)
      .in("slug", deletedSlugs);
    if (deleteError) {
      throw new Error(deleteError.message);
    }
  }

  if (upsertRows.length) {
    const { error: upsertError } = await supabase
      .from("site_draft_pages")
      .upsert(upsertRows, { onConflict: "draft_id,slug" });
    if (upsertError) {
      throw new Error(upsertError.message);
    }
  }

  setPages(normalizedPages);
  setDraftPageSlugs(pageRows.map((page) => page.slug));

  const deletedPageSlugs = Array.from(
    new Set([
      ...deletedSlugs.map((entry) => entry.trim().toLowerCase()).filter(Boolean),
      ...Array.from(deletedPageSlugsRef.current)
    ])
  );
  if (touchedPageSlugs.length || deletedPageSlugs.length) {
    await markEditorDraftTouched("pages", touchedPageSlugs, deletedPageSlugs);
  }
  touchedPageSlugsRef.current.clear();
  deletedPageSlugsRef.current.clear();

  return buildDraftSignatureForState({ pagesSnapshot: normalizedPages });
};
