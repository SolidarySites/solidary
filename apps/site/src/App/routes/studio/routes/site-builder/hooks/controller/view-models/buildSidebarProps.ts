import type { BuilderSidebarProps } from "../../../chrome/BuilderSidebar";
import type { BuildSiteBuilderViewModelsOptions } from "./types";

type BuildSidebarPropsOptions = Pick<
  BuildSiteBuilderViewModelsOptions,
  | "activeSection"
  | "activeSettingsSection"
  | "isPageEditingMode"
  | "canEditDraft"
  | "siteAccessRole"
  | "collaboratorPresenceNames"
  | "savingDraft"
  | "pageTitleRef"
  | "documentState"
  | "pageEditing"
  | "previewEditor"
  | "styleMedia"
  | "pageLocksBySlug"
  | "sidebarSectionLocks"
  | "isProvisioning"
  | "provisionStep"
  | "publishFeedback"
  | "pageDeleteBusy"
  | "handleDeletePage"
  | "handleEnterPageEditingMode"
  | "handleSaveDraft"
  | "handlePublish"
  | "handleSectionChange"
  | "handleSettingsSectionChange"
  | "handleExitPageEditingMode"
  | "setIsPreviewFullscreen"
> & {
  canSaveDraft: boolean;
  canPublish: boolean;
  canEditPageJavaScript: boolean;
  publishButtonLabel: string;
  publishMode: "direct" | "pull_request";
  isSidebarCollapsed: boolean;
};

