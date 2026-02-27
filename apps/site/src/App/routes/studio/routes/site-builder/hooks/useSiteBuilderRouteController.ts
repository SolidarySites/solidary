import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../../../../features/auth/hooks/useAuth";
import { requireFreshGithubAuth } from "../../../../../features/auth/services/github-auth";
import { supabase } from "../../../../../lib/supabase";
import { githubRequest } from "../../../../../services/github";
import {
  buildDraftSaveSignature,
  DEFAULT_FOOTER_MODULES,
  DEFAULT_OG_IMAGE_URL,
  MAX_IMAGE_UPLOAD_BYTES,
  normalizeFooterModules,
  normalizeSitePath,
  toExternalUrl
} from "../services/draft-utils";
import {
  type SectionLockRecord
} from "../services/locks";
import type {
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
  stripFrontmatter
} from "../services/utils";
import type { NoticeKind } from "../../../../../types/notice";
import templateSolidary from "../../../../../../templates/astro/solidary-links.json?raw";
import homeTemplate from "../../../../../../../../../templates/astro-baseline/src/content/pages/home.md?raw";
import tokensTemplate from "../../../../../../templates/astro/tokens.css?raw";
import { slugify } from "../../../../../lib/slugify";
import { useBuilderCollaborators } from "./useBuilderCollaborators";
import { useBuilderPageEditing } from "./useBuilderPageEditing";
import { useBuilderPreviewEditor } from "./useBuilderPreviewEditor";
import { useSiteBuilderAccessAndLocks } from "./useSiteBuilderAccessAndLocks";
import { useSiteBuilderDraftLifecycle } from "./useSiteBuilderDraftLifecycle";
import { useSiteBuilderSavePublishActions } from "./useSiteBuilderSavePublishActions";

const defaultHomeContent = stripFrontmatter(homeTemplate);

type UseSiteBuilderRouteControllerOptions = {
  mode?: "editor" | "settings";
};

type SiteDeleteMode = "builder" | "github";
type DomainActionMode = "github";
type DomainDnsFeedbackStatus = "valid" | "invalid" | "pending";
type DomainDnsFeedbackState = {
  domain: string;
  status: DomainDnsFeedbackStatus;
  message: string;
};
type GitHubPagesDomainResponse = {
  domain?: string;
  status?: "connected" | "checked" | "removed";
  pagesUrl?: string;
  pages?: {
    html_url?: string;
    cname?: string;
  };
  dns?: {
    status?: DomainDnsFeedbackStatus;
    message?: string;
  };
};

