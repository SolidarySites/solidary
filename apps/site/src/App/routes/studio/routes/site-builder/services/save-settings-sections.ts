import { supabase } from "../../../../../lib/supabase";
import { normalizeFooterModules, type DraftSaveSettingsInput } from "./draft-utils";
import type { DraftState } from "./types";

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

export const saveStylesSection = async ({
  draftState,
  tokensCss,
  markEditorDraftTouched,
  buildDraftSignatureForState
}: {
  draftState: DraftState | null;
  tokensCss: string;
  markEditorDraftTouched: (section: "styles") => Promise<void>;
  buildDraftSignatureForState: () => string;
}): Promise<string> => {
  if (!draftState) {
    throw new Error("Missing draft data.");
  }
  const { error } = await supabase.rpc("site_draft_upsert_settings_styles", {
    p_draft_id: draftState.id,
    p_tokens_css: tokensCss
  });
  if (error) {
    throw new Error(error.message);
  }

  await markEditorDraftTouched("styles");

  return buildDraftSignatureForState();
};
