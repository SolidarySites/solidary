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
import templateSolidary from "../../../../../../templates/astro/solidary-links.json?raw";
import homeTemplate from "../../../../../../../../../templates/astro-baseline/src/content/pages/home.md?raw";
import tokensTemplate from "../../../../../../templates/astro/tokens.css?raw";
import structureTemplate from "../../../../../../../../../templates/astro-baseline/src/styles/partials/structure.css?raw";
import globalStylesTemplate from "../../../../../../../../../templates/astro-baseline/src/styles/global.css?raw";
import { slugify } from "../../../../../lib/slugify";
import { useBuilderCollaborators } from "./useBuilderCollaborators";
import { useBuilderPageEditing } from "./useBuilderPageEditing";
import { useBuilderPreviewEditor } from "./useBuilderPreviewEditor";
import { useSiteBuilderAccessAndLocks } from "./useSiteBuilderAccessAndLocks";
import { buildSiteBuilderViewModels } from "./controller/buildSiteBuilderViewModels";
import { useBuilderDocumentState } from "./controller/useBuilderDocumentState";
import { useBuilderRouteEffects } from "./controller/useBuilderRouteEffects";
import { useDeleteDraftPageAction } from "./controller/useDeleteDraftPageAction";
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
  const { clearSelectedEditorImage, setSelectedEditorElement } = previewEditor;
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

  const viewModels = buildSiteBuilderViewModels({
    draftId: draftState?.id ?? null,
    draftState,
    canDeleteSite,
    deleteSiteRepoFullName,
    sessionUserId,
    canEditDraft,
    sessionDisplayName,
    sessionAvatarUrl,
    siteAccessRole,
    hasUnsavedChanges,
    savingDraft,
    activeSection,
    activeSettingsSection,
    isPageEditingMode,
    showMetadataFullView,
    metadataLockedByOther,
    metadataLockHolderName: metadataLock?.holderName ?? "Another user",
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
    pageDeleteBusy: deletePageBusy,
    handleDeletePage,
    handleEnterPageEditingMode,
    handleSaveDraft,
    handlePublish,
    handleSectionChange,
    handleSettingsSectionChange,
    handleExitPageEditingMode,
    handleActivePreviewSlugChange,
    maxFormatImageUploadBytes: MAX_IMAGE_UPLOAD_BYTES
  });

  return {
    session,
    notice,
    noticeKind,
    ...viewModels,
    isPreviewFullscreen,
    setIsPreviewFullscreen,
  };
};