const normalizeCustomDomainInput = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const withoutProtocol = trimmed.replace(/^https?:\/\//i, "");
  const domainOnly = withoutProtocol.split("/")[0] ?? "";
  return domainOnly.replace(/\.+$/, "").trim().toLowerCase();
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
  const [deleteMode, setDeleteMode] = useState<SiteDeleteMode | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [domainActionBusy, setDomainActionBusy] = useState<DomainActionMode | "none">("none");
  const [domainDnsFeedback, setDomainDnsFeedback] = useState<DomainDnsFeedbackState | null>(null);

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
    showMetadataFullView,
    previewReadOnlyMessage
  } = useSiteBuilderAccessAndLocks({
    activeSection,
    activeSettingsSection,
    isPageEditingMode,
    activePreviewSlug,
    pages,
    sectionLocks,
    siteAccessRole,
    draftState,
    sessionUserId,
    shouldLoadDraft,
    isDraftLoading,
    draftLoadError
  });
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
  const canDeleteSite = Boolean(isOwnerOnOwnerDraft && draftState?.siteId);
  const deleteSiteRepoFullName = draftState?.repoFullName ?? "";
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

  useEffect(() => {
    setDeleteMode(null);
    setDeleteConfirmText("");
    setDeleteBusy(false);
    setDomainActionBusy("none");
    setDomainDnsFeedback(null);
  }, [draftState?.siteId]);

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

  const { reloadLatestDraftAfterConflict, refreshDraftAfterSectionChange } = useSiteBuilderDraftLifecycle({
    builderRoutePath,
    draftId,
    sessionResolved,
    sessionUserId,
    defaultHomeContent,
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
    setSiteImagePreview,
    setDraftImageUrl,
    setFooterDisabled,
    setFooterFixed,
    setFooterModules,
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
    if (shouldLoadDraft && isDraftLoading) return;

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
      if (mode === "settings") return;
      if (activeSection !== "content" && activeSection !== "settings") return;
      setActiveSection("menu");
      return;
    }
    if (mode === "settings") return;
    if (isOwnerOnOwnerDraft || activeSection !== "content") return;
    setActiveSection("menu");
  }, [
    activeSection,
    canEditDraft,
    draftState?.id,
    isDraftLoading,
    isOwnerOnOwnerDraft,
    mode,
    sessionUserId,
    shouldLoadDraft
  ]);

  useEffect(() => {
    const inPageEditingMode =
      activeSection === "settings" && activeSettingsSection === "pages" && isPageEditingMode;
    if (inPageEditingMode) return;
    clearSelectedEditorImage();
    if (activeSection !== "settings" || activeSettingsSection !== "pages") {
      setIsPageEditingMode(false);
    }
  }, [activeSection, activeSettingsSection, clearSelectedEditorImage, isPageEditingMode]);

  const lockHeartbeatKey = mode === "settings" ? null : activeLockKey;
  const { loadSectionLocks, acquireSectionLock, releaseSectionLock } = useDraftSectionLocks({
    draftId: draftState?.id ?? null,
    sessionUserId,
    canEditDraft,
    sessionDisplayName,
    activeLockKey: lockHeartbeatKey,
    setSectionLocks
  });

  const { saveSectionByKey, handlePublish, handleSaveDraft } = useSiteBuilderSavePublishActions({
    canEditDraft,
    canPublishByRole,
    canDirectPublish,
    hasForeignSectionLocks,
    activeEditableSection,
    activeSectionLockedByOther,
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
    tokensCss,
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

  const handleStudioOnlyDomainUpdate = (rawDomain: string) => {
    if (!isOwnerOnOwnerDraft) {
      setNotice("Only the site owner can update the domain in advanced settings.");
      setNoticeKind("error");
      return;
    }

    const normalizedDomain = normalizeCustomDomainInput(rawDomain);
    if (!normalizedDomain) {
      setNotice("Enter a valid domain like example.com.");
      setNoticeKind("error");
      return;
    }

    setSiteUrl(normalizedDomain);
    setDomainDnsFeedback(null);
    setNotice(
      "Studio domain updated only. Do this only if the site is hosted outside GitHub Pages."
    );
    setNoticeKind("notice");
  };

  const applyDomainConnectResult = ({
    requestedDomain,
    result
  }: {
    requestedDomain: string;
    result: GitHubPagesDomainResponse;
  }) => {
    const resolvedDomain = normalizeCustomDomainInput(result.domain ?? requestedDomain);
    const dnsStatus = result.dns?.status ?? "pending";
    const dnsMessage = result.dns?.message?.trim() ?? "";

    if (dnsStatus === "valid") {
      setDomainDnsFeedback(null);
      setSiteUrl(resolvedDomain);
      const pagesUrl = result.pagesUrl?.trim() || result.pages?.html_url?.trim() || "";
      setNotice(
        pagesUrl
          ? `Custom domain connected. DNS checks passed and Studio was updated to ${resolvedDomain}. Live URL: ${pagesUrl}`
          : `Custom domain connected. DNS checks passed and Studio was updated to ${resolvedDomain}.`
      );
      setNoticeKind("notice");
      return;
    }

    const fallbackMessage =
      dnsStatus === "pending"
        ? `DNS records for ${resolvedDomain} were not found.`
        : `DNS records for ${resolvedDomain} do not look correct yet.`;
    const message = dnsMessage || fallbackMessage;

    setDomainDnsFeedback({
      domain: resolvedDomain,
      status: dnsStatus,
      message
    });
    setNotice(
      `${message} DNS records don't seem to be set up correctly yet. Fix your provider records, then recheck.`
    );
    setNoticeKind("error");
  };

  const handleConnectGithubDomain = async (rawDomain: string) => {
    if (!isOwnerOnOwnerDraft) {
      setNotice("Only the site owner can connect a GitHub Pages custom domain.");
      setNoticeKind("error");
      return;
    }

    const repoFullName = draftState?.repoFullName?.trim() ?? "";
    const [owner, repo] = repoFullName.split("/");
    if (!owner || !repo) {
      setNotice("Invalid repository name. Please reload and try again.");
      setNoticeKind("error");
      return;
    }

    const normalizedDomain = normalizeCustomDomainInput(rawDomain);
    if (!normalizedDomain) {
      setNotice("Enter a valid domain like example.com.");
      setNoticeKind("error");
      return;
    }

    setDomainActionBusy("github");
    setDomainDnsFeedback(null);
    try {
      const freshAuth = await requireFreshGithubAuth();
      const result = await githubRequest<GitHubPagesDomainResponse>(
        "/.netlify/functions/github-pages-set-domain",
        {
          owner,
          repo,
          action: "connect",
          domain: normalizedDomain,
          supabase_access_token: freshAuth.supabaseAccessToken
        }
      );
      applyDomainConnectResult({
        requestedDomain: normalizedDomain,
        result
      });
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Failed to connect the GitHub Pages domain.";
      setNotice(message);
      setNoticeKind("error");
    } finally {
      setDomainActionBusy("none");
    }
  };

  const handleRecheckGithubDomain = async (rawDomain: string) => {
    if (!isOwnerOnOwnerDraft) {
      setNotice("Only the site owner can recheck a GitHub Pages custom domain.");
      setNoticeKind("error");
      return;
    }

    const repoFullName = draftState?.repoFullName?.trim() ?? "";
    const [owner, repo] = repoFullName.split("/");
    if (!owner || !repo) {
      setNotice("Invalid repository name. Please reload and try again.");
      setNoticeKind("error");
      return;
    }

    const normalizedDomain = normalizeCustomDomainInput(rawDomain);
    if (!normalizedDomain) {
      setNotice("Enter a valid domain like example.com.");
      setNoticeKind("error");
      return;
    }

    setDomainActionBusy("github");
    try {
      const freshAuth = await requireFreshGithubAuth();
      const result = await githubRequest<GitHubPagesDomainResponse>(
        "/.netlify/functions/github-pages-set-domain",
        {
          owner,
          repo,
          action: "check",
          domain: normalizedDomain,
          supabase_access_token: freshAuth.supabaseAccessToken
        }
      );
      applyDomainConnectResult({
        requestedDomain: normalizedDomain,
        result
      });
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Failed to recheck GitHub Pages DNS.";
      setNotice(message);
      setNoticeKind("error");
    } finally {
      setDomainActionBusy("none");
    }
  };

  const handleRemoveProposedGithubDomain = async (rawDomain: string) => {
    if (!isOwnerOnOwnerDraft) {
      setNotice("Only the site owner can remove a proposed GitHub Pages custom domain.");
      setNoticeKind("error");
      return;
    }

    const repoFullName = draftState?.repoFullName?.trim() ?? "";
    const [owner, repo] = repoFullName.split("/");
    if (!owner || !repo) {
      setNotice("Invalid repository name. Please reload and try again.");
      setNoticeKind("error");
      return;
    }

    const normalizedDomain = normalizeCustomDomainInput(rawDomain);
    if (!normalizedDomain) {
      setNotice("Missing proposed domain to remove.");
      setNoticeKind("error");
      return;
    }

    setDomainActionBusy("github");
    try {
      const freshAuth = await requireFreshGithubAuth();
      await githubRequest<GitHubPagesDomainResponse>(
        "/.netlify/functions/github-pages-set-domain",
        {
          owner,
          repo,
          action: "remove",
          domain: normalizedDomain,
          supabase_access_token: freshAuth.supabaseAccessToken
        }
      );
      setDomainDnsFeedback(null);
      setNotice("Removed proposed custom domain from GitHub Pages.");
      setNoticeKind("notice");
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Failed to remove proposed custom domain.";
      setNotice(message);
      setNoticeKind("error");
    } finally {
      setDomainActionBusy("none");
    }
  };

  const handleDeleteSite = async () => {
    if (!session || !canDeleteSite || !draftState?.siteId || !deleteMode) return;

    const selectedDeleteMode = deleteMode;
    const siteId = draftState.siteId;
    const repoFullName = deleteSiteRepoFullName;

    if (selectedDeleteMode === "github" && deleteConfirmText.trim() !== repoFullName) {
      setNotice("Repo name did not match. Deletion cancelled.");
      setNoticeKind("notice");
      return;
    }

    setDeleteBusy(true);

    try {
      if (selectedDeleteMode === "github") {
        let freshAuth;
        try {
          freshAuth = await requireFreshGithubAuth();
        } catch (caught) {
          const message =
            caught instanceof Error ? caught.message : "Sign in with GitHub to continue.";
          setNotice(message);
          setNoticeKind("error");
          return;
        }

        const [owner, repo] = repoFullName.split("/");
        if (!owner || !repo) {
          setNotice("Invalid repo name. Please try again.");
          setNoticeKind("error");
          return;
        }

        try {
          await fetch("/.netlify/functions/github-delete-repo", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              owner,
              repo,
              supabase_access_token: freshAuth.supabaseAccessToken
            })
          }).then(async (response) => {
            if (!response.ok) {
              const payload = await response.json().catch(() => ({}));
              throw new Error(payload?.error ?? "Failed to delete GitHub repo.");
            }
          });
        } catch (caught) {
          const message =
            caught instanceof Error ? caught.message : "Failed to delete GitHub repo.";
          setNotice(message);
          setNoticeKind("error");
          return;
        }
      }

      const { error } = await supabase.from("sites").delete().eq("id", siteId);
      if (error) {
        setNotice(error.message);
        setNoticeKind("error");
        return;
      }

      setDeleteMode(null);
      setDeleteConfirmText("");
      setNotice(
        selectedDeleteMode === "github"
          ? "Deleted site from builder and GitHub."
          : "Deleted site from builder."
      );
      setNoticeKind("notice");
      navigate("/studio");
    } finally {
      setDeleteBusy(false);
    }
  };

  return {
    session,
    notice,
    noticeKind,
    settingsRouteContext: {
      draftId: draftState?.id ?? null,
      sessionUserId,
      canEditDraft,
      sessionDisplayName,
      siteAccessRole
    },
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
      isPreviewFullscreen,
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
      canDeleteSite,
      deleteMode,
      deleteConfirmText,
      deleteBusy,
      deleteRepoFullName: deleteSiteRepoFullName,
      domainActionBusy,
      domainDnsFeedback,
      onSiteTitleChange: setSiteTitle,
      onSiteDescriptionChange: setSiteDescription,
      onSiteImageChange: setSiteImage,
      onStudioOnlyDomainUpdate: handleStudioOnlyDomainUpdate,
      onConnectGithubDomain: (value: string) => {
        void handleConnectGithubDomain(value);
      },
      onRecheckGithubDomain: (value: string) => {
        void handleRecheckGithubDomain(value);
      },
      onRemoveProposedGithubDomain: (value: string) => {
        void handleRemoveProposedGithubDomain(value);
      },
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
      onDeleteModeChange: (nextMode: SiteDeleteMode) => {
        setDeleteMode(nextMode);
        if (nextMode !== "github") {
          setDeleteConfirmText("");
        }
      },
      onDeleteConfirmTextChange: setDeleteConfirmText,
      onDeleteReset: () => {
        if (deleteBusy) return;
        setDeleteMode(null);
        setDeleteConfirmText("");
      },
      onDeleteConfirm: () => {
        void handleDeleteSite();
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