export const buildSidebarProps = ({
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
  previewEditor,
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
  isSidebarCollapsed
}: BuildSidebarPropsOptions): BuilderSidebarProps => ({
  activeSection,
  activeSettingsSection,
  isPageEditingMode,
  canEditDraft,
  accessRole: siteAccessRole,
  activeCollaborators: collaboratorPresenceNames,
  isPreviewFullscreen: isSidebarCollapsed,
  canSaveDraft,
  savingDraft,
  pages: documentState.pages,
  activePreviewSlug: documentState.activePreviewSlug,
  pageTitleRef,
  tokensCss: styleMedia.tokensCss,
  styleMode: styleMedia.styleMode,
  advancedStructureCss: styleMedia.advancedStructureCss,
  availableFonts: styleMedia.availableFontsForControls,
  fontsLoading: styleMedia.fontsLoading,
  fontsError: styleMedia.fontsError,
  mobilePreviewEnabled: styleMedia.mobilePreviewEnabled,
  mediaWarning: styleMedia.mediaWarning,
  mediaError: styleMedia.mediaError,
  mediaLoading: styleMedia.mediaLoading,
  mediaCanonicalBaseUrl: styleMedia.mediaCanonicalBaseUrl,
  mediaRootFolderNode: styleMedia.mediaRootFolderNode,
  mediaFolderNodes: styleMedia.mediaFolderNodes,
  mediaImageUsageByKey: styleMedia.mediaImageUsageByKey,
  repoFontAssets: styleMedia.repoFontAssets,
  selectedMediaImageFileNames: styleMedia.selectedMediaImageFileNames,
  mediaUploadingImages: styleMedia.mediaUploadingImages,
  mediaRemovingImageKey: styleMedia.mediaRemovingImageKey,
  mediaRenamingImageKey: styleMedia.mediaRenamingImageKey,
  selectedMediaFontFileName: styleMedia.selectedMediaFontFileName,
  mediaFontFamilyName: styleMedia.mediaFontFamilyName,
  mediaUploadingFont: styleMedia.mediaUploadingFont,
  mediaRemovingFontPath: styleMedia.mediaRemovingFontPath,
  headerDisabled: documentState.headerDisabled,
  headerFixed: documentState.headerFixed,
  headerBrandText: documentState.headerBrandText,
  headerBrandDisabled: documentState.headerBrandDisabled,
  headerNavItems: pageEditing.headerNavItems,
  footerDisabled: documentState.footerDisabled,
  footerFixed: documentState.footerFixed,
  footerModules: documentState.footerModules,
  headHtml: documentState.headHtml,
  seoLocale: documentState.seoLocale,
  seoTwitter: documentState.seoTwitter,
  seoOpenGraph: documentState.seoOpenGraph,
  seoStructuredData: documentState.seoStructuredData,
  seoIndexFollow: documentState.seoIndexFollow,
  pageLocksBySlug,
  sectionLocks: sidebarSectionLocks,
  canPublish,
  isProvisioning,
  provisionStep,
  publishFeedback,
  publishButtonLabel,
  publishMode,
  onTogglePreviewFullscreen: () => {
    setIsPreviewFullscreen((value) => !value);
  },
  onBackToMenu: () => {
    if (activeSection === "settings" && activeSettingsSection === "pages" && isPageEditingMode) {
      void handleExitPageEditingMode();
      return;
    }
    void handleSectionChange("menu");
  },
  onSettingsSectionChange: (section) => {
    void handleSettingsSectionChange(section);
  },
  onSaveDraft: () => {
    void handleSaveDraft();
  },
  onPublish: () => {
    void handlePublish();
  },
  onAddPage: pageEditing.addPage,
  onEnterPageEditingMode: (slug) => {
    void handleEnterPageEditingMode(slug);
  },
  onPageTitleChange: pageEditing.handlePageTitleChange,
  onPageSlugChange: pageEditing.handlePageSlugChange,
  pageDeleteBusy,
  onDeletePage: (safeSlug) => {
    void handleDeletePage(safeSlug);
  },
  onPageJavaScriptChange: (safeSlug, value) => {
    if (!canEditPageJavaScript) return;
    pageEditing.updatePageJavaScript(safeSlug, value);
  },
  onTokensCssChange: styleMedia.setTokensCss,
  onStyleModeChange: styleMedia.handleStyleModeChange,
  onAdvancedStructureCssChange: styleMedia.setAdvancedStructureCss,
  onMobilePreviewEnabledChange: styleMedia.setMobilePreviewEnabled,
  onRefreshMediaAssets: () => {
    void styleMedia.refreshMediaAssets();
  },
  onEnsureMediaFolderLoaded: styleMedia.ensureMediaFolderLoaded,
  onImageFilesChange: styleMedia.setSelectedMediaImageFiles,
  onUploadImages: () => {
    void styleMedia.handleUploadMediaImages();
  },
  onRemoveImageObject: (imageObject) => {
    void styleMedia.handleRemoveMediaImageObject(imageObject);
  },
  onRenameImageObject: (imageObject, nextTitle) => {
    void styleMedia.handleRenameMediaImageObject(imageObject, nextTitle);
  },
  onMediaFontFileChange: styleMedia.setSelectedMediaFontFile,
  onMediaFontFamilyNameChange: styleMedia.setMediaFontFamilyName,
  onUploadMediaFont: () => {
    void styleMedia.handleUploadMediaFont();
  },
  onRemoveMediaFont: (entry) => {
    void styleMedia.handleRemoveMediaFont(entry);
  },
  onHeaderDisabledChange: documentState.setHeaderDisabled,
  onHeaderFixedChange: documentState.setHeaderFixed,
  onHeaderBrandTextChange: documentState.setHeaderBrandText,
  onHeaderBrandDisabledChange: documentState.setHeaderBrandDisabled,
  onMoveHeaderNavItemUp: (slug) => pageEditing.moveHeaderNavItem(slug, -1),
  onMoveHeaderNavItemDown: (slug) => pageEditing.moveHeaderNavItem(slug, 1),
  onFooterDisabledChange: documentState.setFooterDisabled,
  onFooterFixedChange: documentState.setFooterFixed,
  onFooterModuleContentChange: pageEditing.updateFooterModuleContent,
  onFooterModuleAlignmentChange: pageEditing.updateFooterModuleAlignment,
  onMoveFooterModuleUp: (index) => pageEditing.moveFooterModule(index, -1),
  onMoveFooterModuleDown: (index) => pageEditing.moveFooterModule(index, 1),
  onSeoLocaleChange: documentState.setSeoLocale,
  onSeoTwitterChange: documentState.setSeoTwitter,
  onSeoOpenGraphChange: documentState.setSeoOpenGraph,
  onSeoStructuredDataChange: documentState.setSeoStructuredData,
  onSeoIndexFollowChange: documentState.setSeoIndexFollow,
  onHeadHtmlChange: documentState.setHeadHtml,
  selectedEditorImage: previewEditor.selectedEditorImage,
  selectedEditorElement: previewEditor.selectedEditorElement,
  onSelectedEditorImageAltChange: previewEditor.handleSelectedEditorImageAltChange,
  onSelectedEditorImageCaptionChange: previewEditor.handleSelectedEditorImageCaptionChange,
  onSelectedEditorImageSizeChange: previewEditor.handleSelectedEditorImageSizeChange,
  onSelectedEditorElementClassNameChange: previewEditor.handleSelectedEditorElementClassNameChange,
  onSelectedEditorElementInlineStyleChange: previewEditor.handleSelectedEditorElementInlineStyleChange
});
