import { useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../../../../features/auth/hooks/useAuth";
import {
  buildDraftSaveSignature,
  MAX_IMAGE_UPLOAD_BYTES
} from "../services/draft-utils";
import { type SectionLockRecord } from "../services/locks";
import type {
  BuilderSection,
  BuilderSettingsSection,
  DraftState,
  PublishFeedback,
  SiteAccessRole
} from "../services/types";
import { useDraftPresence } from "./useDraftPresence";
import { useBuilderSectionNavigation } from "./useBuilderSectionNavigation";
import { useDraftSectionLocks } from "./useDraftSectionLocks";
import { usePublishStatusTracking } from "./usePublishStatusTracking";
import { stripFrontmatter } from "../services/utils";
import type { NoticeKind } from "../../../../../types/notice";
import {
  GLOBAL_STYLES_TEMPLATE as globalStylesTemplate,
  HOME_PAGE_TEMPLATE as homeTemplate,
  STRUCTURE_TEMPLATE as structureTemplate,
  TEMPLATE_SOLIDARY as templateSolidary,
  TEMPLATE_SOLIDARY_LINKS as templateSolidaryLinks,
  TOKENS_TEMPLATE as tokensTemplate
} from "../../../../../../templates/site";
import { slugify } from "../../../../../lib/slugify";
import { useBuilderCollaborators } from "./useBuilderCollaborators";
import { useBuilderPageEditing } from "./useBuilderPageEditing";
import { useBuilderPreviewEditor } from "./useBuilderPreviewEditor";
import { useSiteBuilderAccessAndLocks } from "./useSiteBuilderAccessAndLocks";
import { useBuilderDocumentState } from "./controller/useBuilderDocumentState";
import { useBuilderRouteEffects } from "./controller/useBuilderRouteEffects";
import { useDeleteDraftPageAction } from "./controller/useDeleteDraftPageAction";
import { buildContentSectionProps } from "./controller/view-models/buildContentSectionProps";
import { buildSettingsRouteContext } from "./controller/view-models/buildSettingsRouteContext";
import { buildTopbarProps } from "./controller/view-models/buildTopbarProps";
import type { SiteBuilderViewModels } from "./controller/view-models/types";
import { useSiteBuilderDraftLifecycle } from "./useSiteBuilderDraftLifecycle";
import { defaultStyleMode, useSiteBuilderStyleMediaManager } from "./useSiteBuilderStyleMediaManager";
import {
  useSiteBuilderLiveSettingsActions
} from "./useSiteBuilderLiveSettingsActions";
import { useSiteBuilderSavePublishActions } from "./useSiteBuilderSavePublishActions";
const defaultHomeContent = stripFrontmatter(homeTemplate);

type UseSiteBuilderRouteControllerOptions = {
  mode?: "editor" | "settings";
};

export const useSiteBuilderRouteController = ({
  mode = "editor"
}: UseSiteBuilderRouteControllerOptions = {}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const [notice, setNotice] = useState<string | null>(null);
  const [noticeKind, setNoticeKind] = useState<NoticeKind>(null);
  const { session, sessionResolved } = useAuth();
  const [activeSection, setActiveSection] = useState<BuilderSection>(
    mode === "settings" ? "content" : "menu"
  );
  const [activeSettingsSection, setActiveSettingsSection] = useState<BuilderSettingsSection>("pages");
  const [isPageEditingMode, setIsPageEditingMode] = useState(false);
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [provisionStep, setProvisionStep] = useState("Preparing your updates...");
  const documentState = useBuilderDocumentState();
  const {
    siteTitle,
    setSiteTitle,
    siteDescription,
    setSiteDescription,
    siteUrl,
    setSiteUrl,
    setDynamicImageLoadingEnabled,
    siteImage,
    siteImagePreview,
    setSiteImagePreview,
    draftImageUrl,
    setDraftImageUrl,
    pages,
    setPages,
    draftImages,
    setDraftImages,
    draftPageSlugs,
    setDraftPageSlugs,
    activePreviewSlug,
    setActivePreviewSlug,
    setHeaderDisabled,
    setHeaderFixed,
    setHeaderBrandText,
    setHeaderBrandDisabled,
    setFooterDisabled,
    setFooterFixed,
    setFooterModules,
    setHeadHtml,
    setSeoLocale,
    setSeoTwitter,
    setSeoOpenGraph,
    setSeoStructuredData,
    setSeoIndexFollow,
    siteSettingsInput,
    draftSaveImageUrl
  } = documentState;

  const [draftState, setDraftState] = useState<DraftState | null>(null);
  const [siteAccessRole, setSiteAccessRole] = useState<SiteAccessRole | null>(null);
  const [isDraftLoading, setIsDraftLoading] = useState(() => {
    const initialDraftId =
      searchParams.get("draftId") ?? (location.state as { draftId?: string } | null)?.draftId;
    return Boolean(initialDraftId);
  });
  const [draftLoadError, setDraftLoadError] = useState<string | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [publishFeedback, setPublishFeedback] = useState<PublishFeedback | null>(null);
  const [lastSavedDraftSignature, setLastSavedDraftSignature] = useState("");
  const [sectionLocks, setSectionLocks] = useState<SectionLockRecord>({});
  const [isPreviewFullscreen, setIsPreviewFullscreen] = useState(false);
  const [deletePageBusy, setDeletePageBusy] = useState(false);

  const pageTitleRef = useRef<HTMLInputElement | null>(null);
  const hasInitializedHeaderBrand = useRef(false);
  const cleanedPublishedDraftIdRef = useRef<string | null>(null);
  const shouldCaptureLoadedDraftSignature = useRef(false);
  const hasUnsavedChangesRef = useRef(false);
  const touchedPageSlugsRef = useRef<Set<string>>(new Set());
  const deletedPageSlugsRef = useRef<Set<string>>(new Set());

  const draftId = useMemo(
    () => searchParams.get("draftId") ?? (location.state as { draftId?: string } | null)?.draftId ?? null,
    [location.state, searchParams]
  );
  const builderRoutePath = mode === "settings" ? "/studio/settings" : "/studio/builder";
  const computedSlug = useMemo(() => slugify(siteTitle), [siteTitle]);
  const shouldLoadDraft = Boolean(draftId);
  const sessionUserId = session?.user.id ?? null;
  const {
    isOwnerOnOwnerDraft,
    canEditDraft,
    canDirectPublish,
    canPublishByRole,
    activeEditableSection,
    activeLockKey,
    activeSectionLockedByOther,
    sidebarSectionLocks,
    pageLocksBySlug,
    hasForeignSectionLocks,
    canEditPageContent,
    metadataLock,
    metadataLockedByOther,
    showMetadataFullView
  } = useSiteBuilderAccessAndLocks({
    activeSection,
    activeSettingsSection,
    isPageEditingMode,
    activePreviewSlug,
    pages,
    sectionLocks,
    siteAccessRole,
    draftState,
    sessionUserId
  });
  const collaborators = useBuilderCollaborators({
    draftId: draftState?.id ?? null,
    isOwnerOnOwnerDraft,
    session,
    setNotice,
    setNoticeKind
  });
  const { resetCollaborators } = collaborators;
  const previewEditor = useBuilderPreviewEditor({
    canEditPageContent,
    session,
    draftState,
    setNotice,
    setNoticeKind,
    setDraftImages
  });
  const {
    previewRef,
    selectedEditorImage,
    selectedEditorElement,
    setSelectedEditorImage,
    setSelectedEditorElement,
    uploadingInlineImage,
    runPreviewCommand,
    runPreviewLink,
    capturePreviewSelection,
    handleInlineImageUpload,
    handleSelectedEditorImageAltChange,
    handleSelectedEditorImageCaptionChange,
    handleSelectedEditorImageSizeChange,
    handleSelectedEditorElementClassNameChange,
    handleSelectedEditorElementInlineStyleChange,
    clearSelectedEditorImage
  } = previewEditor;
  const sessionDisplayName = useMemo(() => {
    const metadata = (session?.user.user_metadata ?? {}) as Record<string, unknown>;
    const candidates = [
      metadata.user_name,
      metadata.preferred_username,
      metadata.name,
      session?.user.email
    ];
    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    }
    return "Unknown";
  }, [session]);
  const sessionAvatarUrl = useMemo(() => {
    const metadata = (session?.user.user_metadata ?? {}) as Record<string, unknown>;
    const candidates = [metadata.avatar_url, metadata.picture];
    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    }
    return null;
  }, [session]);
  const presenceSurface = mode === "settings" ? "settings" : "builder";
  const { activePresenceMembers } = useDraftPresence({
    draftId: draftState?.id ?? null,
    sessionUserId,
    sessionDisplayName,
    siteAccessRole,
    activePreviewSlug,
    surface: presenceSurface
  });
  const collaboratorPresenceNames = useMemo(
    () =>
      activePresenceMembers
        .filter((member) => member.userId !== sessionUserId)
        .map((member) => member.name),
    [activePresenceMembers, sessionUserId]
  );
  const publishedSiteBaseUrl = useMemo(() => {
    if (publishFeedback?.kind !== "success") return null;
    if (!canDirectPublish) return null;
    const candidate = publishFeedback.pagesUrl?.trim() || siteUrl.trim();
    return candidate || null;
  }, [canDirectPublish, publishFeedback, siteUrl]);
  const canDeleteSite = Boolean(isOwnerOnOwnerDraft && draftState?.siteId);
  const deleteSiteRepoFullName = draftState?.repoFullName ?? "";
  const styleMedia = useSiteBuilderStyleMediaManager({
    activeSection,
    activeSettingsSection,
    draftState,
    siteUrl,
    publishedSiteBaseUrl,
    pages,
    hasUnsavedChangesRef,
    shouldCaptureLoadedDraftSignatureRef: shouldCaptureLoadedDraftSignature,
    setNotice,
    setNoticeKind
  });
  const {
    styleSettings,
    setTokensCss,
    setStyleMode,
    setAdvancedStructureCss,
    setBaseStructureCss,
    setBaseGlobalCss
  } = styleMedia;
  const currentDraftSignature = useMemo(() => {
    if (!draftState) return "";
    return buildDraftSaveSignature({
      draftId: draftState.id,
      settingsInput: siteSettingsInput,
      imageUrl: draftSaveImageUrl,
      styles: styleSettings,
      pagesSnapshot: pages,
      draftImages
    });
  }, [draftImages, draftSaveImageUrl, draftState, pages, siteSettingsInput, styleSettings]);
  const hasUnsavedChanges =
    Boolean(draftState) && !isDraftLoading && currentDraftSignature !== lastSavedDraftSignature;

  const { startPublishStatusTracking, cancelPublishStatusTracking } = usePublishStatusTracking({
    onPublishFeedback: setPublishFeedback,
    onPublishError: (message) => {
      setNotice(message);
      setNoticeKind("error");
    },
    onPublishSuccess: (message) => {
      setNotice(message);
      setNoticeKind("notice");
    }
  });

  const { reloadLatestDraftAfterConflict, refreshDraftAfterSectionChange } = useSiteBuilderDraftLifecycle({
    builderRoutePath,
    draftId,
    sessionResolved,
    sessionUserId,
    defaultHomeContent,
    defaultTokensCss: tokensTemplate,
    defaultStylesMode: defaultStyleMode,
    defaultBaseStructureCss: structureTemplate,
    defaultBaseGlobalCss: globalStylesTemplate,
    activePreviewSlug,
    currentDraftSignature,
    draftState,
    isDraftLoading,
    navigate,
    resetCollaborators,
    setNotice,
    setNoticeKind,
    setDraftState,
    setSiteAccessRole,
    setDraftImages,
    setPages,
    setDraftPageSlugs,
    setActivePreviewSlug,
    setSiteTitle,
    setHeaderDisabled,
    setHeaderFixed,
    setHeaderBrandText,
    setHeaderBrandDisabled,
    setSiteDescription,
    setSiteUrl,
    setDynamicImageLoadingEnabled,
    setTokensCss,
    setStyleMode,
    setAdvancedStructureCss,
    setBaseStructureCss,
    setBaseGlobalCss,
    setSiteImagePreview,
    setDraftImageUrl,
    setFooterDisabled,
    setFooterFixed,
    setFooterModules,
    setHeadHtml,
    setSeoLocale,
    setSeoTwitter,
    setSeoOpenGraph,
    setSeoStructuredData,
    setSeoIndexFollow,
    setIsDraftLoading,
    setDraftLoadError,
    setIsPageEditingMode,
    setLastSavedDraftSignature,
    setSectionLocks,
    hasInitializedHeaderBrandRef: hasInitializedHeaderBrand,
    cleanedPublishedDraftIdRef: cleanedPublishedDraftIdRef,
    shouldCaptureLoadedDraftSignatureRef: shouldCaptureLoadedDraftSignature,
    touchedPageSlugsRef,
    deletedPageSlugsRef
  });

  useBuilderRouteEffects({
    draftState,
    publishedSiteBaseUrl,
    publishFeedback,
    sessionAccessToken: session?.access_token?.trim() ?? null,
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
  });

  const lockHeartbeatKey = mode === "settings" ? null : activeLockKey;
  const { loadSectionLocks, acquireSectionLock, releaseSectionLock } = useDraftSectionLocks({
    draftId: draftState?.id ?? null,
    sessionUserId,
    canEditDraft,
    sessionDisplayName,
    sessionAvatarUrl,
    activeLockKey: lockHeartbeatKey,
    scope: mode === "settings" ? "settings" : "builder",
    setSectionLocks
  });

  const { saveSectionByKey, handlePublish, handleSaveDraft } = useSiteBuilderSavePublishActions({
    canEditDraft,
    canPublishByRole,
    canDirectPublish,
    hasForeignSectionLocks,
    activeEditableSection,
    sectionLocks,
    activePreviewSlug,
    sessionUserId,
    session,
    siteTitle,
    siteDescription,
    siteUrl,
    siteImage,
    siteImagePreview,
    draftImageUrl,
    draftSaveImageUrl,
    computedSlug,
    pages,
    draftImages,
    draftPageSlugs,
    draftState,
    siteSettingsInput,
    styles: styleSettings,
    templateSolidary,
    templateSolidaryLinks,
    defaultHomeContent,
    hasUnsavedChanges,
    currentDraftSignature,
    savingDraft,
    sessionDisplayName,
    touchedPageSlugsRef,
    deletedPageSlugsRef,
    cleanedPublishedDraftIdRef,
    setNotice,
    setNoticeKind,
    setPublishFeedback,
    setIsProvisioning,
    setProvisionStep,
    setDraftState,
    setPages,
    setDraftImages,
    setDraftPageSlugs,
    setDraftImageUrl,
    setLastSavedDraftSignature,
    setSavingDraft,
    startPublishStatusTracking,
    cancelPublishStatusTracking,
    reloadLatestDraftAfterConflict
  });

  const {
    switchEditorSection,
    handleActivePreviewSlugChange,
    handleSectionChange,
    handleSettingsSectionChange,
    handleEnterPageEditingMode: runHandleEnterPageEditingMode,
    handleExitPageEditingMode
  } = useBuilderSectionNavigation({
    activeSection,
    activeSettingsSection,
    isPageEditingMode,
    activePreviewSlug,
    pages,
    sectionLocks,
    canEditDraft,
    sessionUserId,
    draftStateId: draftState?.id ?? null,
    hasUnsavedChanges,
    currentDraftSignature,
    saveSectionByKey,
    acquireSectionLock,
    releaseSectionLock,
    loadSectionLocks,
    refreshDraftAfterSectionChange,
    reloadLatestDraftAfterConflict,
    setLastSavedDraftSignature,
    setActiveSection,
    setActiveSettingsSection,
    setActivePreviewSlug,
    setIsPageEditingMode,
    clearSelectedEditorImage,
    setNotice,
    setNoticeKind
  });
  const pageEditing = useBuilderPageEditing({
    pages,
    activePreviewSlug,
    setPages,
    setActivePreviewSlug,
    setFooterModules,
    pageTitleRef,
    touchedPageSlugsRef,
    deletedPageSlugsRef,
    switchEditorSection
  });

  const handleEnterPageEditingMode = async (slug: string) => {
    await runHandleEnterPageEditingMode(slug);
    requestAnimationFrame(() => pageTitleRef.current?.focus());
  };
  const handleDeletePage = useDeleteDraftPageAction({
    draftState,
    canEditDraft,
    pages,
    setPages,
    setDraftPageSlugs,
    setActivePreviewSlug,
    setIsPageEditingMode,
    setSelectedEditorElement,
    clearSelectedEditorImage,
    releaseSectionLock,
    setDeletePageBusy,
    touchedPageSlugsRef,
    deletedPageSlugsRef,
    setNotice,
    setNoticeKind,
    setDraftState
  });
  const liveSettings = useSiteBuilderLiveSettingsActions({
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
    styles: styleSettings,
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
  });

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

  const viewModels: SiteBuilderViewModels = {
    settingsRouteContext: buildSettingsRouteContext({
      draftId: draftState?.id ?? null,
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
    metadataLockHolderName: metadataLock?.holderName ?? "Another user",
    showTopbar,
    showPreviewPanel,
    bodyClassName,
    topbarProps: buildTopbarProps({
      onRunFormatCommand: runPreviewCommand,
      onRunFormatLink: runPreviewLink,
      onUploadFormatImage: handleInlineImageUpload,
      onCaptureFormatSelection: capturePreviewSelection,
      isFormatImageUploading: uploadingInlineImage,
      maxFormatImageUploadBytes: MAX_IMAGE_UPLOAD_BYTES
    }),
    contentSectionProps: buildContentSectionProps({
      documentState,
      collaborators,
      canDeleteSite,
      deleteSiteRepoFullName,
      liveSettings,
      hasUnsavedChanges
    }),
    sidebarProps: {
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
        if (
          activeSection === "settings" &&
          activeSettingsSection === "pages" &&
          isPageEditingMode
        ) {
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
      pageDeleteBusy: deletePageBusy,
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
      selectedEditorImage,
      selectedEditorElement,
      onSelectedEditorImageAltChange: handleSelectedEditorImageAltChange,
      onSelectedEditorImageCaptionChange: handleSelectedEditorImageCaptionChange,
      onSelectedEditorImageSizeChange: handleSelectedEditorImageSizeChange,
      onSelectedEditorElementClassNameChange: handleSelectedEditorElementClassNameChange,
      onSelectedEditorElementInlineStyleChange: handleSelectedEditorElementInlineStyleChange
    },
    previewPanelProps: {
      shouldLoadDraft,
      isDraftLoading,
      draftLoadError,
      canEditContent: canEditPageContent,
      showStylesHoverInspector:
        activeSection === "settings" && activeSettingsSection === "styles",
      mobilePreviewEnabled: styleMedia.mobilePreviewEnabled,
      previewRef,
      headHtml: documentState.headHtml,
      previewBrand: documentState.siteTitle,
      pages: documentState.pages,
      draftImages: documentState.draftImages,
      repoFontsCss: styleMedia.repoFontsCss,
      tokensCss: styleMedia.tokensCss,
      styleMode: styleMedia.styleMode,
      advancedStructureCss: styleMedia.advancedStructureCss,
      previewStylesCss: styleMedia.previewStylesCss,
      dynamicImageLoadingEnabled: documentState.dynamicImageLoadingEnabled,
      homeFallbackBody: defaultHomeContent,
      activePreviewSlug: documentState.activePreviewSlug,
      publishedSiteBaseUrl,
      previewAssetBaseUrl: styleMedia.previewAssetBaseUrl,
      header: {
        disabled: documentState.headerDisabled,
        fixed: documentState.headerFixed,
        brandText: documentState.headerBrandText,
        disableBrand: documentState.headerBrandDisabled
      },
      footer: {
        disabled: documentState.footerDisabled,
        fixed: documentState.footerFixed,
        modules: documentState.footerModules
      },
      onActivePreviewSlugChange: (slug: string) => {
        void handleActivePreviewSlugChange(slug);
      },
      onPageBodyChange: pageEditing.updatePageBody,
      onSelectedImageChange: setSelectedEditorImage,
      onSelectedElementChange: setSelectedEditorElement
    }
  };

  return {
    session,
    notice,
    noticeKind,
    ...viewModels,
    isPreviewFullscreen,
    setIsPreviewFullscreen,
  };
};
