import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../../features/auth/hooks/useAuth";
import { supabase } from "../../../lib/supabase";
import {
  FILE_KEYS
} from "../services/constants";
import {
  buildDraftSaveSignature,
  DEFAULT_FOOTER_MODULES,
  DEFAULT_OG_IMAGE_URL,
  MAX_IMAGE_UPLOAD_BYTES,
  normalizeFooterModules,
  normalizeSitePath,
  replaceDraftImageUrlsWithSitePaths,
  toExternalUrl
} from "../services/draft-utils";
import { loadDraftById, type LoadedDraftResult } from "../services/load-draft";
import {
  EDITABLE_SECTION_LABELS,
  getEditableSectionFromUi,
  getLockKeyFromUi,
  getLockLabel,
  getPageLockKeyForPage,
  getPageLockKeyForSlug,
  isBuilderEditableSectionKey,
  isPageLockKey,
  type SectionLockRecord
} from "../services/locks";
import {
  publishEditorDraft,
  publishOwnerDraft
} from "../services/publish-draft";
import {
  DraftConflictError,
  saveDraftState,
  type DraftRevisionRow
} from "../services/save-draft-state";
import { markEditorDraftTouched as markEditorDraftTouchedInternal } from "../services/save-editor-touch";
import {
  saveMetadataSection as runSaveMetadataSection,
  savePagesSection as runSavePagesSection
} from "../services/save-metadata-and-pages";
import {
  buildDraftSignatureForState as buildDraftSignatureFromState
} from "../services/save-section-signature";
import {
  saveFooterSection as runSaveFooterSection,
  saveHeaderSection as runSaveHeaderSection,
  saveStylesSection as runSaveStylesSection
} from "../services/save-settings-sections";
import type {
  BuilderEditableSectionKey,
  BuilderPage,
  BuilderSection,
  BuilderSettingsSection,
  CollaboratorRole,
  DraftImageAsset,
  DraftState,
  FooterModule,
  PublishFeedback,
  SiteAccessRole
} from "../services/types";
import { useDraftPresence } from "./useDraftPresence";
import { useBuilderSectionNavigation } from "./useBuilderSectionNavigation";
import { useDraftSectionLocks } from "./useDraftSectionLocks";
import { usePublishStatusTracking } from "./usePublishStatusTracking";
import {
  getPageSafeSlug,
  normalizePageSlug,
  stripFrontmatter
} from "../services/utils";
import type { NoticeKind } from "../../../types/notice";
import templateSolidary from "../../../../templates/astro/solidary-links.json?raw";
import homeTemplate from "../../../../../../../templates/astro-baseline/src/content/pages/home.md?raw";
import tokensTemplate from "../../../../templates/astro/tokens.css?raw";
import { slugify } from "../../../lib/slugify";
import { useBuilderCollaborators } from "./useBuilderCollaborators";
import { useBuilderPageEditing } from "./useBuilderPageEditing";
import { useBuilderPreviewEditor } from "./useBuilderPreviewEditor";

const defaultHomeContent = stripFrontmatter(homeTemplate);

