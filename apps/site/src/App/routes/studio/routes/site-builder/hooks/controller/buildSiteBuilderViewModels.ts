import { buildContentSectionProps } from "./view-models/buildContentSectionProps";
import { buildPreviewPanelProps } from "./view-models/buildPreviewPanelProps";
import { buildSettingsRouteContext } from "./view-models/buildSettingsRouteContext";
import { buildSidebarProps } from "./view-models/buildSidebarProps";
import { buildTopbarProps } from "./view-models/buildTopbarProps";
import type { BuildSiteBuilderViewModelsOptions, SiteBuilderViewModels } from "./view-models/types";

export const buildSiteBuilderViewModels = ({
  draftState,
  canEditDraft,
  siteAccessRole,
  hasUnsavedChanges,
  savingDraft,
  activeSection,
  activeSettingsSection,
  isPageEditingMode,
  showMetadataFullView,
  metadataLockedByOther,
  metadataLockHolderName,
  canEditPageContent,
  canPublishByRole,
  canDirectPublish,
  hasForeignSectionLocks,
  activeEditableSection,
  activeSectionLockedByOther,
  isProvisioning,
  provisionStep,
  publishFeedback,
  shouldLoadDraft,
  isDraftLoading,
  draftLoadError,
  isPreviewFullscreen,
  setIsPreviewFullscreen,
  documentState,
  pageTitleRef,
  collaborators,
  collaboratorPresenceNames,
  previewEditor,
  pageEditing,
  styleMedia,
  liveSettings,
  pageLocksBySlug,
  sidebarSectionLocks,
  publishedSiteBaseUrl,
  defaultHomeContent,
  pageDeleteBusy,
  handleDeletePage,
  handleEnterPageEditingMode,
  handleSaveDraft,
  handlePublish,
  handleSectionChange,
  handleSettingsSectionChange,
  handleExitPageEditingMode,
  handleActivePreviewSlugChange,
  maxFormatImageUploadBytes,
  draftId,
  canDeleteSite,
  deleteSiteRepoFullName,
  sessionUserId,
  sessionDisplayName,
  sessionAvatarUrl
}: BuildSiteBuilderViewModelsOptions): SiteBuilderViewModels => {
  const isMediaManagerView =
    activeSection === "settings" && activeSettingsSection === "media";
  const canFormatText =
    !(shouldLoadDraft && isDraftLoading) && !draftLoadError && canEditPageContent;
  const canSaveDraft =
    Boolean(draftState) &&
    canEditDraft &&
    !savingDraft &&
    hasUnsavedChanges &&
    Boolean(activeEditableSection) &&
    !activeSectionLockedByOther;
  const hasSavedPendingPublishChanges = Boolean(draftState?.hasPublishPendingChanges);
  const canPublish =
    !isProvisioning &&
    Boolean(draftState) &&
    canPublishByRole &&
    publishFeedback?.kind !== "progress" &&
    !hasUnsavedChanges &&
    hasSavedPendingPublishChanges &&
    (!canDirectPublish || !hasForeignSectionLocks);
  const canEditPageJavaScript = siteAccessRole === "owner" || siteAccessRole === "admin";
  const publishMode: "direct" | "pull_request" = canDirectPublish ? "direct" : "pull_request";
  const publishButtonLabel = canDirectPublish ? "Publish Site" : "Suggest Edits";
  const showTopbar =
    activeSection === "settings" &&
    activeSettingsSection === "pages" &&
    isPageEditingMode &&
    canFormatText;
  const showPreviewPanel = !isMediaManagerView;
  const showFullFrameSidebar = showMetadataFullView || isMediaManagerView;
  const isAdvancedStylesView =
    activeSection === "settings" &&
    activeSettingsSection === "styles" &&
    styleMedia.styleMode === "advanced" &&
    !showFullFrameSidebar;
  const isSidebarCollapsed = !isMediaManagerView && isPreviewFullscreen;
  const bodyClassName = `builder-body ${isSidebarCollapsed ? "is-preview-fullscreen" : ""} ${
    showFullFrameSidebar ? "is-settings-full" : ""
  } ${isAdvancedStylesView ? "is-advanced-styles" : ""}`.trim();

  return {
    settingsRouteContext: buildSettingsRouteContext({
      draftId,
      sessionUserId,
      canEditDraft,
      sessionDisplayName,
      sessionAvatarUrl,
      siteAccessRole,
      hasUnsavedChanges,
      savingDraft,
      liveSettings
    }),
    showMetadataFullView,
    metadataLockedByOther,
    metadataLockHolderName,
    showTopbar,
    showPreviewPanel,
    bodyClassName,
    topbarProps: buildTopbarProps({
      onRunFormatCommand: previewEditor.runPreviewCommand,
      onRunFormatLink: previewEditor.runPreviewLink,
      onUploadFormatImage: previewEditor.handleInlineImageUpload,
      onCaptureFormatSelection: previewEditor.capturePreviewSelection,
      isFormatImageUploading: previewEditor.uploadingInlineImage,
      maxFormatImageUploadBytes
    }),
    contentSectionProps: buildContentSectionProps({
      documentState,
      collaborators,
      canDeleteSite,
      deleteSiteRepoFullName,
      liveSettings,
      hasUnsavedChanges
    }),
    sidebarProps: buildSidebarProps({
      activeSection,
      activeSettingsSection,
      isPageEditingMode,
      canEditDraft,
      siteAccessRole,
      collaboratorPresenceNames,
      savingDraft,
      pageTitleRef,
      documentState,
      pageEditing,
      styleMedia,
      pageLocksBySlug,
      sidebarSectionLocks,
      isProvisioning,
      provisionStep,
      publishFeedback,
      pageDeleteBusy,
      handleDeletePage,
      handleEnterPageEditingMode,
      handleSaveDraft,
      handlePublish,
      handleSectionChange,
      handleSettingsSectionChange,
      handleExitPageEditingMode,
      setIsPreviewFullscreen,
      canSaveDraft,
      canPublish,
      canEditPageJavaScript,
      publishButtonLabel,
      publishMode,
      isSidebarCollapsed,
      selectedEditorImage: previewEditor.selectedEditorImage,
      selectedEditorElement: previewEditor.selectedEditorElement,
      onSelectedEditorImageAltChange: previewEditor.handleSelectedEditorImageAltChange,
      onSelectedEditorImageCaptionChange: previewEditor.handleSelectedEditorImageCaptionChange,
      onSelectedEditorImageSizeChange: previewEditor.handleSelectedEditorImageSizeChange,
      onSelectedEditorElementClassNameChange:
        previewEditor.handleSelectedEditorElementClassNameChange,
      onSelectedEditorElementInlineStyleChange:
        previewEditor.handleSelectedEditorElementInlineStyleChange
    }),
    previewPanelProps: buildPreviewPanelProps({
      shouldLoadDraft,
      isDraftLoading,
      draftLoadError,
      canEditPageContent,
      activeSection,
      activeSettingsSection,
      styleMedia,
      previewEditor,
      documentState,
      defaultHomeContent,
      publishedSiteBaseUrl,
      handleActivePreviewSlugChange,
      pageEditing
    })
  };
};
