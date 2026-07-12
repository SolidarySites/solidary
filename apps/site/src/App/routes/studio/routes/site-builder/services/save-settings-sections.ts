import { supabase } from "../../../../../lib/supabase";
import { DEFAULT_SEO_SETTINGS, normalizeSeoLocale } from "../../../../../features/site-draft/seo";
import { normalizeFooterModules, type DraftSaveSettingsInput } from "./draft-utils";
import { DraftConflictError, type DraftRevisionRow } from "./save-draft-state";
import type { BuilderStyleSettings, DraftState } from "./types";

const getRpcRevisionRow = (data: unknown): DraftRevisionRow | null => {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return null;
  return row as DraftRevisionRow;
};

export const saveHeaderSection = async ({
  draftState,
  siteSettingsInput,
  markEditorDraftTouched,
  buildDraftSignatureForState,
  applyDraftRevisionRow
}: {
  draftState: DraftState | null;
  siteSettingsInput: DraftSaveSettingsInput;
  markEditorDraftTouched: (section: "header") => Promise<void>;
  buildDraftSignatureForState: () => string;
  applyDraftRevisionRow: (draftRow: DraftRevisionRow | null | undefined) => void;
}): Promise<string> => {
  if (!draftState) {
    throw new Error("Missing draft data.");
  }
  const { data, error } = await supabase.rpc("site_draft_upsert_settings_header", {
    p_draft_id: draftState.id,
    p_header: siteSettingsInput.header
  });
  if (error) {
    throw new Error(error.message);
  }
  const revisionRow = getRpcRevisionRow(data);
  if (!revisionRow) throw new DraftConflictError();
  applyDraftRevisionRow(revisionRow);

  await markEditorDraftTouched("header");

  return buildDraftSignatureForState();
};

export const saveFooterSection = async ({
  draftState,
  siteSettingsInput,
  markEditorDraftTouched,
  buildDraftSignatureForState,
  applyDraftRevisionRow
}: {
  draftState: DraftState | null;
  siteSettingsInput: DraftSaveSettingsInput;
  markEditorDraftTouched: (section: "footer") => Promise<void>;
  buildDraftSignatureForState: () => string;
  applyDraftRevisionRow: (draftRow: DraftRevisionRow | null | undefined) => void;
}): Promise<string> => {
  if (!draftState) {
    throw new Error("Missing draft data.");
  }
  const { data, error } = await supabase.rpc("site_draft_upsert_settings_footer", {
    p_draft_id: draftState.id,
    p_footer: {
      ...siteSettingsInput.footer,
      modules: normalizeFooterModules(siteSettingsInput.footer.modules)
    }
  });
  if (error) {
    throw new Error(error.message);
  }
  const revisionRow = getRpcRevisionRow(data);
  if (!revisionRow) throw new DraftConflictError();
  applyDraftRevisionRow(revisionRow);

  await markEditorDraftTouched("footer");

  return buildDraftSignatureForState();
};

export const saveHeadSection = async ({
  draftState,
  siteSettingsInput,
  markEditorDraftTouched,
  buildDraftSignatureForState,
  applyDraftRevisionRow
}: {
  draftState: DraftState | null;
  siteSettingsInput: DraftSaveSettingsInput;
  markEditorDraftTouched: (section: "head") => Promise<void>;
  buildDraftSignatureForState: () => string;
  applyDraftRevisionRow: (draftRow: DraftRevisionRow | null | undefined) => void;
}): Promise<string> => {
  if (!draftState) {
    throw new Error("Missing draft data.");
  }
  const { data, error } = await supabase.rpc("site_draft_upsert_settings_head", {
    p_draft_id: draftState.id,
    p_head_html: typeof siteSettingsInput.headHtml === "string" ? siteSettingsInput.headHtml : "",
    p_locale: normalizeSeoLocale(siteSettingsInput.locale),
    p_twitter:
      typeof siteSettingsInput.twitter === "boolean"
        ? siteSettingsInput.twitter
        : DEFAULT_SEO_SETTINGS.twitter,
    p_open_graph:
      typeof siteSettingsInput.openGraph === "boolean"
        ? siteSettingsInput.openGraph
        : DEFAULT_SEO_SETTINGS.openGraph,
    p_structured_data:
      typeof siteSettingsInput.structuredData === "boolean"
        ? siteSettingsInput.structuredData
        : DEFAULT_SEO_SETTINGS.structuredData,
    p_index_follow:
      typeof siteSettingsInput.indexFollow === "boolean"
        ? siteSettingsInput.indexFollow
        : DEFAULT_SEO_SETTINGS.indexFollow
  });
  if (error) {
    throw new Error(error.message);
  }
  const revisionRow = getRpcRevisionRow(data);
  if (!revisionRow) throw new DraftConflictError();
  applyDraftRevisionRow(revisionRow);

  await markEditorDraftTouched("head");

  return buildDraftSignatureForState();
};

export const saveStylesSection = async ({
  draftState,
  styles,
  markEditorDraftTouched,
  buildDraftSignatureForState,
  applyDraftRevisionRow
}: {
  draftState: DraftState | null;
  styles: BuilderStyleSettings;
  markEditorDraftTouched: (section: "styles") => Promise<void>;
  buildDraftSignatureForState: () => string;
  applyDraftRevisionRow: (draftRow: DraftRevisionRow | null | undefined) => void;
}): Promise<string> => {
  if (!draftState) {
    throw new Error("Missing draft data.");
  }
  const { data, error } = await supabase.rpc("site_draft_upsert_settings_styles", {
    p_draft_id: draftState.id,
    p_styles: styles
  });
  if (error) {
    throw new Error(error.message);
  }
  const revisionRow = getRpcRevisionRow(data);
  if (!revisionRow) throw new DraftConflictError();
  applyDraftRevisionRow(revisionRow);

  await markEditorDraftTouched("styles");

  return buildDraftSignatureForState();
};
