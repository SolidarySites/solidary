import { supabase } from "../../../../../lib/supabase";
import { normalizeFooterModules, type DraftSaveSettingsInput } from "./draft-utils";
import type { BuilderStyleSettings, DraftState } from "./types";

export const saveHeaderSection = async ({
  draftState,
  siteSettingsInput,
  markEditorDraftTouched,
  buildDraftSignatureForState
}: {
  draftState: DraftState | null;
  siteSettingsInput: DraftSaveSettingsInput;
  markEditorDraftTouched: (section: "header") => Promise<void>;
  buildDraftSignatureForState: () => string;
}): Promise<string> => {
  if (!draftState) {
    throw new Error("Missing draft data.");
  }
  const { error } = await supabase.rpc("site_draft_upsert_settings_header", {
    p_draft_id: draftState.id,
    p_header: siteSettingsInput.header
  });
  if (error) {
    throw new Error(error.message);
  }

  await markEditorDraftTouched("header");

  return buildDraftSignatureForState();
};

export const saveFooterSection = async ({
  draftState,
  siteSettingsInput,
  markEditorDraftTouched,
  buildDraftSignatureForState
}: {
  draftState: DraftState | null;
  siteSettingsInput: DraftSaveSettingsInput;
  markEditorDraftTouched: (section: "footer") => Promise<void>;
  buildDraftSignatureForState: () => string;
}): Promise<string> => {
  if (!draftState) {
    throw new Error("Missing draft data.");
  }
  const { error } = await supabase.rpc("site_draft_upsert_settings_footer", {
    p_draft_id: draftState.id,
    p_footer: {
      ...siteSettingsInput.footer,
      modules: normalizeFooterModules(siteSettingsInput.footer.modules)
    }
  });
  if (error) {
    throw new Error(error.message);
  }

  await markEditorDraftTouched("footer");

  return buildDraftSignatureForState();
};

export const saveHeadSection = async ({
  draftState,
  siteSettingsInput,
  markEditorDraftTouched,
  buildDraftSignatureForState
}: {
  draftState: DraftState | null;
  siteSettingsInput: DraftSaveSettingsInput;
  markEditorDraftTouched: (section: "head") => Promise<void>;
  buildDraftSignatureForState: () => string;
}): Promise<string> => {
  if (!draftState) {
    throw new Error("Missing draft data.");
  }
  const { error } = await supabase.rpc("site_draft_upsert_settings_head", {
    p_draft_id: draftState.id,
    p_head_html: typeof siteSettingsInput.headHtml === "string" ? siteSettingsInput.headHtml : ""
  });
  if (error) {
    throw new Error(error.message);
  }

  await markEditorDraftTouched("head");

  return buildDraftSignatureForState();
};

export const saveStylesSection = async ({
  draftState,
  styles,
  markEditorDraftTouched,
  buildDraftSignatureForState
}: {
  draftState: DraftState | null;
  styles: BuilderStyleSettings;
  markEditorDraftTouched: (section: "styles") => Promise<void>;
  buildDraftSignatureForState: () => string;
}): Promise<string> => {
  if (!draftState) {
    throw new Error("Missing draft data.");
  }
  const { error } = await supabase
    .from("site_draft_settings")
    .upsert(
      {
        draft_id: draftState.id,
        styles
      },
      { onConflict: "draft_id" }
    );
  if (error) {
    throw new Error(error.message);
  }

  await markEditorDraftTouched("styles");

  return buildDraftSignatureForState();
};
