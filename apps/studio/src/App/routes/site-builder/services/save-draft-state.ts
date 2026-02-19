import { buildSettingsPayload } from "./build-files";
import { FILE_KEYS } from "./constants";
import { buildDraftPageRows, type DraftSaveSettingsInput } from "./draft-utils";
import type { BuilderPage, DraftImageAsset, DraftState } from "./types";
import { supabase } from "../../../lib/supabase";

export class DraftConflictError extends Error {
  constructor() {
    super("This draft was updated by another collaborator.");
    this.name = "DraftConflictError";
  }
}

export type DraftRevisionRow = {
  revision: number | null;
  last_edited_at: string | null;
  last_edited_by_user_id: string | null;
};

type SaveDraftStateParams = {
  canEditDraft: boolean;
  sessionUserId: string | null;
  repoInfo: DraftState;
  solidaryFile: string;
  imageUrl: string;
  pagesSnapshot: BuilderPage[];
  siteSettingsInput: DraftSaveSettingsInput;
  tokensCss: string;
  draftImages: DraftImageAsset[];
  draftPageSlugs: string[];
  applyDraftRevisionRow: (draftRow: DraftRevisionRow | null | undefined) => void;
  setDraftPageSlugs: (slugs: string[]) => void;
};

export const saveDraftState = async ({
  canEditDraft,
  sessionUserId,
  repoInfo,
  solidaryFile,
  imageUrl,
  pagesSnapshot,
  siteSettingsInput,
  tokensCss,
  draftImages,
  draftPageSlugs,
  applyDraftRevisionRow,
  setDraftPageSlugs
}: SaveDraftStateParams): Promise<void> => {
  if (!canEditDraft) {
    throw new Error("Your current role is read-only for this draft.");
  }

  const nowIso = new Date().toISOString();
  const editorUserId = sessionUserId;
  const { data: draftRow, error: draftUpdateError } = await supabase
    .from("site_drafts")
    .update({
      branch: repoInfo.branch,
      commit_sha: "",
      files: {
        [FILE_KEYS.solidary]: solidaryFile
      },
      last_edited_by_user_id: editorUserId,
      last_edited_at: nowIso
    })
    .eq("id", repoInfo.id)
    .eq("revision", repoInfo.revision)
    .select("owner_user_id, revision, last_edited_at, last_edited_by_user_id")
    .maybeSingle();

  if (draftUpdateError) {
    throw new Error(draftUpdateError.message);
  }
  if (!draftRow) {
    throw new DraftConflictError();
  }

  applyDraftRevisionRow(draftRow);

  const { error: settingsError } = await supabase.from("site_draft_settings").upsert({
    draft_id: repoInfo.id,
    settings: buildSettingsPayload(siteSettingsInput, imageUrl),
    styles: {
      tokensCss
    }
  });

  if (settingsError) {
    throw new Error(settingsError.message);
  }

  const pageRows = buildDraftPageRows(repoInfo.id, pagesSnapshot, draftImages);
  const currentSlugs = pageRows.map((page) => page.slug);
  const deletedSlugs = draftPageSlugs.filter((slug) => !currentSlugs.includes(slug));

  if (deletedSlugs.length) {
    const { error: deleteError } = await supabase
      .from("site_draft_pages")
      .delete()
      .eq("draft_id", repoInfo.id)
      .in("slug", deletedSlugs);

    if (deleteError) {
      throw new Error(deleteError.message);
    }
  }

  const { error: pagesError } = await supabase
    .from("site_draft_pages")
    .upsert(pageRows, { onConflict: "draft_id,slug" });

  if (pagesError) {
    throw new Error(pagesError.message);
  }

  setDraftPageSlugs(pageRows.map((page) => page.slug));
};
