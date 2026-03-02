import { useCallback, useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { NavigateFunction } from "react-router-dom";
import {
  DEFAULT_FOOTER_MODULES,
  normalizeFooterModules,
  replaceDraftImageUrlsWithSitePaths
} from "../services/draft-utils";
import { loadDraftById, type LoadedDraftResult } from "../services/load-draft";
import type { SectionLockRecord } from "../services/locks";
import type {
  BuilderPage,
  DraftImageAsset,
  DraftState,
  FooterModule,
  BuilderStylesMode,
  SiteAccessRole
} from "../services/types";
import { getPageSafeSlug, normalizePageSlug } from "../services/utils";
import type { NoticeKind } from "../../../../../types/notice";

type UseSiteBuilderDraftLifecycleParams = {
  builderRoutePath: string;
  draftId: string | null;
  sessionResolved: boolean;
  sessionUserId: string | null;
  defaultHomeContent: string;
  defaultTokensCss: string;
  defaultStylesMode: BuilderStylesMode;
  defaultBaseStructureCss: string;
  defaultBaseGlobalCss: string;
  activePreviewSlug: string;
  currentDraftSignature: string;
  draftState: DraftState | null;
  isDraftLoading: boolean;
  navigate: NavigateFunction;
  resetCollaborators: () => void;
  setNotice: Dispatch<SetStateAction<string | null>>;
  setNoticeKind: Dispatch<SetStateAction<NoticeKind>>;
  setDraftState: Dispatch<SetStateAction<DraftState | null>>;
  setSiteAccessRole: Dispatch<SetStateAction<SiteAccessRole | null>>;
  setDraftImages: Dispatch<SetStateAction<DraftImageAsset[]>>;
  setPages: Dispatch<SetStateAction<BuilderPage[]>>;
  setDraftPageSlugs: Dispatch<SetStateAction<string[]>>;
  setActivePreviewSlug: Dispatch<SetStateAction<string>>;
  setSiteTitle: Dispatch<SetStateAction<string>>;
  setHeaderDisabled: Dispatch<SetStateAction<boolean>>;
  setHeaderFixed: Dispatch<SetStateAction<boolean>>;
  setHeaderBrandText: Dispatch<SetStateAction<string>>;
  setHeaderBrandDisabled: Dispatch<SetStateAction<boolean>>;
  setSiteDescription: Dispatch<SetStateAction<string>>;
  setSiteUrl: Dispatch<SetStateAction<string>>;
  setTokensCss: Dispatch<SetStateAction<string>>;
  setStyleMode: Dispatch<SetStateAction<BuilderStylesMode>>;
  setAdvancedStructureCss: Dispatch<SetStateAction<string>>;
  setBaseStructureCss: Dispatch<SetStateAction<string>>;
  setBaseGlobalCss: Dispatch<SetStateAction<string>>;
  setSiteImagePreview: Dispatch<SetStateAction<string | null>>;
  setDraftImageUrl: Dispatch<SetStateAction<string | null>>;
  setFooterDisabled: Dispatch<SetStateAction<boolean>>;
  setFooterFixed: Dispatch<SetStateAction<boolean>>;
  setFooterModules: Dispatch<SetStateAction<FooterModule[]>>;
  setIsDraftLoading: Dispatch<SetStateAction<boolean>>;
  setDraftLoadError: Dispatch<SetStateAction<string | null>>;
  setIsPageEditingMode: Dispatch<SetStateAction<boolean>>;
  setLastSavedDraftSignature: Dispatch<SetStateAction<string>>;
  setSectionLocks: Dispatch<SetStateAction<SectionLockRecord>>;
  hasInitializedHeaderBrandRef: MutableRefObject<boolean>;
  cleanedPublishedDraftIdRef: MutableRefObject<string | null>;
  shouldCaptureLoadedDraftSignatureRef: MutableRefObject<boolean>;
  touchedPageSlugsRef: MutableRefObject<Set<string>>;
  deletedPageSlugsRef: MutableRefObject<Set<string>>;
};

type ApplyLoadedDraftOptions = {
  preserveActivePreviewSlug?: boolean;
  preservedPreviewSlug?: string;
};

export const useSiteBuilderDraftLifecycle = ({
  builderRoutePath,
  draftId,
  sessionResolved,
  sessionUserId,
  defaultHomeContent,
  defaultTokensCss,
  defaultStylesMode,
  defaultBaseStructureCss,
  defaultBaseGlobalCss,
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
  setIsDraftLoading,
  setDraftLoadError,
  setIsPageEditingMode,
  setLastSavedDraftSignature,
  setSectionLocks,
  hasInitializedHeaderBrandRef,
  cleanedPublishedDraftIdRef,
  shouldCaptureLoadedDraftSignatureRef,
  touchedPageSlugsRef,
  deletedPageSlugsRef
}: UseSiteBuilderDraftLifecycleParams) => {
  const applyLoadedDraft = useCallback(
    (loaded: LoadedDraftResult, options: ApplyLoadedDraftOptions = {}) => {
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
        hasInitializedHeaderBrandRef.current = true;
      } else if (!hasInitializedHeaderBrandRef.current) {
        setHeaderBrandText(loaded.siteTitle?.trim() || "New Astro Site");
        hasInitializedHeaderBrandRef.current = true;
      }

      if (typeof loaded.siteDescription === "string") setSiteDescription(loaded.siteDescription);
      if (typeof loaded.siteUrl === "string") setSiteUrl(loaded.siteUrl);
      setTokensCss(typeof loaded.tokensCss === "string" ? loaded.tokensCss : defaultTokensCss);
      setStyleMode(loaded.styleMode ?? defaultStylesMode);
      setAdvancedStructureCss(
        typeof loaded.advancedStructureCss === "string" ? loaded.advancedStructureCss : ""
      );
      setBaseStructureCss(
        typeof loaded.baseStructureCss === "string" ? loaded.baseStructureCss : defaultBaseStructureCss
      );
      setBaseGlobalCss(
        typeof loaded.baseGlobalCss === "string" ? loaded.baseGlobalCss : defaultBaseGlobalCss
      );
      if (typeof loaded.siteImagePreview === "string") setSiteImagePreview(loaded.siteImagePreview);
      if (typeof loaded.draftImageUrl === "string") setDraftImageUrl(loaded.draftImageUrl);

      if (loaded.footer) {
        setFooterDisabled(loaded.footer.disabled);
        setFooterFixed(loaded.footer.fixed);
        setFooterModules(normalizeFooterModules(loaded.footer.modules));
      } else {
        setFooterModules([...DEFAULT_FOOTER_MODULES]);
      }

      shouldCaptureLoadedDraftSignatureRef.current = true;
    },
    [
      deletedPageSlugsRef,
      hasInitializedHeaderBrandRef,
      setActivePreviewSlug,
      setDraftImageUrl,
      setDraftImages,
      setDraftPageSlugs,
      setDraftState,
      setFooterDisabled,
      setFooterFixed,
      setFooterModules,
      setHeaderBrandDisabled,
      setHeaderBrandText,
      setHeaderDisabled,
      setHeaderFixed,
      setPages,
      setSiteAccessRole,
      setSiteDescription,
      setSiteImagePreview,
      setSiteTitle,
      setSiteUrl,
      setStyleMode,
      setAdvancedStructureCss,
      setBaseStructureCss,
      setBaseGlobalCss,
      setTokensCss,
      shouldCaptureLoadedDraftSignatureRef,
      touchedPageSlugsRef,
      defaultTokensCss,
      defaultStylesMode,
      defaultBaseStructureCss,
      defaultBaseGlobalCss
    ]
  );

  useEffect(() => {
    if (!draftId) {
      setIsDraftLoading(false);
      setDraftLoadError(null);
      setDraftImages([]);
      setSiteAccessRole(null);
      setTokensCss(defaultTokensCss);
      setStyleMode(defaultStylesMode);
      setAdvancedStructureCss("");
      setBaseStructureCss(defaultBaseStructureCss);
      setBaseGlobalCss(defaultBaseGlobalCss);
      setIsPageEditingMode(false);
      setLastSavedDraftSignature("");
      setSectionLocks({});
      resetCollaborators();
      cleanedPublishedDraftIdRef.current = null;
      shouldCaptureLoadedDraftSignatureRef.current = false;
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
    shouldCaptureLoadedDraftSignatureRef.current = false;
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
          navigate(`${builderRoutePath}?draftId=${loaded.resolvedDraftId}`, { replace: true });
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
  }, [
    applyLoadedDraft,
    builderRoutePath,
    cleanedPublishedDraftIdRef,
    defaultHomeContent,
    defaultTokensCss,
    defaultStylesMode,
    defaultBaseStructureCss,
    defaultBaseGlobalCss,
    deletedPageSlugsRef,
    draftId,
    navigate,
    resetCollaborators,
    sessionResolved,
    sessionUserId,
    setDraftImages,
    setDraftLoadError,
    setTokensCss,
    setStyleMode,
    setAdvancedStructureCss,
    setBaseStructureCss,
    setBaseGlobalCss,
    setIsDraftLoading,
    setIsPageEditingMode,
    setLastSavedDraftSignature,
    setSectionLocks,
    setSiteAccessRole,
    shouldCaptureLoadedDraftSignatureRef,
    touchedPageSlugsRef
  ]);

  const reloadLatestDraftAfterConflict = useCallback(async () => {
    if (!draftId || !sessionUserId) return;

    setIsDraftLoading(true);
    setDraftLoadError(null);
    shouldCaptureLoadedDraftSignatureRef.current = false;

    try {
      const loaded = await loadDraftById({
        draftId,
        defaultHomeContent,
        userId: sessionUserId
      });
      applyLoadedDraft(loaded);
      if (loaded.resolvedDraftId && loaded.resolvedDraftId !== draftId) {
        navigate(`${builderRoutePath}?draftId=${loaded.resolvedDraftId}`, { replace: true });
      }
      setNotice("Draft changed since your last save. Loaded the latest version.");
      setNoticeKind("error");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Failed to reload draft.";
      setDraftLoadError(message);
      setNotice(message);
      setNoticeKind("error");
    } finally {
      setIsDraftLoading(false);
    }
  }, [
    applyLoadedDraft,
    builderRoutePath,
    defaultHomeContent,
    draftId,
    navigate,
    sessionUserId,
    setDraftLoadError,
    setIsDraftLoading,
    setNotice,
    setNoticeKind,
    shouldCaptureLoadedDraftSignatureRef
  ]);

  const refreshDraftAfterSectionChange = useCallback(
    async (options: { preservedPreviewSlug?: string } = {}) => {
      if (!draftState?.id || !sessionUserId) return;
      setIsDraftLoading(true);
      setDraftLoadError(null);
      shouldCaptureLoadedDraftSignatureRef.current = false;
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
          navigate(`${builderRoutePath}?draftId=${loaded.resolvedDraftId}`, { replace: true });
        }
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "Failed to refresh draft state.";
        setNotice(message);
        setNoticeKind("error");
      } finally {
        setIsDraftLoading(false);
      }
    },
    [
      activePreviewSlug,
      applyLoadedDraft,
      builderRoutePath,
      defaultHomeContent,
      draftState?.id,
      navigate,
      sessionUserId,
      setDraftLoadError,
      setIsDraftLoading,
      setNotice,
      setNoticeKind,
      shouldCaptureLoadedDraftSignatureRef
    ]
  );

  useEffect(() => {
    if (!shouldCaptureLoadedDraftSignatureRef.current) return;
    if (isDraftLoading || !draftState) return;
    setLastSavedDraftSignature(currentDraftSignature);
    shouldCaptureLoadedDraftSignatureRef.current = false;
  }, [
    currentDraftSignature,
    draftState,
    isDraftLoading,
    setLastSavedDraftSignature,
    shouldCaptureLoadedDraftSignatureRef
  ]);

  return {
    reloadLatestDraftAfterConflict,
    refreshDraftAfterSectionChange
  };
};
