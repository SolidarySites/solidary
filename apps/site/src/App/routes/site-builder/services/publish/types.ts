import type { Dispatch, SetStateAction } from "react";
import type { NoticeKind } from "../../../../types/notice";
import type { DraftSaveSettingsInput } from "../draft-utils";
import type {
  BuilderPage,
  DraftImageAsset,
  DraftState,
  PublishFeedback
} from "../types";

export type BatchCommitResponse = {
  commitSha?: string;
  noChanges?: boolean;
};

export type PublishTrackingParams = {
  token: string;
  owner: string;
  repo: string;
  branch: string;
  headSha: string;
  publishStartedAt: string;
};

export type CommonPublishParams = {
  providerToken: string;
  draftState: DraftState;
  siteUrl: string;
  siteImage: File | null;
  siteImagePreview: string | null;
  draftImageUrl: string | null;
  computedSlug: string;
  pages: BuilderPage[];
  draftImages: DraftImageAsset[];
  siteSettingsInput: DraftSaveSettingsInput;
  tokensCss: string;
  templateSolidary: string;
  defaultHomeContent: string;
  setProvisionStep: (step: string) => void;
};

export type PublishOwnerDraftParams = CommonPublishParams & {
  publishStartedAt: string;
  siteTitle: string;
  siteDescription: string;
  saveDraftState: (
    repoInfo: DraftState,
    solidaryFile: string,
    imageUrl: string,
    pagesSnapshot?: BuilderPage[]
  ) => Promise<void>;
  updateDraftSolidaryFile: (solidaryFile: string) => void;
  setPages: Dispatch<SetStateAction<BuilderPage[]>>;
  setDraftImages: Dispatch<SetStateAction<DraftImageAsset[]>>;
  setLastSavedDraftSignature: Dispatch<SetStateAction<string>>;
  setDraftImageUrl: Dispatch<SetStateAction<string | null>>;
  startPublishStatusTracking: (params: PublishTrackingParams) => void;
};

export type PublishEditorDraftParams = CommonPublishParams & {
  sessionAccessToken: string | null;
  sessionDisplayName: string;
  setDraftImageUrl: Dispatch<SetStateAction<string | null>>;
  setDraftState: Dispatch<SetStateAction<DraftState | null>>;
  clearTouchedPageTracking: () => void;
  setLastSavedDraftSignature: Dispatch<SetStateAction<string>>;
  setPublishFeedback: Dispatch<SetStateAction<PublishFeedback | null>>;
  setNotice: Dispatch<SetStateAction<string | null>>;
  setNoticeKind: Dispatch<SetStateAction<NoticeKind>>;
  buildDraftSignatureForState: (options?: {
    pagesSnapshot?: BuilderPage[];
    imageUrl?: string;
  }) => string;
};