export const useSiteBuilderRouteController = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const [notice, setNotice] = useState<string | null>(null);
  const [noticeKind, setNoticeKind] = useState<NoticeKind>(null);
  const { session, sessionResolved } = useAuth();
  const [activeSection, setActiveSection] = useState<BuilderSection>("menu");
  const [activeSettingsSection, setActiveSettingsSection] = useState<BuilderSettingsSection>("pages");
  const [isPageEditingMode, setIsPageEditingMode] = useState(false);
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [provisionStep, setProvisionStep] = useState("Preparing your updates...");

  const [siteTitle, setSiteTitle] = useState("New Astro Site");
  const [siteDescription, setSiteDescription] = useState("Describe your site in a sentence or two.");
  const [siteUrl, setSiteUrl] = useState("");

  const [siteImage, setSiteImage] = useState<File | null>(null);
  const [siteImagePreview, setSiteImagePreview] = useState<string | null>(null);
  const [draftImageUrl, setDraftImageUrl] = useState<string | null>(null);

  const [pages, setPages] = useState<BuilderPage[]>([]);
  const [draftImages, setDraftImages] = useState<DraftImageAsset[]>([]);
  const [draftPageSlugs, setDraftPageSlugs] = useState<string[]>([]);
  const [activePreviewSlug, setActivePreviewSlug] = useState("home");
  const [headerDisabled, setHeaderDisabled] = useState(false);
  const [headerFixed, setHeaderFixed] = useState(false);
  const [headerBrandText, setHeaderBrandText] = useState("New Astro Site");
  const [headerBrandDisabled, setHeaderBrandDisabled] = useState(false);

  const [footerDisabled, setFooterDisabled] = useState(false);
  const [footerFixed, setFooterFixed] = useState(false);
  const [footerModules, setFooterModules] = useState<FooterModule[]>(
    normalizeFooterModules(DEFAULT_FOOTER_MODULES)
  );

  const [tokensCss, setTokensCss] = useState(tokensTemplate);
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

  const pageTitleRef = useRef<HTMLInputElement | null>(null);
  const hasInitializedHeaderBrand = useRef(false);
  const cleanedPublishedDraftIdRef = useRef<string | null>(null);
  const shouldCaptureLoadedDraftSignature = useRef(false);
  const touchedPageSlugsRef = useRef<Set<string>>(new Set());
  const deletedPageSlugsRef = useRef<Set<string>>(new Set());

  const draftId = useMemo(
    () => searchParams.get("draftId") ?? (location.state as { draftId?: string } | null)?.draftId ?? null,
    [location.state, searchParams]
  );
  const computedSlug = useMemo(() => slugify(siteTitle), [siteTitle]);
  const shouldLoadDraft = Boolean(draftId);
  const sessionUserId = session?.user.id ?? null;
  const isOwner = siteAccessRole === "owner";
  const isOwnerOnOwnerDraft = isOwner && draftState?.draftType === "owner";
  const {
    collaboratorQuery,
    collaboratorRole,
    collaboratorSuggestions,
    collaboratorSearchLoading,
    invitingCollaborator,
    selectedCollaboratorSuggestion,
    managedCollaborators,
    managedCollaboratorsLoading,
    updatingCollaboratorUserId,
    setCollaboratorRole,
    handleCollaboratorQueryChange,
    handleCollaboratorSuggestionSelect,
    handleInviteCollaborator,
    handleCollaboratorRoleUpdate,
    handleCollaboratorRemove,
    resetCollaborators
  } = useBuilderCollaborators({
    draftId: draftState?.id ?? null,
    isOwnerOnOwnerDraft,
    session,
    setNotice,
    setNoticeKind
  });
  const isEditorWorkingDraft =
    draftState?.draftType === "editor" && siteAccessRole === "editor" && draftState.ownerUserId === sessionUserId;
  const isOwnerOrAdminOnOwnerDraft =
    draftState?.draftType === "owner" &&
    (siteAccessRole === "owner" || siteAccessRole === "admin");
  const canEditDraft = Boolean(isOwnerOrAdminOnOwnerDraft || isEditorWorkingDraft);
  const canDirectPublish = Boolean(isOwnerOrAdminOnOwnerDraft);
  const canSubmitPullRequest = Boolean(isEditorWorkingDraft);
  const canPublishByRole = canDirectPublish || canSubmitPullRequest;
  const activeEditableSection = useMemo(
    () => getEditableSectionFromUi(activeSection, activeSettingsSection, isPageEditingMode),
    [activeSection, activeSettingsSection, isPageEditingMode]
  );
  const activeLockKey = useMemo(
    () =>
      getLockKeyFromUi(
        activeSection,
        activeSettingsSection,
        activePreviewSlug,
        pages,
        isPageEditingMode
      ),
    [activePreviewSlug, activeSection, activeSettingsSection, isPageEditingMode, pages]
  );
  const activeSectionLock = activeLockKey ? sectionLocks[activeLockKey] : null;
  const activeSectionLockedByOther = Boolean(
    activeSectionLock && activeSectionLock.userId !== sessionUserId
  );
  const sidebarSectionLocks = useMemo(
    () =>
      Object.entries(sectionLocks).reduce(
        (accumulator, [sectionKey, lock]) => {
          if (!lock || !isBuilderEditableSectionKey(sectionKey)) return accumulator;
          accumulator[sectionKey] = {
            holderName: lock.holderName,
            isSelf: lock.userId === sessionUserId
          };
          return accumulator;
        },
        {} as Partial<
          Record<
            BuilderEditableSectionKey,
            {
              holderName: string;
              isSelf: boolean;
            }
          >
        >
      ),
    [sectionLocks, sessionUserId]
  );
  const pageLocksBySlug = useMemo(
    () => {
      const pageSlugByLockKey = new Map<string, string>();
      pages.forEach((page, index) => {
        pageSlugByLockKey.set(getPageLockKeyForPage(page, index), getPageSafeSlug(page, index));
      });

      return Object.entries(sectionLocks).reduce(
        (accumulator, [lockKey, lock]) => {
          if (!lock || !isPageLockKey(lockKey)) return accumulator;
          const fallbackSlug = lockKey.slice("page:".length);
          const slug = pageSlugByLockKey.get(lockKey) ?? normalizePageSlug(fallbackSlug);
          if (!slug) return accumulator;
          accumulator[slug] = {
            holderName: lock.holderName,
            isSelf: lock.userId === sessionUserId
          };
          return accumulator;
        },
        {} as Record<
          string,
          {
            holderName: string;
            isSelf: boolean;
          }
        >
      );
    },
    [pages, sectionLocks, sessionUserId]
  );
  const activePageLockKey = useMemo(
    () => getPageLockKeyForSlug(pages, activePreviewSlug),
    [activePreviewSlug, pages]
  );
  const activePageLock = sectionLocks[activePageLockKey] ?? sectionLocks.pages;
  const activePageLockedByOther = Boolean(activePageLock && activePageLock.userId !== sessionUserId);
  const hasForeignSectionLocks = useMemo(
    () => Object.values(sectionLocks).some((lock) => Boolean(lock && lock.userId !== sessionUserId)),
    [sectionLocks, sessionUserId]
  );
  const canEditPageContent =
    canEditDraft &&
    activeSection === "settings" &&
    activeSettingsSection === "pages" &&
    isPageEditingMode &&
    !activePageLockedByOther;
  const metadataLock = sectionLocks.metadata ?? null;
  const metadataLockedByOther = Boolean(metadataLock && metadataLock.userId !== sessionUserId);
  const showMetadataFullView = activeSection === "content" && Boolean(isOwnerOnOwnerDraft);
  const previewReadOnlyMessage = useMemo(() => {
    if (shouldLoadDraft && isDraftLoading) return null;
    if (draftLoadError) return null;
    if (!canEditDraft) return "This draft is read-only for your current role.";
    if (activeSection !== "settings" || activeSettingsSection !== "pages") {
      return "Open Pages to edit content in the live preview.";
    }
    if (!isPageEditingMode) {
      return "Select a page in the sidebar to start editing content.";
    }
    if (activePageLockedByOther) {
      return `${
        activePageLock?.holderName ?? "Another collaborator"
      } is editing page "${normalizePageSlug(activePreviewSlug) || "home"}" right now.`;
    }
    return null;
  }, [
    activePageLock?.holderName,
    activePageLockedByOther,
    activePreviewSlug,
    activeSection,
    activeSettingsSection,
    isPageEditingMode,
    canEditDraft,
    draftLoadError,
    isDraftLoading,
    shouldLoadDraft
  ]);
  const {
    previewRef,
    selectedEditorImage,
    setSelectedEditorImage,
    clearSelectedEditorImage,
    uploadingInlineImage,
    runPreviewCommand,
    runPreviewLink,
    capturePreviewSelection,
    handleSelectedEditorImageAltChange,
    handleSelectedEditorImageCaptionChange,
    handleSelectedEditorImageSizeChange,
    handleInlineImageUpload
  } = useBuilderPreviewEditor({
    canEditPageContent,
    session,
    draftState,
    setNotice,
    setNoticeKind,
    setDraftImages
  });
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
  const { activePresenceMembers } = useDraftPresence({
    draftId: draftState?.id ?? null,
    sessionUserId,
    sessionDisplayName,
    siteAccessRole,
    activePreviewSlug
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
  const liveSiteUrl = toExternalUrl(publishedSiteBaseUrl ?? siteUrl);
  const githubRepoFullName = draftState?.repoFullName?.trim() ?? "";
  const githubRepoUrl = githubRepoFullName ? `https://github.com/${githubRepoFullName}` : null;
  const siteSettingsInput = useMemo(
    () => ({
      siteTitle,
      siteDescription,
      siteUrl,
      header: {
        disabled: headerDisabled,
        fixed: headerFixed,
        brandText: headerBrandText,
        disableBrand: headerBrandDisabled
      },
      footer: {
        disabled: footerDisabled,
        fixed: footerFixed,
        modules: normalizeFooterModules(footerModules)
      }
    }),
    [
      siteTitle,
      siteDescription,
      siteUrl,
      headerDisabled,
      headerFixed,
      headerBrandText,
      headerBrandDisabled,
      footerDisabled,
      footerFixed,
      footerModules
    ]
  );
  const draftSaveImageUrl = useMemo(() => {
    if (siteImage) return draftImageUrl || DEFAULT_OG_IMAGE_URL;
    return siteImagePreview || draftImageUrl || DEFAULT_OG_IMAGE_URL;
  }, [siteImage, siteImagePreview, draftImageUrl]);
  const currentDraftSignature = useMemo(() => {
    if (!draftState) return "";
    return buildDraftSaveSignature({
      draftId: draftState.id,
      settingsInput: siteSettingsInput,
      imageUrl: draftSaveImageUrl,
      tokensCss,
      pagesSnapshot: pages,
      draftImages
    });
  }, [draftImages, draftSaveImageUrl, draftState, pages, siteSettingsInput, tokensCss]);
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

  useEffect(() => {
    if (publishFeedback?.kind !== "success") return;
    if (!draftState?.id) return;
    if (draftState.draftType !== "owner") return;
    if (cleanedPublishedDraftIdRef.current === draftState.id) return;

    (async () => {
      const normalizedPublishedBaseUrl = (publishedSiteBaseUrl ?? "").trim().replace(/\/+$/, "");
      if (!normalizedPublishedBaseUrl) {
        setNotice("Site is live, but image cleanup skipped: missing published site URL.");
        setNoticeKind("error");
        return;
      }

      const accessToken = session?.access_token?.trim() ?? "";
      const response = await fetch("/.netlify/functions/cleanup-draft-images", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
        },
        body: JSON.stringify({
          draftId: draftState.id,
          publishedSiteBaseUrl: normalizedPublishedBaseUrl
        })
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errorMessage =
          typeof payload?.error === "string" && payload.error.trim()
            ? payload.error
            : "Cleanup request failed.";
        setNotice(`Site is live, but image cleanup failed: ${errorMessage}`);
        setNoticeKind("error");
        return;
      }

      cleanedPublishedDraftIdRef.current = draftState.id;

      const updatedRows = Array.isArray(payload?.updated) ? payload.updated : [];
      if (!updatedRows.length) return;

      const byId = new Map<string, { publicUrl: string; sitePath: string }>();
      updatedRows.forEach((row: unknown) => {
        if (!row || typeof row !== "object") return;
        const record = row as Record<string, unknown>;
        const id = typeof record.id === "string" ? record.id : "";
        const publicUrl = typeof record.publicUrl === "string" ? record.publicUrl.trim() : "";
        const sitePath =
          typeof record.sitePath === "string" ? normalizeSitePath(record.sitePath) : "";
        if (!id || !publicUrl || !sitePath) return;
        byId.set(id, { publicUrl, sitePath });
      });

      if (!byId.size) return;

      setDraftImages((current) =>
        current.map((image) => {
          const imageId = typeof image.id === "string" ? image.id : "";
          const updated = imageId ? byId.get(imageId) : null;
          if (!updated) return image;
          return {
            ...image,
            publicUrl: updated.publicUrl,
            sitePath: updated.sitePath
          };
        })
      );
    })();
  }, [draftState?.draftType, draftState?.id, publishFeedback?.kind, publishedSiteBaseUrl, session?.access_token]);

  useEffect(() => {
    if (!siteImage) {
      setSiteImagePreview(null);
      return;
    }

    const url = URL.createObjectURL(siteImage);
    setSiteImagePreview(url);

    return () => URL.revokeObjectURL(url);
  }, [siteImage]);

  const applyLoadedDraft = useCallback((
    loaded: LoadedDraftResult,
    options: {
      preserveActivePreviewSlug?: boolean;
      preservedPreviewSlug?: string;
    } = {}
  ) => {
    const { preserveActivePreviewSlug = false, preservedPreviewSlug } = options;
    const loadedDraftImages = loaded.draftImages ?? [];
    const loadedPages = loaded.pages.map((page) => ({
      ...page,
      body: replaceDraftImageUrlsWithSitePaths(page.body ?? "", loadedDraftImages)
    }));
    touchedPageSlugsRef.current.clear();
    deletedPageSlugsRef.current.clear();
    setDraftState(loaded.draftState);
    setSiteAccessRole(loaded.accessRole);
    setDraftImages(loadedDraftImages);
    setPages(loadedPages);
    setDraftPageSlugs(loaded.draftPageSlugs);
    if (preserveActivePreviewSlug) {
      const normalizedActiveSlug = normalizePageSlug(preservedPreviewSlug ?? "") || "home";
      const hasActiveSlug = loadedPages.some(
        (page, index) => getPageSafeSlug(page, index) === normalizedActiveSlug
      );
      if (!hasActiveSlug && loaded.initialActivePreviewSlug) {
        setActivePreviewSlug(loaded.initialActivePreviewSlug);
      }
    } else if (loaded.initialActivePreviewSlug) {
      setActivePreviewSlug(loaded.initialActivePreviewSlug);
    }

    if (loaded.siteTitle) {
      setSiteTitle(loaded.siteTitle);
    }
    if (loaded.header) {
      setHeaderDisabled(loaded.header.disabled);
      setHeaderFixed(loaded.header.fixed);
      setHeaderBrandDisabled(loaded.header.disableBrand);
      setHeaderBrandText(loaded.header.brandText?.trim() || loaded.siteTitle?.trim() || "New Astro Site");
      hasInitializedHeaderBrand.current = true;
    } else if (!hasInitializedHeaderBrand.current) {
      setHeaderBrandText(loaded.siteTitle?.trim() || "New Astro Site");
      hasInitializedHeaderBrand.current = true;
    }

    if (typeof loaded.siteDescription === "string") setSiteDescription(loaded.siteDescription);
    if (typeof loaded.siteUrl === "string") setSiteUrl(loaded.siteUrl);
    if (typeof loaded.tokensCss === "string") setTokensCss(loaded.tokensCss);
    if (typeof loaded.siteImagePreview === "string") setSiteImagePreview(loaded.siteImagePreview);
    if (typeof loaded.draftImageUrl === "string") setDraftImageUrl(loaded.draftImageUrl);
    if (loaded.footer) {
      setFooterDisabled(loaded.footer.disabled);
      setFooterFixed(loaded.footer.fixed);
      setFooterModules(normalizeFooterModules(loaded.footer.modules));
    } else {
      setFooterModules([...DEFAULT_FOOTER_MODULES]);
    }
    shouldCaptureLoadedDraftSignature.current = true;
  }, []);

  useEffect(() => {
    if (!draftId) {
      setIsDraftLoading(false);
      setDraftLoadError(null);
      setDraftImages([]);
      setSiteAccessRole(null);
      setIsPageEditingMode(false);
      setLastSavedDraftSignature("");
      setSectionLocks({});
      resetCollaborators();
      cleanedPublishedDraftIdRef.current = null;
      shouldCaptureLoadedDraftSignature.current = false;
      touchedPageSlugsRef.current.clear();
      deletedPageSlugsRef.current.clear();
      return;
    }

    if (!sessionResolved) {
      setIsDraftLoading(true);
      setDraftLoadError(null);
      return;
    }

    if (!sessionUserId) {
      setIsDraftLoading(false);
      setDraftLoadError("Sign in to load this draft.");
      return;
    }

    let mounted = true;
    shouldCaptureLoadedDraftSignature.current = false;
    setIsDraftLoading(true);
    setDraftLoadError(null);
    (async () => {
      try {
        const loaded = await loadDraftById({
          draftId,
          defaultHomeContent,
          userId: sessionUserId
        });

        if (!mounted) return;
        applyLoadedDraft(loaded);
        if (loaded.resolvedDraftId && loaded.resolvedDraftId !== draftId) {
          navigate(`/site-builder?draftId=${loaded.resolvedDraftId}`, { replace: true });
        }
      } catch (caught) {
        if (!mounted) return;
        const message = caught instanceof Error ? caught.message : "Failed to load draft.";
        setSiteAccessRole(null);
        setSectionLocks({});
        setDraftLoadError(message);
      } finally {
        if (mounted) {
          setIsDraftLoading(false);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [applyLoadedDraft, draftId, navigate, resetCollaborators, sessionResolved, sessionUserId]);

  const reloadLatestDraftAfterConflict = useCallback(async () => {
    if (!draftId || !sessionUserId) return;
    setIsDraftLoading(true);
    setDraftLoadError(null);
    shouldCaptureLoadedDraftSignature.current = false;
    try {
      const loaded = await loadDraftById({
        draftId,
        defaultHomeContent,
        userId: sessionUserId
      });
      applyLoadedDraft(loaded);
      if (loaded.resolvedDraftId && loaded.resolvedDraftId !== draftId) {
        navigate(`/site-builder?draftId=${loaded.resolvedDraftId}`, { replace: true });
      }
      setNotice("Draft changed by another collaborator. Loaded the latest version.");
      setNoticeKind("error");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Failed to reload draft.";
      setDraftLoadError(message);
      setNotice(message);
      setNoticeKind("error");
    } finally {
      setIsDraftLoading(false);
    }
  }, [applyLoadedDraft, draftId, navigate, sessionUserId]);

  const refreshDraftAfterSectionChange = useCallback(async (
    options: {
      preservedPreviewSlug?: string;
    } = {}
  ) => {
    if (!draftState?.id || !sessionUserId) return;
    setIsDraftLoading(true);
    setDraftLoadError(null);
    shouldCaptureLoadedDraftSignature.current = false;
    const preservedPreviewSlug =
      normalizePageSlug(options.preservedPreviewSlug ?? activePreviewSlug) || "home";
    try {
      const loaded = await loadDraftById({
        draftId: draftState.id,
        defaultHomeContent,
        userId: sessionUserId
      });
      applyLoadedDraft(loaded, {
        preserveActivePreviewSlug: true,
        preservedPreviewSlug
      });
      if (loaded.resolvedDraftId && loaded.resolvedDraftId !== draftState.id) {
        navigate(`/site-builder?draftId=${loaded.resolvedDraftId}`, { replace: true });
      }
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Failed to refresh draft state.";
      setNotice(message);
      setNoticeKind("error");
    } finally {
      setIsDraftLoading(false);
    }
  }, [activePreviewSlug, applyLoadedDraft, draftState?.id, navigate, sessionUserId]);

  useEffect(() => {
    if (!shouldCaptureLoadedDraftSignature.current) return;
    if (isDraftLoading || !draftState) return;
    setLastSavedDraftSignature(currentDraftSignature);
    shouldCaptureLoadedDraftSignature.current = false;
  }, [currentDraftSignature, draftState, isDraftLoading]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [hasUnsavedChanges]);

  useEffect(() => {
    if (!canEditDraft) {
      if (draftState?.id && sessionUserId) {
        void (async () => {
          try {
            await supabase.rpc("site_draft_release_all_section_locks", {
              p_draft_id: draftState.id
            });
          } catch {
            // Ignore lock-release failures when losing edit access.
          }
        })();
      }
      if (activeSection !== "content" && activeSection !== "settings") return;
      setActiveSection("menu");
      return;
    }
    if (isOwnerOnOwnerDraft || activeSection !== "content") return;
    setActiveSection("menu");
  }, [activeSection, canEditDraft, draftState?.id, isOwnerOnOwnerDraft, sessionUserId]);

  useEffect(() => {
    const inPageEditingMode =
      activeSection === "settings" && activeSettingsSection === "pages" && isPageEditingMode;
    if (inPageEditingMode) return;
    clearSelectedEditorImage();
    if (activeSection !== "settings" || activeSettingsSection !== "pages") {
      setIsPageEditingMode(false);
    }
  }, [activeSection, activeSettingsSection, clearSelectedEditorImage, isPageEditingMode]);

  const resetNotices = () => {
    setNotice(null);
    setNoticeKind(null);
  };

  const updateDraftSolidaryFile = (solidaryFile: string) => {
    setDraftState((current) =>
      current
        ? {
            ...current,
            files: {
              [FILE_KEYS.solidary]: solidaryFile
            }
          }
        : current
    );
  };

  const applyDraftRevisionRow = (draftRow: DraftRevisionRow | null | undefined) => {
    if (!draftRow) return;
    setDraftState((current) =>
      current
        ? {
            ...current,
            revision: typeof draftRow.revision === "number" ? draftRow.revision : current.revision,
            lastEditedAt:
              typeof draftRow.last_edited_at === "string"
                ? draftRow.last_edited_at
                : (current.lastEditedAt ?? null),
            lastEditedByUserId:
              typeof draftRow.last_edited_by_user_id === "string"
                ? draftRow.last_edited_by_user_id
                : (current.lastEditedByUserId ?? null)
          }
        : current
    );
  };

  const saveCurrentDraftState = async (
    repoInfo: DraftState,
    solidaryFile: string,
    imageUrl: string,
    pagesSnapshot: BuilderPage[] = pages
  ) =>
    saveDraftState({
      canEditDraft,
      sessionUserId: session?.user.id ?? null,
      repoInfo,
      solidaryFile,
      imageUrl,
      pagesSnapshot,
      siteSettingsInput,
      tokensCss,
      draftImages,
      draftPageSlugs,
      applyDraftRevisionRow,
      setDraftPageSlugs
    });

  const buildDraftSignatureForState = ({
    pagesSnapshot = pages,
    imageUrl = draftSaveImageUrl
  }: {
    pagesSnapshot?: BuilderPage[];
    imageUrl?: string;
  } = {}) =>
    buildDraftSignatureFromState({
      draftState,
      siteSettingsInput,
      tokensCss,
      draftImages,
      pagesSnapshot,
      imageUrl
    });

  const markEditorDraftTouched = async (
    section: BuilderEditableSectionKey,
    touchedPageSlugs: string[] = [],
    deletedPageSlugs: string[] = []
  ) =>
    markEditorDraftTouchedInternal({
      draftState,
      section,
      setDraftState,
      touchedPageSlugs,
      deletedPageSlugs
    });

  const saveMetadataSection = async () =>
    runSaveMetadataSection({
      draftState,
      siteImage,
      draftImageUrl,
      siteImagePreview,
      templateSolidary,
      siteSettingsInput,
      siteUrl,
      sessionUserId: session?.user.id ?? null,
      applyDraftRevisionRow,
      updateDraftSolidaryFile,
      markEditorDraftTouched: (section) => markEditorDraftTouched(section),
      buildDraftSignatureForState: ({ imageUrl }) =>
        buildDraftSignatureForState({ imageUrl })
    });

  const savePagesSection = async () =>
    runSavePagesSection({
      draftState,
      pages,
      draftImages,
      draftPageSlugs,
      touchedPageSlugsRef,
      deletedPageSlugsRef,
      setPages,
      setDraftPageSlugs,
      markEditorDraftTouched: (section, touchedPageSlugs, deletedPageSlugs) =>
        markEditorDraftTouched(section, touchedPageSlugs, deletedPageSlugs),
      buildDraftSignatureForState: ({ pagesSnapshot }) =>
        buildDraftSignatureForState({ pagesSnapshot })
    });

  const saveHeaderSection = async () =>
    runSaveHeaderSection({
      draftState,
      siteSettingsInput,
      markEditorDraftTouched: (section) => markEditorDraftTouched(section),
      buildDraftSignatureForState: () => buildDraftSignatureForState()
    });

  const saveFooterSection = async () =>
    runSaveFooterSection({
      draftState,
      siteSettingsInput,
      markEditorDraftTouched: (section) => markEditorDraftTouched(section),
      buildDraftSignatureForState: () => buildDraftSignatureForState()
    });

  const saveStylesSection = async () =>
    runSaveStylesSection({
      draftState,
      tokensCss,
      markEditorDraftTouched: (section) => markEditorDraftTouched(section),
      buildDraftSignatureForState: () => buildDraftSignatureForState()
    });

  const saveSectionByKey = async (sectionKey: BuilderEditableSectionKey) => {
    if (!canEditDraft) return;
    if (!draftState) return;
    const lockKey = sectionKey === "pages" ? getPageLockKeyForSlug(pages, activePreviewSlug) : sectionKey;
    const lock = sectionLocks[lockKey] ?? (sectionKey === "pages" ? sectionLocks.pages : null);
    if (lock && lock.userId !== sessionUserId) {
      if (sectionKey === "pages") {
        throw new Error(
          `${lock.holderName} is editing page "${normalizePageSlug(activePreviewSlug) || "home"}".`
        );
      }
      throw new Error(`${lock.holderName} is editing ${getLockLabel(lockKey)}.`);
    }

    if (sectionKey === "metadata") {
      return saveMetadataSection();
    } else if (sectionKey === "pages") {
      return savePagesSection();
    } else if (sectionKey === "header") {
      return saveHeaderSection();
    } else if (sectionKey === "footer") {
      return saveFooterSection();
    } else if (sectionKey === "styles") {
      return saveStylesSection();
    }

    return "";
  };

  const { loadSectionLocks, acquireSectionLock, releaseSectionLock } = useDraftSectionLocks({
    draftId: draftState?.id ?? null,
    sessionUserId,
    canEditDraft,
    sessionDisplayName,
    activeLockKey,
    setSectionLocks
  });

  const handlePublish = async () => {
    resetNotices();
    setPublishFeedback(null);
    cancelPublishStatusTracking();
    cleanedPublishedDraftIdRef.current = null;

    if (!canPublishByRole) {
      setNotice("You do not have publish access for this draft.");
      setNoticeKind("error");
      return;
    }

    if (canDirectPublish && hasForeignSectionLocks) {
      setNotice("Wait for collaborators to finish their current section edits before publishing.");
      setNoticeKind("error");
      return;
    }

    if (!session) {
      setNotice("Sign in with GitHub to continue.");
      setNoticeKind("error");
      return;
    }

    const providerToken = (session as { provider_token?: string }).provider_token;
    if (!providerToken) {
      setNotice("GitHub token missing. Please sign in again.");
      setNoticeKind("error");
      return;
    }

    if (!siteTitle.trim() || !siteDescription.trim()) {
      setNotice("Title and description are required.");
      setNoticeKind("error");
      return;
    }

    setIsProvisioning(true);
    const publishStartedAt = new Date().toISOString();

    try {
      if (!draftState) {
        throw new Error("Missing site draft. Create a site first.");
      }

      if (hasUnsavedChanges && activeEditableSection && !activeSectionLockedByOther) {
        const savedSignature = await saveSectionByKey(activeEditableSection);
        if (typeof savedSignature === "string" && savedSignature) {
          setLastSavedDraftSignature(savedSignature);
        }
      }

      if (canDirectPublish) {
        await publishOwnerDraft({
          providerToken,
          publishStartedAt,
          draftState,
          siteTitle,
          siteDescription,
          siteUrl,
          siteImage,
          siteImagePreview,
          draftImageUrl,
          computedSlug,
          pages,
          draftImages,
          siteSettingsInput,
          tokensCss,
          templateSolidary,
          defaultHomeContent,
          setProvisionStep,
          saveDraftState: saveCurrentDraftState,
          updateDraftSolidaryFile,
          setPages,
          setDraftImages,
          setLastSavedDraftSignature,
          setDraftImageUrl,
          startPublishStatusTracking
        });
        setNotice(null);
        setNoticeKind(null);
      } else {
        await publishEditorDraft({
          providerToken,
          draftState,
          siteUrl,
          siteImage,
          siteImagePreview,
          draftImageUrl,
          computedSlug,
          pages,
          draftImages,
          siteSettingsInput,
          tokensCss,
          templateSolidary,
          defaultHomeContent,
          setProvisionStep,
          sessionAccessToken: session.access_token ?? null,
          sessionDisplayName,
          setDraftImageUrl,
          setDraftState,
          clearTouchedPageTracking: () => {
            touchedPageSlugsRef.current.clear();
            deletedPageSlugsRef.current.clear();
          },
          setLastSavedDraftSignature,
          setPublishFeedback,
          setNotice,
          setNoticeKind,
          buildDraftSignatureForState
        });
      }
    } catch (caught) {
      if (caught instanceof DraftConflictError) {
        await reloadLatestDraftAfterConflict();
      } else {
        const message = caught instanceof Error ? caught.message : "Something went wrong.";
        setNotice(message);
        setNoticeKind("error");
      }
    } finally {
      setIsProvisioning(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!draftState || savingDraft) return;
    if (!canEditDraft) {
      setNotice("Your role is read-only for this site.");
      setNoticeKind("error");
      return;
    }
    const sectionKey = activeEditableSection;
    if (!sectionKey) {
      setNotice("Open a section to save your latest changes.");
      setNoticeKind("error");
      return;
    }
    setSavingDraft(true);
    try {
      const savedSignature = await saveSectionByKey(sectionKey);
      if (typeof savedSignature === "string" && savedSignature) {
        setLastSavedDraftSignature(savedSignature);
      } else {
        setLastSavedDraftSignature(currentDraftSignature);
      }
      setNotice(`${EDITABLE_SECTION_LABELS[sectionKey]} saved.`);
      setNoticeKind("notice");
    } catch (error) {
      if (error instanceof DraftConflictError) {
        await reloadLatestDraftAfterConflict();
      } else {
        const message = error instanceof Error ? error.message : "Failed to save draft.";
        setNotice(message);
        setNoticeKind("error");
      }
    } finally {
      setSavingDraft(false);
    }
  };

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
  const {
    addPage,
    updatePageBody,
    handlePageTitleChange,
    handlePageSlugChange,
    headerNavItems,
    moveHeaderNavItem,
    updateFooterModuleContent,
    updateFooterModuleAlignment,
    moveFooterModule
  } = useBuilderPageEditing({
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

  const canFormatText = !(shouldLoadDraft && isDraftLoading) && !draftLoadError && canEditPageContent;
  const canSaveDraft =
    Boolean(draftState) &&
    canEditDraft &&
    !savingDraft &&
    hasUnsavedChanges &&
    Boolean(activeEditableSection) &&
    !activeSectionLockedByOther;
  const hasEditorPublishableChanges =
    draftState?.draftType === "editor" &&
    (
      hasUnsavedChanges ||
      (draftState.touchedSections?.length ?? 0) > 0 ||
      (draftState.touchedPageSlugs?.length ?? 0) > 0 ||
      (draftState.deletedPageSlugs?.length ?? 0) > 0
    );
  const canPublish =
    !isProvisioning &&
    Boolean(draftState) &&
    canPublishByRole &&
    publishFeedback?.kind !== "progress" &&
    (!canDirectPublish || !hasForeignSectionLocks) &&
    (canDirectPublish || hasEditorPublishableChanges);

  const handleSidebarBack = async () => {
    if (activeSection === "settings" && activeSettingsSection === "pages" && isPageEditingMode) {
      await handleExitPageEditingMode();
      return;
    }
    if (activeSection !== "menu") {
      await handleSectionChange("menu");
      return;
    }
    navigate("/studio");
  };

  return {
    session,
    notice,
    noticeKind,
    showMetadataFullView,
    metadataLockedByOther,
    metadataLockHolderName: metadataLock?.holderName ?? "Another user",
    isPreviewFullscreen,
    setIsPreviewFullscreen,
    bodyClassName: `builder-body ${isPreviewFullscreen ? "is-preview-fullscreen" : ""} ${
      showMetadataFullView ? "is-settings-full" : ""
    }`.trim(),
    topbarProps: {
      savingDraft,
      isProvisioning,
      provisionStep,
      canSaveDraft,
      canPublish,
      publishLabel: canDirectPublish ? "Publish" : "Create PR",
      liveSiteUrl,
      githubRepoUrl,
      accessRole: siteAccessRole,
      activeCollaborators: collaboratorPresenceNames,
      canOpenMetadataSettings: Boolean(isOwnerOnOwnerDraft),
      metadataSettingsActive: showMetadataFullView,
      isPreviewFullscreen,
      onOpenMetadataSettings: () => {
        if (showMetadataFullView) {
          if (canEditDraft) {
            void handleSettingsSectionChange("pages");
          } else {
            void handleSectionChange("menu");
          }
          return;
        }
        void handleSectionChange("content");
      },
      onTogglePreviewFullscreen: () => setIsPreviewFullscreen((value) => !value),
      publishFeedback,
      onSaveDraft: handleSaveDraft,
      onPublish: handlePublish
    },
    contentSectionProps: {
      siteTitle,
      siteDescription,
      siteUrl,
      siteImagePreview,
      collaboratorQuery,
      collaboratorRole,
      collaboratorSuggestions,
      selectedCollaboratorSuggestion,
      collaboratorSearchLoading,
      invitingCollaborator,
      collaborators: managedCollaborators,
      collaboratorsLoading: managedCollaboratorsLoading,
      updatingCollaboratorUserId,
      onSiteTitleChange: setSiteTitle,
      onSiteDescriptionChange: setSiteDescription,
      onSiteUrlChange: setSiteUrl,
      onSiteImageChange: setSiteImage,
      onCollaboratorQueryChange: handleCollaboratorQueryChange,
      onCollaboratorRoleChange: setCollaboratorRole,
      onCollaboratorSuggestionSelect: handleCollaboratorSuggestionSelect,
      onInviteCollaborator: () => {
        void handleInviteCollaborator();
      },
      onCollaboratorRoleUpdate: (collaboratorUserId: string, role: CollaboratorRole) => {
        void handleCollaboratorRoleUpdate(collaboratorUserId, role);
      },
      onCollaboratorRemove: (collaboratorUserId: string) => {
        void handleCollaboratorRemove(collaboratorUserId);
      }
    },
    sidebarProps: {
      activeSection,
      activeSettingsSection,
      isPageEditingMode,
      canEditDraft,
      canEditMetadata: Boolean(isOwnerOnOwnerDraft),
      siteTitle,
      siteDescription,
      siteImagePreview,
      collaboratorQuery,
      collaboratorRole,
      collaboratorSuggestions,
      selectedCollaboratorSuggestion,
      collaboratorSearchLoading,
      invitingCollaborator,
      collaborators: managedCollaborators,
      collaboratorsLoading: managedCollaboratorsLoading,
      updatingCollaboratorUserId,
      pages,
      activePreviewSlug,
      pageTitleRef,
      tokensCss,
      siteUrl,
      headerDisabled,
      headerFixed,
      headerBrandText,
      headerBrandDisabled,
      headerNavItems,
      footerDisabled,
      footerFixed,
      footerModules,
      pageLocksBySlug,
      sectionLocks: sidebarSectionLocks,
      onBack: () => {
        void handleSidebarBack();
      },
      onSettingsSectionChange: (section: BuilderSettingsSection) => {
        void handleSettingsSectionChange(section);
      },
      onSiteTitleChange: setSiteTitle,
      onSiteDescriptionChange: setSiteDescription,
      onSiteImageChange: setSiteImage,
      onCollaboratorQueryChange: handleCollaboratorQueryChange,
      onCollaboratorRoleChange: setCollaboratorRole,
      onCollaboratorSuggestionSelect: handleCollaboratorSuggestionSelect,
      onInviteCollaborator: () => {
        void handleInviteCollaborator();
      },
      onCollaboratorRoleUpdate: (collaboratorUserId: string, role: CollaboratorRole) => {
        void handleCollaboratorRoleUpdate(collaboratorUserId, role);
      },
      onCollaboratorRemove: (collaboratorUserId: string) => {
        void handleCollaboratorRemove(collaboratorUserId);
      },
      onAddPage: addPage,
      onEnterPageEditingMode: (slug: string) => {
        void handleEnterPageEditingMode(slug);
      },
      onPageTitleChange: handlePageTitleChange,
      onPageSlugChange: handlePageSlugChange,
      onTokensCssChange: setTokensCss,
      onSiteUrlChange: setSiteUrl,
      onHeaderDisabledChange: setHeaderDisabled,
      onHeaderFixedChange: setHeaderFixed,
      onHeaderBrandTextChange: setHeaderBrandText,
      onHeaderBrandDisabledChange: setHeaderBrandDisabled,
      onMoveHeaderNavItemUp: (slug: string) => moveHeaderNavItem(slug, -1),
      onMoveHeaderNavItemDown: (slug: string) => moveHeaderNavItem(slug, 1),
      onFooterDisabledChange: setFooterDisabled,
      onFooterFixedChange: setFooterFixed,
      onFooterModuleContentChange: updateFooterModuleContent,
      onFooterModuleAlignmentChange: updateFooterModuleAlignment,
      onMoveFooterModuleUp: (index: number) => moveFooterModule(index, -1),
      onMoveFooterModuleDown: (index: number) => moveFooterModule(index, 1),
      selectedEditorImage,
      onSelectedEditorImageAltChange: handleSelectedEditorImageAltChange,
      onSelectedEditorImageCaptionChange: handleSelectedEditorImageCaptionChange,
      onSelectedEditorImageSizeChange: handleSelectedEditorImageSizeChange
    },
    previewPanelProps: {
      shouldLoadDraft,
      isDraftLoading,
      draftLoadError,
      canEditContent: canEditPageContent,
      showFormattingToolbar: canFormatText,
      readOnlyMessage: previewReadOnlyMessage,
      previewRef,
      previewBrand: siteTitle,
      pages,
      draftImages,
      tokensCss,
      homeFallbackBody: defaultHomeContent,
      activePreviewSlug,
      publishedSiteBaseUrl,
      header: {
        disabled: headerDisabled,
        fixed: headerFixed,
        brandText: headerBrandText,
        disableBrand: headerBrandDisabled
      },
      footer: {
        disabled: footerDisabled,
        fixed: footerFixed,
        modules: footerModules
      },
      onActivePreviewSlugChange: (slug: string) => {
        void handleActivePreviewSlugChange(slug);
      },
      onPageBodyChange: updatePageBody,
      onSelectedImageChange: setSelectedEditorImage,
      onRunFormatCommand: runPreviewCommand,
      onRunFormatLink: runPreviewLink,
      onUploadFormatImage: handleInlineImageUpload,
      onCaptureFormatSelection: capturePreviewSelection,
      isFormatImageUploading: uploadingInlineImage,
      maxFormatImageUploadBytes: MAX_IMAGE_UPLOAD_BYTES
    }
  };
};
