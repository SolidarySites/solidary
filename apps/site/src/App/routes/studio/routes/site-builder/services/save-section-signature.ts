import {
  buildDraftSaveSignature,
  type DraftSaveSettingsInput
} from "./draft-utils";
import type { BuilderPage, BuilderStyleSettings, DraftImageAsset, DraftState } from "./types";

export const buildDraftSignatureForState = ({
  draftState,
  siteSettingsInput,
  styles,
  draftImages,
  pagesSnapshot,
  imageUrl
}: {
  draftState: DraftState | null;
  siteSettingsInput: DraftSaveSettingsInput;
  styles: BuilderStyleSettings;
  draftImages: DraftImageAsset[];
  pagesSnapshot: BuilderPage[];
  imageUrl: string;
}): string => {
  if (!draftState) return "";
  return buildDraftSaveSignature({
    draftId: draftState.id,
    settingsInput: siteSettingsInput,
    imageUrl,
    styles,
    pagesSnapshot,
    draftImages
  });
};
