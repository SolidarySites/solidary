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
    isOwnerOnOwnerDraft,
    canDirectPublish,
    siteTitle,
    siteDescription,
    setSiteUrl,
    draftSaveImageUrl,
    templateSolidary,
    templateSolidaryLinks,
    siteSettingsInput,
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
