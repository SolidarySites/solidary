import {
  buildDraftSaveSignature,
  type DraftSaveSettingsInput
} from "./draft-utils";
import type { BuilderPage, DraftImageAsset, DraftState } from "./types";

export const buildDraftSignatureForState = ({
  draftState,
  siteSettingsInput,
  tokensCss,
  draftImages,
  pagesSnapshot,
  imageUrl
}: {
  draftState: DraftState | null;
  siteSettingsInput: DraftSaveSettingsInput;
  tokensCss: string;
  draftImages: DraftImageAsset[];
  pagesSnapshot: BuilderPage[];
  imageUrl: string;
}): string => {
  if (!draftState) return "";
  return buildDraftSaveSignature({
    draftId: draftState.id,
    settingsInput: siteSettingsInput,
    imageUrl,
    tokensCss,
    pagesSnapshot,
    draftImages
  });
};
