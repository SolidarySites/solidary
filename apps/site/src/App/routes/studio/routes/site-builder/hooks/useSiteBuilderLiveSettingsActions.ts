import type { UseSiteBuilderLiveSettingsActionsOptions } from "./live-settings/types";
import { useLiveSettingsDeleteActions } from "./live-settings/useLiveSettingsDeleteActions";
import { useLiveSettingsDomainActions } from "./live-settings/useLiveSettingsDomainActions";
import { useLiveSettingsPublishingActions } from "./live-settings/useLiveSettingsPublishingActions";

export type { DomainDnsFeedbackState, SiteDeleteMode } from "./live-settings/types";

export const useSiteBuilderLiveSettingsActions = ({
  session,
  draftState,
  canDeleteSite,
  deleteSiteRepoFullName,
  sessionUserId,
  isOwnerOnOwnerDraft,
  canDirectPublish,
  canEditDraft,
  savingDraft,
  hasUnsavedChanges,
  isProvisioning,
  isDraftLoading,
  activeSectionLockedByOther,
  siteTitle,
  siteDescription,
  siteUrl,
  setSiteUrl,
  siteImage,
  siteImagePreview,
  draftImageUrl,
  setDraftImageUrl,
  draftSaveImageUrl,
  pages,
  draftImages,
  styles,
  computedSlug,
  templateSolidary,
  templateSolidaryLinks,
  siteSettingsInput,
  currentDraftSignature,
  saveSectionByKey,
  setLastSavedDraftSignature,
  setSavingDraft,
  setNotice,
  setNoticeKind,
  setDraftState,
  navigate
}: UseSiteBuilderLiveSettingsActionsOptions) => {
  const publishingActions = useLiveSettingsPublishingActions({
    draftState,
    canDirectPublish,
    canEditDraft,
    savingDraft,
    hasUnsavedChanges,
    isProvisioning,
    isDraftLoading,
    activeSectionLockedByOther,
    siteTitle,
    siteDescription,
    siteUrl,
    siteImage,
    siteImagePreview,
    draftImageUrl,
    setDraftImageUrl,
    computedSlug,
    templateSolidary,
    templateSolidaryLinks,
    siteSettingsInput,
    currentDraftSignature,
    saveSectionByKey,
    setLastSavedDraftSignature,
    setSavingDraft,
    setNotice,
    setNoticeKind,
    setDraftState
  });

  const domainActions = useLiveSettingsDomainActions({
    draftState,
    sessionUserId,
    isOwnerOnOwnerDraft,
    canDirectPublish,
    setSiteUrl,
    draftSaveImageUrl,
    pages,
    draftImages,
    styles,
    templateSolidary,
    templateSolidaryLinks,
    siteSettingsInput,
    setLastSavedDraftSignature,
    setNotice,
    setNoticeKind,
    setDraftState
  });

  const deleteActions = useLiveSettingsDeleteActions({
    session,
    draftState,
    canDeleteSite,
    deleteSiteRepoFullName,
    setNotice,
    setNoticeKind,
    navigate
  });

  return {
    ...deleteActions,
    ...domainActions,
    ...publishingActions
  };
};
