import {
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
  useEffect
} from "react";
import type { NoticeKind } from "../../../../../../types/notice";
import type {
  BuilderSection,
  BuilderSettingsSection,
  DraftImageAsset,
  DraftState,
  PublishFeedback
} from "../../services/types";
import { useBeforeUnloadWarningEffect } from "./effects/useBeforeUnloadWarningEffect";
import { useBuilderAccessModeEffect } from "./effects/useBuilderAccessModeEffect";
import { usePageEditingModeResetEffect } from "./effects/usePageEditingModeResetEffect";
import { usePublishedDraftCleanupEffect } from "./effects/usePublishedDraftCleanupEffect";
import { useSiteImagePreviewEffect } from "./effects/useSiteImagePreviewEffect";

type UseBuilderRouteEffectsOptions = {
  draftState: DraftState | null;
  publishedSiteBaseUrl: string | null;
  publishFeedback: PublishFeedback | null;
  sessionAccessToken: string | null;
  setDraftState: Dispatch<SetStateAction<DraftState | null>>;
  setDraftImages: Dispatch<SetStateAction<DraftImageAsset[]>>;
  cleanedPublishedDraftIdRef: MutableRefObject<string | null>;
  setNotice: Dispatch<SetStateAction<string | null>>;
  setNoticeKind: Dispatch<SetStateAction<NoticeKind>>;
  siteImage: File | null;
  setSiteImagePreview: Dispatch<SetStateAction<string | null>>;
  hasUnsavedChanges: boolean;
  hasUnsavedChangesRef: MutableRefObject<boolean>;
  shouldLoadDraft: boolean;
  isDraftLoading: boolean;
  canEditDraft: boolean;
  sessionUserId: string | null;
  activeSection: BuilderSection;
  activeSettingsSection: BuilderSettingsSection;
  isPageEditingMode: boolean;
  setIsPageEditingMode: Dispatch<SetStateAction<boolean>>;
  clearSelectedEditorImage: () => void;
  mode: "editor" | "settings";
  isOwnerOnOwnerDraft: boolean;
  setActiveSection: Dispatch<SetStateAction<BuilderSection>>;
};

export const useBuilderRouteEffects = ({
  draftState,
  publishedSiteBaseUrl,
  publishFeedback,
  sessionAccessToken,
  setDraftState,
  setDraftImages,
  cleanedPublishedDraftIdRef,
  setNotice,
  setNoticeKind,
  siteImage,
  setSiteImagePreview,
  hasUnsavedChanges,
  hasUnsavedChangesRef,
  shouldLoadDraft,
  isDraftLoading,
  canEditDraft,
  sessionUserId,
  activeSection,
  activeSettingsSection,
  isPageEditingMode,
  setIsPageEditingMode,
  clearSelectedEditorImage,
  mode,
  isOwnerOnOwnerDraft,
  setActiveSection
}: UseBuilderRouteEffectsOptions) => {
  useEffect(() => {
    hasUnsavedChangesRef.current = hasUnsavedChanges;
  }, [hasUnsavedChanges, hasUnsavedChangesRef]);

  usePublishedDraftCleanupEffect({
    draftState,
    publishedSiteBaseUrl,
    publishFeedback,
    sessionAccessToken,
    setDraftState,
    setDraftImages,
    cleanedPublishedDraftIdRef,
    setNotice,
    setNoticeKind
  });

  useSiteImagePreviewEffect({
    siteImage,
    setSiteImagePreview
  });

  useBeforeUnloadWarningEffect({
    hasUnsavedChanges
  });

  useBuilderAccessModeEffect({
    shouldLoadDraft,
    isDraftLoading,
    canEditDraft,
    draftState,
    sessionUserId,
    mode,
    activeSection,
    isOwnerOnOwnerDraft,
    setActiveSection
  });

  usePageEditingModeResetEffect({
    activeSection,
    activeSettingsSection,
    isPageEditingMode,
    clearSelectedEditorImage,
    setIsPageEditingMode
  });
};
