import type { Dispatch, SetStateAction } from "react";
import { supabase } from "../../../../../lib/supabase";
import type { BuilderEditableSectionKey, DraftState } from "./types";

type SaveEditorTouchedState = Dispatch<SetStateAction<DraftState | null>>;

type SiteEditorTouchedRpcRow = {
  touched_sections?: string[] | null;
  touched_page_slugs?: string[] | null;
  deleted_page_slugs?: string[] | null;
};

export const syncEditorTouchedState = ({
  touchedSections,
  touchedPageSlugs,
  deletedPageSlugs,
  setDraftState
}: {
  touchedSections: string[] | null | undefined;
  touchedPageSlugs: string[] | null | undefined;
  deletedPageSlugs: string[] | null | undefined;
  setDraftState: SaveEditorTouchedState;
}): void => {
  const normalizedTouchedSections = (touchedSections ?? []).filter(
    (entry): entry is BuilderEditableSectionKey =>
      entry === "metadata" ||
      entry === "pages" ||
      entry === "header" ||
      entry === "footer" ||
      entry === "styles"
  );
  const normalizedTouchedPageSlugs = (touchedPageSlugs ?? [])
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  const normalizedDeletedPageSlugs = (deletedPageSlugs ?? [])
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  setDraftState((current) =>
    current
      ? {
          ...current,
          touchedSections: normalizedTouchedSections,
          touchedPageSlugs: normalizedTouchedPageSlugs,
          deletedPageSlugs: normalizedDeletedPageSlugs
        }
      : current
  );
};

export const markEditorDraftTouched = async ({
  draftState,
  section,
  setDraftState,
  touchedPageSlugs = [],
  deletedPageSlugs = []
}: {
  draftState: DraftState | null;
  section: BuilderEditableSectionKey;
  setDraftState: SaveEditorTouchedState;
  touchedPageSlugs?: string[];
  deletedPageSlugs?: string[];
}): Promise<void> => {
  if (!draftState || draftState.draftType !== "editor") return;

  const { data, error } = await supabase.rpc("site_editor_mark_touched", {
    p_draft_id: draftState.id,
    p_section_key: section,
    p_touched_page_slugs: touchedPageSlugs,
    p_deleted_page_slugs: deletedPageSlugs
  });
  if (error) {
    throw new Error(error.message);
  }
  const row =
    Array.isArray(data) && data.length ? (data[0] as SiteEditorTouchedRpcRow) : null;
  if (!row) return;

  syncEditorTouchedState({
    touchedSections: row.touched_sections ?? null,
    touchedPageSlugs: row.touched_page_slugs ?? null,
    deletedPageSlugs: row.deleted_page_slugs ?? null,
    setDraftState
  });
};
